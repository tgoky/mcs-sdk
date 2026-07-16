import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// POST, not GET — see the comment in the Klaviyo sibling route
// (src/app/api/integrations/klaviyo/lists/route.ts) for why the key moved
// out of the URL query string.
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body?.key === "string" ? body.key : null;
    const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl : null;

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