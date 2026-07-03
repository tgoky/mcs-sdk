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
    const locationId = searchParams.get("locationId");

    if (!apiKey || !locationId) {
      return NextResponse.json({ error: "Missing API Key or Location ID" }, { status: 400 });
    }

    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${locationId}/workflows/`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "Unknown");
      return NextResponse.json(
        { error: `GHL API rejected request [${res.status}]: ${errorBody}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    
    const workflows = (payload.workflows ?? []).map((item: any) => ({
      id: item.id,
      name: item.name ?? "Unnamed Workflow",
    }));

    return NextResponse.json({ success: true, workflows });
  } catch (err: any) {
    console.error("[ghl workflows proxy exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}