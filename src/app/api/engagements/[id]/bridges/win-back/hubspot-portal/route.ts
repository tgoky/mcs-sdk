import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { hasCredential, resolveCredential } from "@/lib/credentials";

export const runtime = "nodejs";
export const revalidate = 0;

// Derives the HubSpot Portal ID from the account's own Account Info API
// instead of asking the operator to go dig it out of HubSpot's Account
// Setup screen and paste it back. Same token already saved for
// email_platform "hubspot" (resolveCredential(id, "hubspot")) — this is
// the one HubSpot call every native-inbound-reply engagement needs
// anyway, just moved before save instead of only mattering when a
// mismatched portal id silently drops inbound webhook events (see
// src/app/api/webhooks/hubspot-conversations/route.ts's portal lookup).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
      .select({ engagementId: engagements.engagementId })
      .from(engagements)
      .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    if (!(await hasCredential(id, "hubspot"))) {
      return NextResponse.json({ error: "No HubSpot credential saved for this engagement yet. Connect it first." }, { status: 400 });
    }

    const token = await resolveCredential(id, "hubspot");
    const res = await fetch("https://api.hubapi.com/account-info/v3/details", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `HubSpot rejected the account-info lookup [${res.status}]: ${body.slice(0, 300)}. The connected key may be missing the "account-info.security.read" scope. Enter the Portal ID by hand instead.` },
        { status: res.status }
      );
    }

    const data = await res.json();
    if (data?.portalId == null) {
      return NextResponse.json({ error: "HubSpot's account-info response had no portalId." }, { status: 502 });
    }

    return NextResponse.json({ success: true, portalId: String(data.portalId) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/win-back/hubspot-portal]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
