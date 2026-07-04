import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get("key");

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