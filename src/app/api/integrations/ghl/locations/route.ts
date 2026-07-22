import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// POST, not GET — see the comment in the Klaviyo sibling route
// (src/app/api/integrations/klaviyo/lists/route.ts) for why the key moved
// out of the URL query string.
//
// This does NOT list every location on the account. There is no plain
// GET /locations/ endpoint in GHL's v2 API, and the closest thing to it
// (POST /locations/search) only works for Agency-level credentials — a
// Private Integration Token, which is what users generate from inside a
// single sub-account (as shown in GHL's own Private Integrations screen),
// is scoped to exactly that one sub-account and has no visibility into
// any others. So instead of offering a "choose your location" dropdown,
// this verifies the single Location ID the user gives us via
// GET /locations/{locationId}, which IS reachable with a Private
// Integration Token, and echoes back its name so the UI can confirm the
// token and the ID actually match.
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const apiKey = typeof body?.key === "string" ? body.key : null;
    const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : null;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 400 });
    }
    if (!locationId) {
      return NextResponse.json({ error: "Missing Location ID" }, { status: 400 });
    }

    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`,
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
        { error: `GHL rejected key/location [${res.status}]: ${errorBody}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    // The v2 "Get Location" response nests the record under `location`;
    // fall back to the bare payload in case that ever changes.
    const location = payload.location ?? payload;

    return NextResponse.json({
      success: true,
      location: { id: location.id ?? locationId, name: location.name ?? "Unnamed Location" },
    });
  } catch (err: any) {
    console.error("[ghl location verify exception]:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}