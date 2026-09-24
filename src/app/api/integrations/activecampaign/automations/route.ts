import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";
import { activeCampaignApiBase, ACTIVECAMPAIGN_URL_HINT } from "@/lib/outbound-urls";

export const runtime = "nodejs";

// Sibling of lists/route.ts — same key/vaultId/baseUrl handling, listing
// automations instead of lists so the Recovery Automation ID field can be
// a picker instead of a hand-typed numeric id.
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

    const normalizedBaseUrl = activeCampaignApiBase(baseUrl);
    if (!normalizedBaseUrl) {
      return NextResponse.json({ error: ACTIVECAMPAIGN_URL_HINT }, { status: 400 });
    }

    const res = await fetch(`${normalizedBaseUrl}/automations?limit=100`, {
      headers: {
        "Api-Token": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `ActiveCampaign turned the key down (${res.status}).` }, { status: res.status === 401 || res.status === 403 ? 401 : 502 });
    }

    const payload = await res.json();
    const automations = (payload.automations ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Unnamed Automation",
    }));

    return NextResponse.json({ success: true, automations });
  } catch (err: any) {
    console.error("[activecampaign automations proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
