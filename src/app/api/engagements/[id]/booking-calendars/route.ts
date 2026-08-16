import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { fetchBookingOptions } from "@/lib/platforms/booking";

export const runtime = "nodejs";

/**
 * Live calendar/event-type listing for an ALREADY-ONBOARDED engagement —
 * powers the dropdown in Edit Stack Settings. Resolves the stored,
 * encrypted credential server-side (via resolveCredential) instead of
 * requiring the buyer to re-paste their API key just to fix a
 * misconfigured calendar. This is the same root-cause fix as the
 * new-engagement wizard's dropdown: present real calendars by name and
 * write back a verified ID, instead of a hand-typed raw ID that
 * resolveCalendarId() falls back to guessing when it's missing.
 *
 * ?locationId= lets the caller preview options for a Location ID that's
 * been typed into the form but not saved yet; falls back to the stored
 * value when omitted.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ stack: engagements.stack })
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
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const stack = (row.stack as EngagementStack | null) ?? null;
    if (!stack?.booking_platform) {
      return NextResponse.json({ error: "No booking platform configured for this engagement yet." }, { status: 409 });
    }
    if (!stack.booking_platform_credentials_ref) {
      return NextResponse.json(
        { error: "No booking credential saved yet — save your API key in Update credentials first." },
        { status: 409 }
      );
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get("locationId")?.trim() || stack.booking_platform_meta?.location_id;

    const apiKey = await resolveCredential(id, stack.booking_platform);
    const options = await fetchBookingOptions(stack.booking_platform, apiKey, locationId);

    return NextResponse.json({ success: true, options });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[engagements/[id]/booking-calendars]", message);
    return NextResponse.json({ error: message || "Failed to load calendars." }, { status: 500 });
  }
}