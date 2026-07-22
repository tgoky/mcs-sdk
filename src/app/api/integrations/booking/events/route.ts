import { NextResponse } from "next/server";
import { fetchWithTimeout } from "@/lib/http";
import { CalendlyClient } from "@/lib/platforms/booking";

export async function POST(request: Request) {
  try {
    const { platform, apiKey, locationId } = await request.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "API Key is required" }, { status: 400 });
    }

    const cleanKey = apiKey.trim();

    // 1. Calendly Event Types
    if (platform === "calendly") {
      const client = new CalendlyClient(cleanKey);
      const orgUri = await client.getCurrentOrganization();

      const res = await fetchWithTimeout(
        `https://api.calendly.com/event_types?organization=${encodeURIComponent(orgUri)}&active=true`,
        { headers: { Authorization: `Bearer ${cleanKey}` } }
      );

      if (!res.ok) {
        throw new Error(`Calendly event fetch failed [${res.status}]`);
      }

      const data = await res.json();
      const options = (data.collection ?? []).map((e: any) => ({
        id: e.uri.split("/").pop(),
        name: e.name,
        link: e.landing_page_url,
      }));

      return NextResponse.json({ success: true, options });
    }

    // 2. Cal.com Event Types
    if (platform === "cal_com") {
      const res = await fetchWithTimeout("https://api.cal.com/v2/event-types", {
        headers: {
          "cal-api-v2-key": cleanKey,
          "cal-api-version": "2024-08-13",
        },
      });

      if (!res.ok) {
        throw new Error(`Cal.com event fetch failed [${res.status}]`);
      }

      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : data.data?.eventTypes ?? [];
      const options = list.map((e: any) => ({
        id: String(e.id),
        name: e.title || e.slug,
        link: `https://cal.com/${e.owner?.username || "user"}/${e.slug}`,
      }));

      return NextResponse.json({ success: true, options });
    }

    // 3. GoHighLevel Calendars
    if (platform === "ghl_calendar" && locationId) {
      const res = await fetchWithTimeout(
        `https://services.leadconnectorhq.com/calendars/?locationId=${encodeURIComponent(locationId)}`,
        {
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            Version: "2021-07-28",
          },
        }
      );

      if (!res.ok) {
        throw new Error(`GHL calendar fetch failed [${res.status}]`);
      }

      const data = await res.json();
      const options = (data.calendars ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        link: c.widgetUrl || `https://api.leadconnectorhq.com/widget/booking/${c.id}`,
      }));

      return NextResponse.json({ success: true, options });
    }

    // 4. OnceHub Booking Pages
    if (platform === "oncehub") {
      const res = await fetchWithTimeout("https://api.oncehub.com/v2/booking-pages?limit=100", {
        headers: { "API-Key": cleanKey },
      });

      if (!res.ok) {
        throw new Error(`OnceHub booking pages fetch failed [${res.status}]`);
      }

      const data = await res.json();
      const options = (data.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name || p.id,
        link: p.public_url || "",
      }));

      return NextResponse.json({ success: true, options });
    }

    return NextResponse.json({ success: true, options: [] });
  } catch (err: any) {
    console.error("[api/integrations/booking/events]", err.message);
    return NextResponse.json({ error: err.message || "Failed to resolve booking events" }, { status: 500 });
  }
}