import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Win-Back's hinges — reschedule_mode, no-show tagging, and reply
 * detection (+ HubSpot portal id it needs for native reply detection).
 * Verified via the snake_case stack key, not the camelCase form name —
 * all four resolve to src/features/win-back/server alone.
 *
 * Unlike Pin-Down, these are NOT a gate on enabling: every field has a
 * sane, genuinely-usable default (see DEFAULT_FORM in the wizard's
 * constants.ts) and Win-Back already waits on its own trigger (the
 * outcome-resolution webhook/cron). So this is an optional review/edit
 * screen, reachable anytime from the engagement detail page — enabling
 * Win-Back through the generic toggle route works with defaults with no
 * detour here required. SKILL_MANIFEST["win-back"].runOnSetup stays
 * false for exactly this reason.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ buyer: engagements.buyer, stack: engagements.stack })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({
    buyer: row.buyer,
    rescheduleMode: row.stack?.reschedule_mode ?? "time_slots",
    recoveredFromNoShowTaggingEnabled: row.stack?.recovered_from_no_show_tagging_enabled ?? true,
    inboundReplyMode: row.stack?.inbound_reply_mode ?? "none",
    hubspotPortalId: row.stack?.hubspot_portal_id ?? "",
    // For the "on {platform}" label and the native-mode HubSpot check —
    // emailPlatform itself is a shared connection, owned by the general
    // wizard / edit-stack-settings, not this route.
    emailPlatform: row.stack?.email_platform ?? "",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const rescheduleMode: "fresh_link" | "time_slots" = body.rescheduleMode === "fresh_link" ? "fresh_link" : "time_slots";
    const recoveredFromNoShowTaggingEnabled: boolean = body.recoveredFromNoShowTaggingEnabled !== false;
    const inboundReplyMode: "native" | "forwarding" | "none" =
      body.inboundReplyMode === "native" || body.inboundReplyMode === "forwarding" ? body.inboundReplyMode : "none";
    const hubspotPortalId: string = typeof body.hubspotPortalId === "string" ? body.hubspotPortalId.trim() : "";

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    if (inboundReplyMode === "native" && row.stack?.email_platform === "hubspot" && !hubspotPortalId) {
      return NextResponse.json(
        { error: "HubSpot Portal ID is required for native reply detection." },
        { status: 400 }
      );
    }

    const mergedStack = {
      ...(row.stack ?? {}),
      reschedule_mode: rescheduleMode,
      recovered_from_no_show_tagging_enabled: recoveredFromNoShowTaggingEnabled,
      inbound_reply_mode: inboundReplyMode,
      ...(inboundReplyMode === "native" ? { hubspot_portal_id: hubspotPortalId } : {}),
    } as EngagementStack;

    await db
      .update(engagements)
      .set({ stack: mergedStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/win-back]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}