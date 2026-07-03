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

    const res = await fetch("https://a.klaviyo.com/api/lists/?page[size]=100", {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Revision: "2024-10-15",
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

    const payload = await res.json();
    
    const lists = (payload.data ?? []).map((item: any) => ({
      id: item.id,
      name: item.attributes?.name ?? "Unnamed List",
    }));

    return NextResponse.json({ success: true, lists });
  } catch (err: any) {
    console.error("[klaviyo proxy routing exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}