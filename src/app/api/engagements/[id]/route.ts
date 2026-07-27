import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const revalidate = 0;

/**
 * Used by the engagements/new setup flow to fetch the final result
 * (confirmationPageUrl, deployment mode, paste-ready HTML if applicable)
 * once its pin-down run finishes — see the polling logic in
 * src/app/dashboard/engagements/new/page.tsx. These fields used to come
 * back synchronously in the POST /api/engagements/setup response; now that
 * setup runs asynchronously via Inngest, the client needs a way to fetch
 * them after the fact.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      confirmationPageUrl: engagements.confirmationPageUrl,
      confirmationPageDeployment: engagements.confirmationPageDeployment,
      pasteReadyHtml: engagements.pasteReadyHtml,
      pasteReadyInstructions: engagements.pasteReadyInstructions,
      pinDownScriptPack: engagements.pinDownScriptPack,
      pinDownPageAudit: engagements.pinDownPageAudit,
      pausedAt: engagements.pausedAt,
      pausedReason: engagements.pausedReason,
    })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ engagement: row });
}

const EDITABLE_BOOKING_PLATFORMS = [
  "calendly",
  "cal_com",
  "ghl_calendar",
  "oncehub",
  "discover_from_docs",
  "unsupported",
] as const;

const EDITABLE_EMAIL_PLATFORMS = [
  "klaviyo",
  "hubspot",
  "activecampaign",
  "convertkit",
  "mailchimp",
  "smtp",
] as const;

const EDITABLE_WEBHOOK_MODES = ["webhook", "polling", "none"] as const;

/**
 * Edits the handful of stack fields that actually cause the "someone
 * fat-fingered onboarding" scenario — booking_platform, its meta (e.g. GHL
 * location_id/calendar_id), how it receives booking events, and
 * email_platform. Deliberately NOT a general-purpose "PATCH the whole
 * stack blob" endpoint: accepting an arbitrary merge would let a stray
 * client bug silently overwrite server-managed fields (hosting config,
 * discovery results, credentials refs) that have nothing to do with what
 * this form edits. Everything else on `stack` is left untouched.
 *
 * Also handles restoring a soft-deleted engagement (`{ restore: true }`) —
 * see DELETE below for why deletion is soft.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const [existing] = await db
      .select({ stack: engagements.stack, deletedAt: engagements.deletedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    if (body.restore === true) {
      if (!existing.deletedAt) {
        return NextResponse.json({ error: "Not deleted." }, { status: 409 });
      }
      await db
        .update(engagements)
        .set({ deletedAt: null, pausedAt: null, pausedReason: null, updatedAt: new Date() })
        .where(eq(engagements.engagementId, id));
      return NextResponse.json({ ok: true });
    }

    const incoming = body.stack;
    if (!incoming || typeof incoming !== "object") {
      return NextResponse.json({ error: "Missing stack edits." }, { status: 400 });
    }

    if (
      incoming.booking_platform !== undefined &&
      !EDITABLE_BOOKING_PLATFORMS.includes(incoming.booking_platform)
    ) {
      return NextResponse.json({ error: `Invalid booking_platform: ${incoming.booking_platform}` }, { status: 400 });
    }
    if (
      incoming.email_platform !== undefined &&
      incoming.email_platform !== null &&
      !EDITABLE_EMAIL_PLATFORMS.includes(incoming.email_platform)
    ) {
      return NextResponse.json({ error: `Invalid email_platform: ${incoming.email_platform}` }, { status: 400 });
    }
    if (
      incoming.webhook_receiver_mode !== undefined &&
      incoming.webhook_receiver_mode !== null &&
      !EDITABLE_WEBHOOK_MODES.includes(incoming.webhook_receiver_mode)
    ) {
      return NextResponse.json({ error: `Invalid webhook_receiver_mode: ${incoming.webhook_receiver_mode}` }, { status: 400 });
    }
    if (incoming.booking_platform_meta !== undefined && typeof incoming.booking_platform_meta !== "object") {
      return NextResponse.json({ error: "booking_platform_meta must be an object." }, { status: 400 });
    }

    const currentStack = (existing.stack as EngagementStack | null) ?? ({} as EngagementStack);
    const nextStack: EngagementStack = {
      ...currentStack,
      ...(incoming.booking_platform !== undefined ? { booking_platform: incoming.booking_platform } : {}),
      ...(incoming.email_platform !== undefined ? { email_platform: incoming.email_platform } : {}),
      ...(incoming.webhook_receiver_mode !== undefined ? { webhook_receiver_mode: incoming.webhook_receiver_mode } : {}),
      ...(incoming.booking_platform_meta !== undefined
        ? { booking_platform_meta: { ...currentStack.booking_platform_meta, ...incoming.booking_platform_meta } }
        : {}),
    };

    await db
      .update(engagements)
      .set({ stack: nextStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true, stack: nextStack });
  } catch (err) {
    console.error("[engagements/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update engagement." }, { status: 500 });
  }
}

/**
 * Soft delete only — sets deletedAt (and pausedAt, so every cron's
 * existing isEngagementPaused check skips it immediately as a second,
 * independent guarantee beyond the deletedAt filters on list queries).
 * Never a hard DELETE FROM: every engagement-scoped table's FK constraint
 * is ON DELETE NO ACTION (see drizzle/migrations/0000_bizarre_quasar.sql
 * onward), so a literal delete would throw a foreign-key violation the
 * instant this engagement had so much as one skill run or stored
 * credential — which is to say, always, in practice. Reversible via
 * PATCH { restore: true } for exactly that reason: this is meant to
 * recover from an onboarding mistake, not to be a point of no return.
 * Requires the buyer's name as a confirmation echo — belt-and-suspenders
 * under whatever confirm step the UI already has, since this shouldn't be
 * triggerable by a stray retry or an unguarded API call.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmBuyerName = typeof body?.confirmBuyerName === "string" ? body.confirmBuyerName.trim() : "";

    const [existing] = await db
      .select({ buyer: engagements.buyer, deletedAt: engagements.deletedAt })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ error: "Already deleted." }, { status: 409 });
    }
    if (confirmBuyerName !== existing.buyer) {
      return NextResponse.json(
        { error: "Confirmation text didn't match the client name." },
        { status: 400 }
      );
    }

    const now = new Date();
    await db
      .update(engagements)
      .set({ deletedAt: now, pausedAt: now, pausedReason: "Deleted", updatedAt: now })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[engagements/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete engagement." }, { status: 500 });
  }
}
