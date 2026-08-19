import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { resolveVaultCredentialValue, vaultCredentialBelongsToTenant } from "@/lib/credentials";

export const runtime = "nodejs";

// POST, not GET: the API key lived in the URL query string here (and in
// the three sibling integration proxy routes), which lands it in Vercel
// access logs, browser history, and any Referer header a downstream
// request happens to send. Body isn't logged the same way, so the key
// moves there instead. Client caller updated in
// src/app/dashboard/engagements/new/page.tsx to match.
//
// Also accepts `vaultId` in place of `key` — the wizard's "reuse a saved
// credential" mode never has the plaintext, only the saved row's id.
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

    // Klaviyo caps page[size] at 10 for the Lists endpoint (this varies by
    // endpoint — Lists is one of the tighter ones). Paginate via links.next
    // instead of requesting a bigger page, so accounts with more than 10
    // lists still get the full set.
    const lists: { id: string; name: string }[] = [];
    let url: string | null = "https://a.klaviyo.com/api/lists/?page[size]=10";
    let pagesFetched = 0;
    const MAX_PAGES = 20; // safety cap: 200 lists is far beyond any real account

    while (url && pagesFetched < MAX_PAGES) {
      const res: Response = await fetch(url, {
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          Revision: "2025-04-15",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "Unknown");
        return NextResponse.json(
          { error: `Klaviyo API rejected key [${res.status}]: ${errorBody}` },
          { status: res.status }
        );
      }

      const payload: { data?: Array<{ id: string; attributes?: { name?: string } }>; links?: { next?: string | null } } =
        await res.json();
      for (const item of payload.data ?? []) {
        lists.push({ id: item.id, name: item.attributes?.name ?? "Unnamed List" });
      }

      url = payload.links?.next ?? null;
      pagesFetched++;
    }

    return NextResponse.json({ success: true, lists });
  } catch (err: any) {
    console.error("[klaviyo proxy routing exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}