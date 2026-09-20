import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";

export const runtime = "nodejs";

// See forms/route.ts (its sibling) for the key/vaultId + POST-not-GET
// conventions this mirrors exactly.
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

    let apiKey: string | null = rawKey;
    if (!apiKey && vaultId) {
      const owned = await vaultCredentialBelongsToTenant(vaultId, activeWorkspace.workspaceId);
      if (!owned) {
        return NextResponse.json({ error: "Saved credential not found or access denied." }, { status: 404 });
      }
      apiKey = await resolveVaultCredentialValue(vaultId);
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key parameter" }, { status: 400 });
    }

    const res = await fetch(`https://api.convertkit.com/v3/tags?api_key=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Unknown");
      return NextResponse.json({ error: `ConvertKit API rejected key [${res.status}]: ${errorBody}` }, { status: res.status });
    }

    const payload: { tags?: Array<{ id: number; name?: string }> } = await res.json();
    const tags = (payload.tags ?? []).map((t) => ({ id: String(t.id), name: t.name ?? "Unnamed Tag" }));

    return NextResponse.json({ success: true, tags });
  } catch (err: any) {
    console.error("[convertkit tags proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
