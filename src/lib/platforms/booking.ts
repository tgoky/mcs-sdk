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
   * Fetches tomorrow's scheduled events and expands each to its invitee record.
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
        triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"],
        active: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Cal.com webhook subscription failed [${res.status}]: ${await res.text()}`);
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