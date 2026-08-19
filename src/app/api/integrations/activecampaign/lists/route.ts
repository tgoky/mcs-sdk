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
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : null;

    let apiKey: string | null = rawKey;
    if (!apiKey && vaultId) {
      const owned = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
      if (!owned) {
        return NextResponse.json({ error: "Saved credential not found or access denied." }, { status: 404 });
      }
      apiKey = await resolveVaultCredentialValue(vaultId);
    }

    if (!apiKey || !baseUrl) {
      return NextResponse.json({ error: "Missing API Key or Base URL" }, { status: 400 });
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

    const res = await fetch(`${normalizedBaseUrl}/lists?limit=100`, {
      headers: {
        "Api-Token": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Unknown");
      return NextResponse.json(
        { error: `ActiveCampaign API rejected key [${res.status}]: ${errorBody}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    
    const lists = (payload.lists ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Unnamed List",
    }));

    return NextResponse.json({ success: true, lists });
  } catch (err: any) {
    console.error("[activecampaign proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}