/**
 * Booking Platform Clients
 * One implementation per supported platform. All return the same normalized shape.
 * Called by pre-call-read's roster fetch and pin-down's webhook registration.
 */

export interface NormalizedCall {
  id: string;
  name: string;
  email: string;
  company: string;
  callTime: Date;
}

// ── Calendly ──────────────────────────────────────────────────────────────

export class CalendlyClient {
  private baseUrl = "https://api.calendly.com";
  private headers: HeadersInit;

  constructor(personalAccessToken: string) {
    this.headers = {
      Authorization: `Bearer ${personalAccessToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Fleches tomorrow's scheduled events and expands each to its invitee record.
   * Calendly v2: /scheduled_events does NOT include invitee data — must call
   * /scheduled_events/{uuid}/invitees per event.
   */
  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const eventsRes = await fetch(
      `${this.baseUrl}/scheduled_events?min_start_time=${tomorrowStart.toISOString()}&max_start_time=${tomorrowEnd.toISOString()}&status=active`,
      { headers: this.headers }
    );
    if (!eventsRes.ok) {
      throw new Error(`Calendly events fetch failed [${eventsRes.status}]`);
    }
    const eventsData = await eventsRes.json();
    const results: NormalizedCall[] = [];

    for (const event of eventsData.collection ?? []) {
      const eventUuid = event.uri.split("/").pop();
      const inviteesRes = await fetch(
        `${this.baseUrl}/scheduled_events/${eventUuid}/invitees`,
        { headers: this.headers }
      );
      if (!inviteesRes.ok) continue;
      const invData = await inviteesRes.json();
      const invitee = invData.collection?.[0];
      if (!invitee) continue;

      results.push({
        id: eventUuid,
        name: invitee.name ?? "Unknown",
        email: invitee.email ?? "",
        company:
          invitee.questions_and_answers?.find((q: any) =>
            q.question.toLowerCase().includes("company")
          )?.answer ?? "Not Stated",
        callTime: new Date(event.start_time),
      });
    }
    return results;
  }

  /** Registers a webhook subscription for invitee.created and invitee.canceled. */
  async subscribeWebhook(
    organizationUri: string,
    receiverUrl: string
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/webhook_subscriptions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        url: receiverUrl,
        events: ["invitee.created", "invitee.canceled"],
        organization: organizationUri,
        scope: "organization",
      }),
    });
    if (!res.ok) {
      throw new Error(`Calendly webhook subscription failed [${res.status}]: ${await res.text()}`);
    }
    const data = await res.json();
    return data.resource?.uri ?? "";
  }

  /** Updates the post-booking redirect URL on an event type. */
  async configurePostBookingRedirect(
    eventTypeUuid: string,
    confirmationPageUrl: string
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/event_types/${eventTypeUuid}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({
        redirect_url: confirmationPageUrl,
        pass_event_details: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Calendly redirect config failed [${res.status}]: ${await res.text()}`);
    }
  }

  /**
   * Fetches the next open slots within a lookahead window, for the
   * reschedule-link pre-fetch layer. Calendly's available-times endpoint
   * caps each call's range at 7 days, which is exactly WIN-002's
   * "7-day lookahead" boundary — not a coincidence, that's the platform's
   * actual constraint driving the spec, not an arbitrary choice.
   */
  async getAvailableSlots(
    eventTypeUuid: string,
    count = 3,
    lookaheadDays = 7
  ): Promise<Date[]> {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + Math.min(lookaheadDays, 7));

    const res = await fetch(
      `${this.baseUrl}/event_type_available_times?` +
        `event_type=${encodeURIComponent(`${this.baseUrl}/event_types/${eventTypeUuid}`)}` +
        `&start_time=${start.toISOString()}&end_time=${end.toISOString()}`,
      { headers: this.headers }
    );
    if (!res.ok) {
      // Calendly returns 400 if the window is fully booked in some edge
      // cases rather than an empty array — treat any failure here as "no
      // slots" so the caller falls back to the standing booking link
      // instead of surfacing an error to the prospect.
      return [];
    }
    const data = await res.json();
    return (data.collection ?? [])
      .slice(0, count)
      .map((slot: any) => new Date(slot.start_time));
  }

  /**
   * Lightweight liveness check for the stored personal access token.
   * Hits GET /users/me — Calendly's own docs point here for exactly this
   * purpose ("To test the access token, make a call to the Get current
   * user endpoint" — developer.calendly.com/how-to-authenticate-calendly-api-via-oauth,
   * checked directly against current docs, not assumed). Throws on a
   * revoked/invalid token; resolves silently when healthy. Used by the
   * daily credential-health cron, not by any user-facing flow.
   */
  async checkCredentialHealth(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/users/me`, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Calendly token check failed [${res.status}]`);
    }
  }

  /**
   * Programmatically resolves the user's canonical current organization URI context.
   * Called by the setup route to eliminate the need for manual Org URI input.
   */
  async getCurrentOrganization(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/users/me`, { headers: this.headers });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown");
      throw new Error(
        `Calendly profile check failed [${res.status}] — check the API key. Response: ${errorText}`
      );
    }
    const data = await res.json();
    
    // Calendly returns: { resource: { current_organization: "https://api.calendly.com/organizations/xxx" } }
    const orgUri = data.resource?.current_organization;
    
    if (!orgUri) {
      throw new Error(
        "Calendly API returned no current_organization for this user. The API key may belong to a personal account without an organization, or the user may not have access to any organization."
      );
    }
    
    return orgUri;
  }

  /**
   * Programmatically matches the target Event Type UUID by scanning slugs against the standing booking link.
   * This eliminates the need for users to manually find and paste UUIDs from the Calendly UI.
   */
  async getEventTypeUuidFromSlug(
    organizationUri: string,
    standingLink: string
  ): Promise<string> {
    if (!standingLink) {
      return "";
    }

    // Normalize and extract the slug from URLs like:
    // - https://calendly.com/acme-corp/discovery-call -> "discovery-call"
    // - https://calendly.com/acme-corp/discovery-call/ -> "discovery-call"
    // - calendly.com/acme-corp/discovery-call -> "discovery-call"
    const normalizedLink = standingLink.replace(/\/+$/, "").toLowerCase();
    const urlParts = normalizedLink.split("/");
    const targetSlug = urlParts[urlParts.length - 1] ?? "";

    if (!targetSlug) {
      console.warn("[CalendlyClient] Could not extract slug from standing link:", standingLink);
      return "";
    }

    // Fetch all active event types for the organization
    const params = new URLSearchParams({
      organization: organizationUri,
      active: "true",
    });

    const res = await fetch(`${this.baseUrl}/event_types?${params.toString()}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      console.error(
        `[CalendlyClient] Failed to fetch event types [${res.status}]`
      );
      return "";
    }

    const data = await res.json();
    const eventTypes: Array<{
      uri: string;
      slug: string;
      landing_page_url: string;
      name: string;
    }> = data.collection ?? [];

    // Try to match by slug first, then by exact landing page URL
    const match = eventTypes.find(
      (e) =>
        e.slug?.toLowerCase() === targetSlug ||
        e.landing_page_url?.toLowerCase() === normalizedLink
    );

    if (match) {
      // Extract UUID from URI like: https://api.calendly.com/event_types/abc123def456
      const uuid = match.uri.split("/").pop() ?? "";
      console.log(
        `[CalendlyClient] Matched event type "${match.name}" (${uuid}) for slug "${targetSlug}"`
      );
      return uuid;
    }

    // Log available event types to help with debugging if no match found
    const availableSlugs = eventTypes.map((e) => e.slug).join(", ");
    console.warn(
      `[CalendlyClient] No event type matched slug "${targetSlug}". Available slugs: ${availableSlugs || "(none)"}`
    );

    return "";
  }
}

// ── Cal.com ───────────────────────────────────────────────────────────────

export class CalComClient {
  private baseUrl = "https://api.cal.com/v2";
  private headers: HeadersInit;

  constructor(apiKey: string) {
    this.headers = {
      // Cal.com v2: personal access tokens use cal-api-v2-key header.
      // OAuth access tokens would use Authorization: Bearer — but buyers
      // provide PATs during Pin-Down setup, so this is correct.
      "cal-api-v2-key": apiKey,
      "cal-api-version": "2024-08-13",
      "Content-Type": "application/json",
    };
  }

  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const res = await fetch(
      `${this.baseUrl}/bookings?startTime=${tomorrowStart.toISOString()}&endTime=${tomorrowEnd.toISOString()}&status=accepted`,
      { headers: this.headers }
    );
    if (!res.ok) {
      throw new Error(`Cal.com bookings fetch failed [${res.status}]`);
    }
    const data = await res.json();

    return (data.data?.bookings ?? []).map((booking: any) => {
      const attendee = booking.attendees?.[0] ?? {};
      return {
        id: String(booking.id),
        name: attendee.name ?? "Unknown",
        email: attendee.email ?? "",
        company:
          booking.responses?.company ??
          booking.responses?.organization ??
          "Not Stated",
        callTime: new Date(booking.startTime),
      };
    });
  }

  /**
   * Lightweight liveness check for the stored API key. Hits GET /v2/me —
   * Cal.com's documented "retrieve the authenticated user's profile"
   * endpoint (cal.com/docs/api-reference/v2/me, checked directly against
   * current docs). Throws on a revoked/invalid key. Used by the daily
   * credential-health cron, not by any user-facing flow.
   */
  async checkCredentialHealth(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/me`, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`Cal.com token check failed [${res.status}]`);
    }
  }

  async subscribeWebhook(receiverUrl: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/webhooks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        url: receiverUrl,
        // ✅ TYPO FIXED PERFECTLY:
        triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"],
        active: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Cal.com webhook subscription failed [${res.status}]: ${await res.text()}`);
    }
  }

  /** Fetches the next open slots for the reschedule pre-fetch layer. */
  async getAvailableSlots(
    eventTypeId: string,
    count = 3,
    lookaheadDays = 7
  ): Promise<Date[]> {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + lookaheadDays);

    const res = await fetch(
      `${this.baseUrl}/slots?eventTypeId=${eventTypeId}` +
        `&start=${start.toISOString()}&end=${end.toISOString()}`,
      { headers: this.headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Cal.com v2 groups slots by date: { data: { "2026-07-05": [{start: "..."}], ... } }
    const slots: Date[] = [];
    for (const day of Object.values<any>(data.data ?? {})) {
      for (const slot of day) {
        slots.push(new Date(slot.start));
        if (slots.length >= count) return slots;
      }
    }
    return slots;
  }

  /**
   * Programmatically discovers the Cal.com username and numerical event type ID from a public standing link.
   * Eliminates manual parameter hunting by resolving identifiers against Cal.com's v2 endpoint grid.
   */
  async resolveEventMetaFromLink(standingLink: string): Promise<{ username: string; cal_event_type_id: string }> {
    if (!standingLink) {
      return { username: "", cal_event_type_id: "" };
    }

    try {
      const cleanUrl = standingLink
        .replace(/https?:\/\/(www\.)?cal\.com\//i, "")
        .replace(/\/+$/, "");
      const parts = cleanUrl.split("/");

      if (parts.length === 0) return { username: "", cal_event_type_id: "" };

      const username = parts[0];
      const targetSlug = parts[parts.length - 1]?.toLowerCase();

      const res = await fetch(`${this.baseUrl}/event-types`, { headers: this.headers });
      if (!res.ok) {
        console.warn(`[CalComClient] Failed to fetch account event types index [${res.status}]`);
        return { username, cal_event_type_id: "" };
      }

      const data = await res.json();
      const eventTypes = data.data?.eventTypes ?? data.data ?? [];

      const match = eventTypes.find((e: any) => e.slug?.toLowerCase() === targetSlug);

      return {
        username,
        cal_event_type_id: match ? String(match.id) : "",
      };
    } catch (err: any) {
      console.error("[CalComClient] Error resolving event type from link:", err.message);
      return { username: "", cal_event_type_id: "" };
    }
  }
}

// ── GoHighLevel Calendar ──────────────────────────────────────────────────

export class GHLCalendarClient {
  private baseUrl = "https://services.leadconnectorhq.com";
  private headers: HeadersInit;

  constructor(apiKey: string, private locationId: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    };
  }

  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const res = await fetch(
      `${this.baseUrl}/calendars/events?locationId=${this.locationId}&startTime=${tomorrowStart.getTime()}&endTime=${tomorrowEnd.getTime()}`,
      { headers: this.headers }
    );
    if (!res.ok) {
      throw new Error(`GHL appointments fetch failed [${res.status}]`);
    }
    const data = await res.json();

    return (data.appointments ?? []).map((appt: any) => ({
      id: appt.id,
      name: appt.contact?.name ?? "Unknown",
      email: appt.contact?.email ?? "",
      company: appt.contact?.companyName ?? "Not Stated",
      callTime: new Date(appt.startTime),
    }));
  }

  async subscribeWebhook(receiverUrl: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/locations/${this.locationId}/webhooks/`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        name: "Showtime Pre-Call Read",
        url: receiverUrl,
        events: ["AppointmentCreate", "AppointmentDelete"],
      }),
    });
    if (!res.ok) {
      throw new Error(`GHL webhook subscription failed [${res.status}]: ${await res.text()}`);
    }
  }
}

// ── OnceHub ───────────────────────────────────────────────────────────────

export class OnceHubClient {
  private baseUrl = "https://api.oncehub.com/v2";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get headers(): HeadersInit {
    return {
      "API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const res = await fetch(
      `${this.baseUrl}/bookings?starting_after=${tomorrowStart.toISOString()}&starting_before=${tomorrowEnd.toISOString()}&status=scheduled`,
      { headers: this.headers }
    );
    if (!res.ok) {
      throw new Error(`OnceHub bookings fetch failed [${res.status}]`);
    }
    const data = await res.json();

    return (data.data ?? []).map((booking: any) => ({
      id: booking.id,
      name: booking.customer?.name ?? "Unknown",
      email: booking.customer?.email ?? "",
      company: booking.form_submission?.company ?? "Not Stated",
      callTime: new Date(booking.starting_time),
    }));
  }
}

// ── Router ────────────────────────────────────────────────────────────────

export async function fetchTomorrowCallsForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta?: Record<string, any>
): Promise<NormalizedCall[]> {
  switch (bookingPlatform) {
    case "calendly":
      return new CalendlyClient(apiKey).getTomorrowCalls();

    case "cal_com":
      return new CalComClient(apiKey).getTomorrowCalls();

    case "ghl_calendar":
      if (!meta?.location_id) {
        throw new Error("GHL Calendar requires location_id in booking_platform_meta");
      }
      return new GHLCalendarClient(apiKey, meta.location_id).getTomorrowCalls();

    case "oncehub":
      return new OnceHubClient(apiKey).getTomorrowCalls();

    default:
      throw new Error(
        `Unsupported booking platform: ${bookingPlatform}. ` +
        "Supported: calendly, cal_com, ghl_calendar, oncehub"
      );
  }
}

export async function registerWebhookForTenant(
  bookingPlatform: string,
  apiKey: string,
  receiverUrl: string,
  meta?: Record<string, any>
): Promise<string | void> {
  switch (bookingPlatform) {
    case "calendly":
      if (!meta?.organization_uri) {
        throw new Error("Calendly webhook registration requires organization_uri in meta");
      }
      return new CalendlyClient(apiKey).subscribeWebhook(meta.organization_uri, receiverUrl);

    case "cal_com":
      return new CalComClient(apiKey).subscribeWebhook(receiverUrl);

    case "ghl_calendar":
      if (!meta?.location_id) {
        throw new Error("GHL webhook registration requires location_id in meta");
      }
      return new GHLCalendarClient(apiKey, meta.location_id).subscribeWebhook(receiverUrl);

    case "oncehub":
      console.warn("OnceHub does not support programmatic webhook registration. Buyer must configure manually.");
      return;

    default:
      return;
  }
}

export async function getAvailableSlotsForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta: Record<string, any> | undefined,
  count = 3,
  lookaheadDays = 7
): Promise<Date[]> {
  try {
    switch (bookingPlatform) {
      case "calendly":
        if (!meta?.event_type_uuid) return [];
        return new CalendlyClient(apiKey).getAvailableSlots(
          meta.event_type_uuid,
          count,
          lookaheadDays
        );

      case "cal_com":
        if (!meta?.cal_event_type_id) return [];
        return new CalComClient(apiKey).getAvailableSlots(
          meta.cal_event_type_id,
          count,
          lookaheadDays
        );

      default:
        return [];
    }
  } catch {
    return [];
  }
}