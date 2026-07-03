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
    const baseUrl = searchParams.get("baseUrl");

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