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

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }

    const res = await fetch("https://services.leadconnectorhq.com/locations/", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Version: "2021-07-28",
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Unknown");
      return NextResponse.json(
        { error: `GHL API rejected key [${res.status}]: ${errorBody}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    
    const locations = (payload.locations ?? []).map((item: any) => ({
      id: item.id,
      name: item.name ?? "Unnamed Location",
    }));

    return NextResponse.json({ success: true, locations });
  } catch (err: any) {
    console.error("[ghl locations proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}