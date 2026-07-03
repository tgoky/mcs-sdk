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

  async subscribeWebhook(receiverUrl: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/webhooks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        url: receiverUrl,
        triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHRESHEDULED"],
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
    // GHL uses a global webhook config at the location level
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

/**
 * Given a tenant's stack config and resolved credential,
 * returns tomorrow's calls using the appropriate platform client.
 */
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

/**
 * Registers a webhook for a booking platform during Pin-Down setup.
 * Returns the subscription ID/URI to store on the engagement.
 */
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
      // OnceHub webhooks are configured via dashboard, not API
      console.warn("OnceHub does not support programmatic webhook registration. Buyer must configure manually.");
      return;

    default:
      return;
  }
}

/**
 * Fetches the next open slots for the win-back reschedule pre-fetch layer.
 * GHL Calendar and OnceHub don't have a documented public "free/busy" slots
 * endpoint suitable for this — rather than guess at an undocumented one,
 * they return [] here, which the caller (the reschedule redirect route)
 * treats identically to "calendar fully booked": fall back to the standard
 * booking page link, per WIN-002's own zero-slots fallback rule.
 */
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
    // Any failure here is a fallback-to-standard-link situation, never a
    // user-facing error — the prospect should always get a working link.
    return [];
  }
}