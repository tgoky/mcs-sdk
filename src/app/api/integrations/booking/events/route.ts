import { NextResponse } from "next/server";
import { fetchBookingOptions } from "@/lib/platforms/booking";

/**
 * Live calendar/event-type discovery for the NEW-engagement wizard, where
 * the buyer's API key only exists as an unsaved value in the browser (it's
 * encrypted and stored later, at /api/engagements/setup). For an already-
 * onboarded engagement, use /api/engagements/[id]/booking-calendars
 * instead — that route resolves the stored credential server-side so the
 * buyer never re-pastes a secret just to fix a calendar selection.
 */
export async function POST(request: Request) {
  try {
    const { platform, apiKey, locationId } = await request.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "API Key is required" }, { status: 400 });
    }
    if (platform === "ghl_calendar" && !locationId) {
      // Nothing to list until a Location ID is entered — not an error state.
      return NextResponse.json({ success: true, options: [] });
    }

    const options = await fetchBookingOptions(platform, apiKey, locationId);
    return NextResponse.json({ success: true, options });
  } catch (err: any) {
    console.error("[api/integrations/booking/events]", err.message);
    return NextResponse.json({ error: err.message || "Failed to resolve booking events" }, { status: 500 });
  }
}
