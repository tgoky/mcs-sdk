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