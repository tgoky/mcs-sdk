import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";

export const runtime = "nodejs";

// POST, not GET — see the comment in the Klaviyo sibling route
// (src/app/api/integrations/klaviyo/lists/route.ts) for why the key moved
// out of the URL query string. Also accepts `vaultId` in place of `key` —
// see that same route for why.
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await request.json().catch(() => ({}));
    const rawKey = typeof body?.key === "string" ? body.key : null;
    const vaultId = typeof body?.vaultId === "string" ? body.vaultId : null;
    const locationId = typeof body?.locationId === "string" ? body.locationId : null;

    let apiKey: string | null = rawKey;
    if (!apiKey && vaultId) {
      const owned = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
      if (!owned) {
        return NextResponse.json({ error: "Saved credential not found or access denied." }, { status: 404 });
      }
      apiKey = await resolveVaultCredentialValue(vaultId);
    }

    if (!apiKey || !locationId) {
      return NextResponse.json({ error: "Missing API Key or Location ID" }, { status: 400 });
    }

    // GHL's Workflows endpoint is flat (GET /workflows/) and scoped via a
    // locationId query parameter, the same pattern as Contacts, Calendars,
    // etc. — it is NOT nested under /locations/{id}/workflows/ (that path
    // doesn't exist and 404s).
    const res = await fetch(
      `https://services.leadconnectorhq.com/workflows/?locationId=${encodeURIComponent(locationId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Unknown");
      return NextResponse.json(
        { error: `GHL API rejected request [${res.status}]: ${errorBody}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    
    const workflows = (payload.workflows ?? []).map((item: any) => ({
      id: item.id,
      name: item.name ?? "Unnamed Workflow",
    }));

    return NextResponse.json({ success: true, workflows });
  } catch (err: any) {
    console.error("[ghl workflows proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}