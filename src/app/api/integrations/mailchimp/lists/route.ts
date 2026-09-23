import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";

export const runtime = "nodejs";

// POST, not GET — see the comment in the Klaviyo sibling route
// (src/app/api/integrations/klaviyo/lists/route.ts) for why the key moved
// out of the URL query string. Also accepts `vaultId` in place of `key` —
// see that same route for why.
//
// Mailchimp API keys embed their datacenter as a suffix
// (xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21) — every request has to hit that
// exact subdomain, so the datacenter is parsed off the key itself rather
// than asked for separately.
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

    const dc = apiKey.trim().split("-").pop();
    if (!dc || dc === apiKey.trim()) {
      return NextResponse.json({ error: "This doesn't look like a Mailchimp API key. It should end with a datacenter suffix like -us21." }, { status: 400 });
    }

    const lists: { id: string; name: string }[] = [];
    let offset = 0;
    const COUNT = 100;
    const MAX_PAGES = 20; // safety cap: 2000 audiences is far beyond any real account

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=${COUNT}&offset=${offset}&fields=lists.id,lists.name,total_items`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "Unknown");
        return NextResponse.json({ error: `Mailchimp API rejected key [${res.status}]: ${errorBody}` }, { status: res.status });
      }

      const payload: { lists?: Array<{ id: string; name?: string }>; total_items?: number } = await res.json();
      for (const item of payload.lists ?? []) {
        lists.push({ id: item.id, name: item.name ?? "Unnamed Audience" });
      }

      offset += COUNT;
      if (!payload.lists || payload.lists.length < COUNT || offset >= (payload.total_items ?? 0)) break;
    }

    return NextResponse.json({ success: true, lists });
  } catch (err: any) {
    console.error("[mailchimp proxy routing exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
