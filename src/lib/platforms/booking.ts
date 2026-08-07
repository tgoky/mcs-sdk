/**
 * Booking Platform Clients
 * One implementation per supported platform. All return the same normalized shape.
 * Called by pre-call-read's roster fetch and pin-down's webhook registration.
 */


import { fetchWithTimeout } from "@/lib/http";
import type { EngagementStack } from "@/models/schema";

// booking_platform_meta already has a real, per-platform-field shape
// defined once in schema.ts (EngagementStack) — reusing it here instead of
// Record<string, any> means this file can't drift from that definition,
// and callers get real autocomplete/typo-checking on meta.location_id etc.
type BookingPlatformMeta = EngagementStack["booking_platform_meta"];

// ── Platform response shapes ────────────────────────────────────────────
// These deliberately cover only the fields this file actually reads, not
// each platform's full API surface — every field is optional because
// that's the honest contract with an external API response, not because
// the shape is unknown. Previously these call sites used inline `: any`
// annotations on `.map()`/`.find()` callbacks; typing the response once
// here and casting each `res.json()` call lets TypeScript infer every
// callback parameter instead.

interface CalendlyQuestionAnswer {
  question: string;
  answer?: string;
}
interface CalendlyInvitee {
    uri?: string;
  name?: string;
  email?: string;
  text_reminder_number?: string;
  questions_and_answers?: CalendlyQuestionAnswer[];
}
interface CalendlyEvent {
  uri: string;
  start_time: string;
  // Assumed-no-show sweep false-positive fix — confirmed present on a
  // real /scheduled_events response (not assumed from the create-event
  // payload shape), same verification bar meetingUrl's location.join_url
  // got. Lets the sweep know when a call is actually scheduled to end
  // instead of guessing a flat offset from start_time.
  end_time?: string;
  location?: { join_url?: string };
}
interface CalendlyEventsResponse {
  collection?: CalendlyEvent[];
}
interface CalendlyInviteesResponse {
  collection?: CalendlyInvitee[];
}
interface CalendlySlot {
  start_time: string;
}
interface CalendlySlotsResponse {
  collection?: CalendlySlot[];
}

interface CalComAttendee {
  name?: string;
  email?: string;
  phoneNumber?: string;
}
interface CalComBookingResponses {
  company?: string;
  organization?: string;
  linkedin?: string;
  linkedInUrl?: string;
  phone?: string;
  attendeePhoneNumber?: string;
}
interface CalComBooking {
  id: string | number;
  attendees?: CalComAttendee[];
  bookingFieldsResponses?: CalComBookingResponses;
  start: string;
  // Assumed-no-show sweep false-positive fix — confirmed directly on
  // Cal.com's own "Get a booking" docs example response (GET
  // /v2/bookings/{bookingUid}), which shows `end` as a sibling field of
  // `start` on the same object, alongside a redundant `duration` (both
  // present in the real example: "start": "...", "end": "...",
  // "duration": 60). No second event-type lookup needed the way an
  // earlier pass here assumed might be necessary.
  end?: string;
  status?: string;
}
interface CalComBookingsResponse {
  data?: CalComBooking[];
}
interface CalComSlot {
  start: string;
}
interface CalComSlotsResponse {
  data?: Record<string, CalComSlot[]>;
}
interface CalComEventType {
  id: string | number;
  slug?: string;
}
interface CalComEventTypesResponse {
  data?: { eventTypes?: CalComEventType[] } | CalComEventType[];
}

interface GHLContact {
  name?: string;
  email?: string;
  companyName?: string;
  phone?: string;
}
interface GHLCalendarEvent {
  id: string;
  contactId?: string;
  startTime: string;
  // Assumed-no-show sweep false-positive fix — confirmed as a real
  // sibling field of startTime on GHL's own GET /calendars/events
  // response (the same endpoint this class already calls), verified
  // against a live documented example response, not assumed from
  // startTime's presence alone.
  endTime?: string;
  appointmentStatus?: string;
}
interface GHLCalendarEventsResponse {
  events?: GHLCalendarEvent[];
}
interface GHLCalendarListResponse {
  calendars?: { id: string; isActive?: boolean }[];
}
interface GHLContactByIdResponse {
  contact?: GHLContact;
}

interface OnceHubCustomField {
  name: string;
  value?: string;
}
interface OnceHubBooking {
  id: string;
  attendees?: string[];
  custom_fields?: OnceHubCustomField[];
  starting_time: string;
  status?: string;
}
interface OnceHubBookingsResponse {
  data?: OnceHubBooking[];
}

// Raw shape of an inbound booking-platform webhook payload — deliberately
// loose (every field optional) since the actual shape varies by platform
// and only a handful of fields are ever read here. See
// deriveWebhookIdempotencyKey below for exactly which ones.
interface WebhookPayloadShape {
  event?: string;
  trigger?: string;
  triggerEvent?: string;
  type?: string;
  id?: string;
  uid?: string;
  payload?: {
    uri?: string;
    uid?: string;
    invitee?: { uri?: string };
  };
  appointment?: { id?: string };
  calendar?: { id?: string };
  data?: { id?: string };
  booking?: { id?: string };
}

export interface NormalizedCall {
  id: string;
  name: string;
  email: string;
  company: string;
  callTime: Date;
  // Best-effort — not every booking platform/form captures phone, and
  // where it does, the field name varies wildly (Calendly buries it in a
  // free-text SMS-reminder field, not a structured phone field). SMS
  // enrollment (sms.ts) treats a missing phone as "can't send SMS to this
  // prospect" rather than a hard failure — email enrollment never depends
  // on this field.
  phone?: string;
  // Best-effort, same rationale as `phone` — only populated when the
  // booking form actually asked for a LinkedIn URL and the prospect
  // supplied one. Feeds person-match.ts's LinkedIn corroboration tier
  // (Pre-Call Read recovery gap 2); without this field that tier was
  // structurally unreachable regardless of what the prospect submitted.
  linkedInUrl?: string;
  // Only populated by listBookingsSinceForTenant (polling fallback) —
  // getTomorrowCalls callers only ever look at active bookings, so this is
  // undefined there. "created" | "cancelled", mirrors classifyBookingEvent's
  // vocabulary in enrollment-service.ts.
  eventKind?: "created" | "cancelled";
  // Tier 4 #24 — conversation intelligence hooks. Populated for Calendly
  // only in this pass (event.location.join_url, confirmed against a real
  // Calendly API response — present for conferencing-type locations like
  // Zoom/Meet/Teams, absent for phone or in-person locations). Cal.com,
  // GHL Calendar, and OnceHub don't populate this yet — see
  // conversation-intelligence.ts's module comment for why extending
  // coverage to those needs the same doc-verification this field got,
  // not a copy-paste guess.
  meetingUrl?: string;
  // Assumed-no-show sweep false-positive fix. Populated from a real
  // platform field, not guessed, for three of the four platforms:
  // Calendly (event.end_time, confirmed against a real
  // /scheduled_events response), Cal.com (booking.end, confirmed
  // against Cal.com's own "Get a booking" docs example — end sits right
  // alongside start on the same object), and GHL Calendar (event.endTime,
  // confirmed against GHL's own GET /calendars/events docs example — same
  // pattern, endTime sits right alongside startTime). OnceHub doesn't
  // populate this yet — its client class below references real fields
  // seen on a live account for start time, but no end/duration field was
  // independently confirmed on the endpoint this app actually calls, so
  // it's left undefined rather than guessed. Undefined means "duration
  // unknown," and callers must treat that as a distinct case from "known
  // to be over" — see crons.ts's sweep-window comment and
  // call-duration-estimator.ts for how the unknown case is handled.
  callEndTime?: Date;
}

// ── Calendly ──────────────────────────────────────────────────────────────

export class CalendlyClient {
  private baseUrl = "https://api.calendly.com";
  private headers: HeadersInit;
  private userUriCache: string | null = null;

  constructor(personalAccessToken: string) {
    this.headers = {
      Authorization: `Bearer ${personalAccessToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * GET /scheduled_events requires either a `user` or `organization` query
   * parameter — confirmed directly against Calendly's own community docs
   * ("the list events endpoint requires that you pass either a user or
   * organization parameter"). None of this class's three list methods
   * were sending either, which means every Calendly-based client was
   * hitting an error on every single fetch, not just an edge case. This
   * app only ever stores a personal access token (no user/org URI
   * collected anywhere in onboarding), so resolve it once via
   * GET /users/me — { resource: { uri, current_organization } } — and
   * scope every list call to that single user, which matches "a client's
   * own calendar" better than the org-wide scope would anyway.
   */
  private async resolveUserUri(): Promise<string> {
    if (this.userUriCache) return this.userUriCache;
    const res = await fetchWithTimeout(`${this.baseUrl}/users/me`, { headers: this.headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Calendly current-user fetch failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { resource?: { uri?: string } };
    if (!data.resource?.uri) {
      throw new Error("Calendly GET /users/me returned no resource.uri to scope scheduled_events to.");
    }
    this.userUriCache = data.resource.uri;
    return this.userUriCache;
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

    const userUri = await this.resolveUserUri();
    const eventsRes = await fetchWithTimeout(
      `${this.baseUrl}/scheduled_events?min_start_time=${tomorrowStart.toISOString()}&max_start_time=${tomorrowEnd.toISOString()}&status=active&user=${encodeURIComponent(userUri)}`,
      { headers: this.headers }
    );
    if (!eventsRes.ok) {
      const body = await eventsRes.text().catch(() => "");
      throw new Error(`Calendly events fetch failed [${eventsRes.status}]: ${body.slice(0, 300)}`);
    }
    const eventsData = (await eventsRes.json()) as CalendlyEventsResponse;
    const results: NormalizedCall[] = [];

    for (const event of eventsData.collection ?? []) {
      const eventUuid = event.uri.split("/").pop()!;
      const inviteesRes = await fetchWithTimeout(
        `${this.baseUrl}/scheduled_events/${eventUuid}/invitees`,
        { headers: this.headers }
      );
      if (!inviteesRes.ok) continue;
      const invData = (await inviteesRes.json()) as CalendlyInviteesResponse;
      const invitee = invData.collection?.[0];
      if (!invitee) continue;

      results.push({
        id: eventUuid,
        name: invitee.name ?? "Unknown",
        email: invitee.email ?? "",
        company:
          invitee.questions_and_answers?.find((q) =>
            q.question.toLowerCase().includes("company")
          )?.answer ?? "Not Stated",
        linkedInUrl:
          invitee.questions_and_answers?.find((q) =>
            q.question.toLowerCase().includes("linkedin") || (q.answer ?? "").includes("linkedin.com/in/")
          )?.answer ?? undefined,
        callTime: new Date(event.start_time),
        callEndTime: event.end_time ? new Date(event.end_time) : undefined,
        meetingUrl: event.location?.join_url ?? undefined,
      });
    }
    return results;
  }

  /**
   * Polling-fallback fetch for the webhook_receiver_mode === "polling" path
   * (Pin-Down recovery gap 5). Calendly's /scheduled_events list doesn't
   * expose a "created after" filter directly, so this pulls everything
   * with a start_time in [sinceISO, sinceISO + lookaheadDays] across both
   * active and canceled status, and lets the caller (booking.ts's
   * listBookingsSinceForTenant) de-dupe against webhook_events by event
   * UUID — the same idempotency key the live webhook path uses, so a
   * booking seen once by polling and later confirmed by a recovered
   * webhook subscription can never double-enroll.
   */
  async listBookingsSince(sinceISO: string, lookaheadDays = 14): Promise<NormalizedCall[]> {
    const windowEnd = new Date(sinceISO);
    windowEnd.setDate(windowEnd.getDate() + lookaheadDays);

    const results: NormalizedCall[] = [];
    const userUri = await this.resolveUserUri();

    for (const status of ["active", "canceled"] as const) {
      const eventsRes = await fetchWithTimeout(
        `${this.baseUrl}/scheduled_events?min_start_time=${sinceISO}&max_start_time=${windowEnd.toISOString()}&status=${status}&user=${encodeURIComponent(userUri)}`,
        { headers: this.headers }
      );
      if (!eventsRes.ok) continue;
      const eventsData = (await eventsRes.json()) as CalendlyEventsResponse;

      for (const event of eventsData.collection ?? []) {
        const eventUuid = event.uri.split("/").pop()!;
        const inviteesRes = await fetchWithTimeout(
          `${this.baseUrl}/scheduled_events/${eventUuid}/invitees`,
          { headers: this.headers }
        );
        if (!inviteesRes.ok) continue;
        const invData = (await inviteesRes.json()) as CalendlyInviteesResponse;
        const invitee = invData.collection?.[0];
        if (!invitee) continue;


                results.push({
          id: invitee.uri ?? eventUuid, // <--- This is all you need
          name: invitee.name ?? "Unknown",
          email: invitee.email ?? "",
          company:
            invitee.questions_and_answers?.find((q) =>
              q.question.toLowerCase().includes("company")
            )?.answer ?? "Not Stated",
          phone: invitee.text_reminder_number ?? undefined,
          callTime: new Date(event.start_time),
          callEndTime: event.end_time ? new Date(event.end_time) : undefined,
          meetingUrl: event.location?.join_url ?? undefined,
          eventKind: status === "canceled" ? "cancelled" : "created",
        });
      }
    }
    return results;
  }

  /**
   * Pre-Call Read recovery gap 1 — dynamic trigger. Same query shape as
   * getTomorrowCalls but with a caller-supplied window instead of a fixed
   * "tomorrow" — used by dynamicBriefCron to find calls that have just
   * entered the buyer's configured lead-time window, so briefs go out
   * shortly after that rather than waiting for the nightly batch.
   */
  async getUpcomingCallsWithinWindow(startHoursFromNow: number, endHoursFromNow: number): Promise<NormalizedCall[]> {
    const windowStart = new Date(Date.now() + startHoursFromNow * 3_600_000);
    const windowEnd = new Date(Date.now() + endHoursFromNow * 3_600_000);

    const userUri = await this.resolveUserUri();
    const eventsRes = await fetchWithTimeout(
      `${this.baseUrl}/scheduled_events?min_start_time=${windowStart.toISOString()}&max_start_time=${windowEnd.toISOString()}&status=active&user=${encodeURIComponent(userUri)}`,
      { headers: this.headers }
    );
    if (!eventsRes.ok) {
      const body = await eventsRes.text().catch(() => "");
      throw new Error(`Calendly events fetch failed [${eventsRes.status}]: ${body.slice(0, 300)}`);
    }
    const eventsData = (await eventsRes.json()) as CalendlyEventsResponse;
    const results: NormalizedCall[] = [];

    for (const event of eventsData.collection ?? []) {
      const eventUuid = event.uri.split("/").pop()!;
      const inviteesRes = await fetchWithTimeout(`${this.baseUrl}/scheduled_events/${eventUuid}/invitees`, { headers: this.headers });
      if (!inviteesRes.ok) continue;
      const invData = (await inviteesRes.json()) as CalendlyInviteesResponse;
      const invitee = invData.collection?.[0];
      if (!invitee) continue;

      results.push({
        id: eventUuid,
        name: invitee.name ?? "Unknown",
        email: invitee.email ?? "",
        company:
          invitee.questions_and_answers?.find((q) => q.question.toLowerCase().includes("company"))?.answer ?? "Not Stated",
        linkedInUrl:
          invitee.questions_and_answers?.find(
            (q) => q.question.toLowerCase().includes("linkedin") || (q.answer ?? "").includes("linkedin.com/in/")
          )?.answer ?? undefined,
        callTime: new Date(event.start_time),
        callEndTime: event.end_time ? new Date(event.end_time) : undefined,
        meetingUrl: event.location?.join_url ?? undefined,
      });
    }
    return results;
  }

  /** Registers a webhook subscription for invitee.created and invitee.canceled. */
  async subscribeWebhook(
    organizationUri: string,
    receiverUrl: string
  ): Promise<string> {
    const res = await fetchWithTimeout(`${this.baseUrl}/webhook_subscriptions`, {
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
    const res = await fetchWithTimeout(`${this.baseUrl}/event_types/${eventTypeUuid}`, {
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

    const res = await fetchWithTimeout(
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
    const data = (await res.json()) as CalendlySlotsResponse;
    return (data.collection ?? [])
      .slice(0, count)
      .map((slot) => new Date(slot.start_time));
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
    const res = await fetchWithTimeout(`${this.baseUrl}/users/me`, { headers: this.headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Calendly token check failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

  /**
   * Programmatically resolves the user's canonical current organization URI context.
   * Called by the setup route to eliminate the need for manual Org URI input.
   */
  async getCurrentOrganization(): Promise<string> {
    const res = await fetchWithTimeout(`${this.baseUrl}/users/me`, { headers: this.headers });
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

    const res = await fetchWithTimeout(`${this.baseUrl}/event_types?${params.toString()}`, {
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

    const res = await fetchWithTimeout(
      `${this.baseUrl}/bookings?afterStart=${tomorrowStart.toISOString()}&beforeEnd=${tomorrowEnd.toISOString()}&status=upcoming`,
      { headers: this.headers }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cal.com bookings fetch failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as CalComBookingsResponse;

    return (data.data ?? []).map((booking) => {
      const attendee = booking.attendees?.[0] ?? {};
      return {
        id: String(booking.id),
        name: attendee.name ?? "Unknown",
        email: attendee.email ?? "",
        company:
          booking.bookingFieldsResponses?.company ??
          booking.bookingFieldsResponses?.organization ??
          "Not Stated",
        linkedInUrl: booking.bookingFieldsResponses?.linkedin ?? booking.bookingFieldsResponses?.linkedInUrl ?? undefined,
        callTime: new Date(booking.start),
        callEndTime: booking.end ? new Date(booking.end) : undefined,
      };
    });
  }

  /**
   * Polling-fallback fetch (Pin-Down recovery gap 5). Cal.com v2's
   * /bookings endpoint supports afterCreatedAt directly, which is exactly
   * the "list bookings since timestamp" semantics the OG SKILL.md polling
   * fallback specifies — no client-side windowing approximation needed
   * here unlike Calendly.
   */
  async listBookingsSince(sinceISO: string): Promise<NormalizedCall[]> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/bookings?afterCreatedAt=${encodeURIComponent(sinceISO)}`,
      { headers: this.headers }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as CalComBookingsResponse;

    return (data.data ?? []).map((booking) => {
      const attendee = booking.attendees?.[0] ?? {};
      return {
        id: String(booking.id),
        name: attendee.name ?? "Unknown",
        email: attendee.email ?? "",
        company:
          booking.bookingFieldsResponses?.company ??
          booking.bookingFieldsResponses?.organization ??
          "Not Stated",
        phone: attendee.phoneNumber ?? booking.bookingFieldsResponses?.attendeePhoneNumber ?? booking.bookingFieldsResponses?.phone ?? undefined,
        callTime: new Date(booking.start),
        callEndTime: booking.end ? new Date(booking.end) : undefined,
        eventKind: (booking.status === "cancelled" ? "cancelled" : "created") as "created" | "cancelled",
      };
    });
  }

  /**
   * Pre-Call Read recovery gap 1 — dynamic trigger. See CalendlyClient's
   * sibling method for the rationale.
   */
  async getUpcomingCallsWithinWindow(startHoursFromNow: number, endHoursFromNow: number): Promise<NormalizedCall[]> {
    const windowStart = new Date(Date.now() + startHoursFromNow * 3_600_000);
    const windowEnd = new Date(Date.now() + endHoursFromNow * 3_600_000);

    const res = await fetchWithTimeout(
      `${this.baseUrl}/bookings?afterStart=${windowStart.toISOString()}&beforeEnd=${windowEnd.toISOString()}&status=upcoming`,
      { headers: this.headers }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cal.com bookings fetch failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as CalComBookingsResponse;

    return (data.data ?? []).map((booking) => {
      const attendee = booking.attendees?.[0] ?? {};
      return {
        id: String(booking.id),
        name: attendee.name ?? "Unknown",
        email: attendee.email ?? "",
        company: booking.bookingFieldsResponses?.company ?? booking.bookingFieldsResponses?.organization ?? "Not Stated",
        linkedInUrl: booking.bookingFieldsResponses?.linkedin ?? booking.bookingFieldsResponses?.linkedInUrl ?? undefined,
        callTime: new Date(booking.start),
        callEndTime: booking.end ? new Date(booking.end) : undefined,
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
    const res = await fetchWithTimeout(`${this.baseUrl}/me`, { headers: this.headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cal.com token check failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

async subscribeWebhook(receiverUrl: string): Promise<string> {
  const res = await fetchWithTimeout(`${this.baseUrl}/webhooks`, {
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
  // FIXED: Returns a truthy string to satisfy onboarding-service's live activation gate
  return "active"; 
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

    const res = await fetchWithTimeout(
      `${this.baseUrl}/slots?eventTypeId=${eventTypeId}` +
        `&startTime=${start.toISOString()}&endTime=${end.toISOString()}`,
      { headers: this.headers }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as CalComSlotsResponse;
    // Cal.com v2 groups slots by date: { data: { "2026-07-05": [{start: "..."}], ... } }
    const slots: Date[] = [];
    for (const day of Object.values(data.data ?? {})) {
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

      const res = await fetchWithTimeout(`${this.baseUrl}/event-types`, { headers: this.headers });
      if (!res.ok) {
        console.warn(`[CalComClient] Failed to fetch account event types index [${res.status}]`);
        return { username, cal_event_type_id: "" };
      }

      const data = (await res.json()) as CalComEventTypesResponse;
      // v2's /event-types has been observed returning both
      // { data: { eventTypes: [...] } } and { data: [...] } shapes —
      // Array.isArray narrows the union cleanly instead of guessing.
      const eventTypes: CalComEventType[] = Array.isArray(data.data)
        ? data.data
        : data.data?.eventTypes ?? [];

      const match = eventTypes.find((e) => e.slug?.toLowerCase() === targetSlug);

      return {
        username,
        cal_event_type_id: match ? String(match.id) : "",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CalComClient] Error resolving event type from link:", message);
      return { username: "", cal_event_type_id: "" };
    }
  }
}

// ── GoHighLevel Calendar ──────────────────────────────────────────────────

export class GHLCalendarClient {
  private baseUrl = "https://services.leadconnectorhq.com";
  private authHeader: string;
  private calendarIdCache: string | null = null;
  private contactCache = new Map<string, GHLContact | null>();

  constructor(
    private apiKey: string,
    private locationId: string,
    preferredCalendarId?: string
  ) {
    this.authHeader = `Bearer ${apiKey}`;
    if (preferredCalendarId) {
      this.calendarIdCache = preferredCalendarId;
    }
  }

  /** Version header is per-resource-group in GHL's API, not global — confirmed against the public spec. */
  private calendarsHeaders(): HeadersInit {
    return { Authorization: this.authHeader, Version: "2021-04-15", "Content-Type": "application/json" };
  }
  private contactsHeaders(): HeadersInit {
    return { Authorization: this.authHeader, Version: "2021-07-28", "Content-Type": "application/json" };
  }

  /**
   * Reuses GET /calendars/?locationId= — the same endpoint
   * resolveCalendarId() already depends on — purely as an "is this token
   * still good" probe. Verified against GHL's own docs
   * (marketplace.gohighlevel.com/docs/ghl/calendars/get-calendars/, which
   * documents 401 for an invalid/expired token) that this requires no
   * scope beyond what a GHL calendar integration already needs, so
   * wiring this up doesn't ask the buyer to grant anything new. Throws on
   * a revoked/invalid token or missing Location ID; resolves silently
   * when healthy. Used by the daily credential-health cron, not by any
   * user-facing flow.
   */
  async checkCredentialHealth(): Promise<void> {
    if (!this.locationId?.trim()) {
      throw new Error("GHL credential check skipped: no Location ID on file for this engagement.");
    }
    const res = await fetchWithTimeout(
      `${this.baseUrl}/calendars/?locationId=${encodeURIComponent(this.locationId.trim())}`,
      { headers: this.calendarsHeaders() }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GHL token check failed [${res.status}]: ${body.slice(0, 300)}`);
    }
  }

  /**
   * /calendars/events requires one of userId, calendarId, or groupId —
   * this app only ever collects locationId from the buyer, so resolve the
   * location's calendar id once (first active calendar; falls back to the
   * first calendar at all if none are marked active) and reuse it for the
   * lifetime of this client instance.
   */
  private async resolveCalendarId(): Promise<string> {
    if (this.calendarIdCache) return this.calendarIdCache;

    const res = await fetchWithTimeout(
      `${this.baseUrl}/calendars/?locationId=${this.locationId}`,
      { headers: this.calendarsHeaders() }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GHL calendar list fetch failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as GHLCalendarListResponse;
    const calendars = data.calendars ?? [];
    const chosen = calendars.find((c) => c.isActive !== false) ?? calendars[0];
    if (!chosen) {
      throw new Error(`No calendars found for GHL location ${this.locationId} — nothing to poll.`);
    }
    this.calendarIdCache = chosen.id;
    return chosen.id;
  }

  /** GET /contacts/{contactId} is a separate resource group from calendars — CalendarEventDTO only has contactId, no embedded name/email. */
  private async enrichContact(contactId: string | undefined): Promise<GHLContact | null> {
    if (!contactId) return null;
    if (this.contactCache.has(contactId)) return this.contactCache.get(contactId) ?? null;

    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/contacts/${contactId}`, { headers: this.contactsHeaders() });
      if (!res.ok) {
        this.contactCache.set(contactId, null);
        return null;
      }
      const data = (await res.json()) as GHLContactByIdResponse;
      const contact = data.contact ?? null;
      this.contactCache.set(contactId, contact);
      return contact;
    } catch {
      this.contactCache.set(contactId, null);
      return null;
    }
  }

  private async fetchEventsInRange(startTime: Date, endTime: Date): Promise<NormalizedCall[]> {
    const calendarId = await this.resolveCalendarId();

    const res = await fetchWithTimeout(
      `${this.baseUrl}/calendars/events?locationId=${this.locationId}&calendarId=${calendarId}&startTime=${startTime.getTime()}&endTime=${endTime.getTime()}`,
      { headers: this.calendarsHeaders() }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GHL appointments fetch failed [${res.status}]: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as GHLCalendarEventsResponse;
    const events = data.events ?? [];

    const calls: NormalizedCall[] = [];
    for (const event of events) {
      const contact = await this.enrichContact(event.contactId);
      const isCancelled = event.appointmentStatus?.toLowerCase() === "cancelled";
      calls.push({
        id: event.id,
        name: contact?.name ?? "Unknown",
        email: contact?.email ?? "",
        company: contact?.companyName ?? "Not Stated",
        phone: contact?.phone ?? undefined,
        // No linkedInUrl extraction here — GHL contacts don't have a
        // standard LinkedIn field; it would only live in a buyer-specific
        // custom field this app has no stable way to identify by name
        // across accounts. person-match.ts's LinkedIn tier simply scores 0
        // for GHL-sourced calls unless a future pass adds custom-field-name
        // configuration.
        callTime: new Date(event.startTime),
        callEndTime: event.endTime ? new Date(event.endTime) : undefined,
        eventKind: isCancelled ? "cancelled" : "created",
      });
    }
    return calls;
  }

  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const calls = await this.fetchEventsInRange(tomorrowStart, tomorrowEnd);
    return calls.filter((c) => c.eventKind !== "cancelled");
  }

  /**
   * Pre-Call Read recovery gap 1 — dynamic trigger. See CalendlyClient's
   * sibling method for the rationale.
   */
  async getUpcomingCallsWithinWindow(startHoursFromNow: number, endHoursFromNow: number): Promise<NormalizedCall[]> {
    const windowStart = new Date(Date.now() + startHoursFromNow * 3_600_000);
    const windowEnd = new Date(Date.now() + endHoursFromNow * 3_600_000);
    const calls = await this.fetchEventsInRange(windowStart, windowEnd);
    return calls.filter((c) => c.eventKind !== "cancelled");
  }

  /**
   * Polling-fallback fetch (Pin-Down recovery gap 5). GHL's calendar
   * events endpoint filters by start/end time, not creation time, so —
   * same approximation as Calendly — this pulls a forward-looking window
   * from sinceISO and relies on webhook_events idempotency to prevent
   * double-processing across poll cycles. Unlike the two briefing methods
   * above, this deliberately keeps cancelled events — the poller uses
   * eventKind to detect cancellations and route them to Win-Back instead
   * of Pile-On (see pollBookingsForEngagement in booking-poller.ts).
   */
  async listBookingsSince(sinceISO: string, lookaheadDays = 14): Promise<NormalizedCall[]> {
    const start = new Date(sinceISO);
    const end = new Date(sinceISO);
    end.setDate(end.getDate() + lookaheadDays);

    try {
      return await this.fetchEventsInRange(start, end);
    } catch {
      return [];
    }
  }

  // subscribeWebhook was removed: GHL v2 Private Integrations don't expose
  // an endpoint for creating webhook subscriptions programmatically. POSTing
  // to /locations/{id}/webhooks/ 404s every time ("Cannot POST ..."), which
  // is exactly the error this class used to throw before
  // registerWebhookForTenant (booking.ts) was changed to skip straight to
  // the polling fallback for ghl_calendar instead of attempting this call.
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

  /**
   * OnceHub's booking object has no nested "customer" object and no
   * "form_submission" object — confirmed against OnceHub's own webhook
   * payload documentation, which their v2.0.0 API changelog states shares
   * the same booking schema as REST responses. It's `attendees: [email,
   * email, ...]` (bare strings, no name field at all) and
   * `custom_fields: [{name, value}, ...]`. Name isn't a real field on this
   * object, so this falls back to scanning custom_fields for a name-like
   * question, same pattern CalendlyClient uses for its own free-text Q&A.
   */
  private normalizeBooking(booking: OnceHubBooking, eventKind: "created" | "cancelled"): NormalizedCall {
    const email = booking.attendees?.[0] ?? "";
    const nameField = booking.custom_fields?.find((f) =>
      /name/i.test(f.name) && !/company|organization/i.test(f.name)
    );
    const companyField = booking.custom_fields?.find((f) => /company|organization/i.test(f.name));
    const linkedinField = booking.custom_fields?.find(
      (f) => /linkedin/i.test(f.name) || (f.value ?? "").includes("linkedin.com/in/")
    );

    return {
      id: booking.id,
      name: nameField?.value ?? "Unknown",
      email,
      company: companyField?.value ?? "Not Stated",
      linkedInUrl: linkedinField?.value ?? undefined,
      callTime: new Date(booking.starting_time),
      eventKind,
    };
  }

  /**
   * FIX: this used to filter server-side with `starting_after` /
   * `starting_before` / `status` query params. Verified against OnceHub's
   * actual pagination reference (developers.oncehub.com/reference/
   * pagination, checked directly): `after` and `before` are cursor
   * parameters that take an *object ID*, not a date — "list bookings"
   * accepts only `limit` (1-100, default 10), `after`, and `before`, with
   * no documented date-range or status filter. The old query params were
   * silently ignored by the API, and with no `limit` set the response
   * defaulted to only the 10 most recent bookings — for any tenant with
   * real booking volume, "tomorrow's calls" could come back empty even
   * with real bookings sitting a page or two further in.
   *
   * This instead pages through results (100 at a time, following the
   * `Link: <url>; rel="next"` response header OnceHub documents — the same
   * RFC 5988 convention GitHub's API uses, not a body field) and filters
   * by `starting_time` / `status` client-side, since both are confirmed
   * real fields on the booking object (developers.oncehub.com/reference/
   * the-booking-object).
   *
   * OnceHub's docs state results come back in "reverse chronological"
   * order but don't specify by which timestamp (created vs. updated vs.
   * starting_time) — their docs are a client-rendered reference with no
   * fetchable OpenAPI spec, so this couldn't be pinned down further. A
   * future booking that hasn't been touched recently could in principle
   * sit past this page cap on a very high-activity account. MAX_PAGES is
   * generous (up to 1,000 of the account's most recently active bookings)
   * for that reason — if a tenant's real-world volume ever needs more,
   * raise this rather than re-introducing the broken date filters.
   */
  private static readonly MAX_BOOKING_PAGES = 10;

  private async fetchBookingsPaged(): Promise<OnceHubBooking[]> {
    const all: OnceHubBooking[] = [];
    let url: string | null = `${this.baseUrl}/bookings?limit=100`;
    let pages = 0;

    while (url && pages < OnceHubClient.MAX_BOOKING_PAGES) {
      const res = await fetchWithTimeout(url, { headers: this.headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OnceHub bookings fetch failed [${res.status}]: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as OnceHubBookingsResponse;
      all.push(...(data.data ?? []));
      pages++;

      const linkHeader = res.headers.get("link") ?? res.headers.get("Link");
      url = linkHeader ? extractNextLinkFromHeader(linkHeader) : null;
    }

    return all;
  }

  async getTomorrowCalls(): Promise<NormalizedCall[]> {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const bookings = await this.fetchBookingsPaged();
    return bookings
      .filter((b) => {
        const t = new Date(b.starting_time).getTime();
        return b.status === "scheduled" && t >= tomorrowStart.getTime() && t <= tomorrowEnd.getTime();
      })
      .map((booking) => this.normalizeBooking(booking, "created"));
  }

  /**
   * Pre-Call Read recovery gap 1 — dynamic trigger. See CalendlyClient's
   * sibling method for the rationale.
   */
  async getUpcomingCallsWithinWindow(startHoursFromNow: number, endHoursFromNow: number): Promise<NormalizedCall[]> {
    const windowStart = new Date(Date.now() + startHoursFromNow * 3_600_000);
    const windowEnd = new Date(Date.now() + endHoursFromNow * 3_600_000);

    const bookings = await this.fetchBookingsPaged();
    return bookings
      .filter((b) => {
        const t = new Date(b.starting_time).getTime();
        return b.status === "scheduled" && t >= windowStart.getTime() && t <= windowEnd.getTime();
      })
      .map((booking) => this.normalizeBooking(booking, "created"));
  }

  /**
   * Polling-fallback fetch (Pin-Down recovery gap 5). This is the primary
   * way OnceHub bookings ever reach Pile-On/Win-Back in practice —
   * registerWebhookForTenant already documents that OnceHub has no
   * programmatic webhook subscription API, so webhook_receiver_mode should
   * default to "polling" for any engagement on this platform rather than
   * silently doing nothing.
   */
  async listBookingsSince(sinceISO: string, lookaheadDays = 14): Promise<NormalizedCall[]> {
    const start = new Date(sinceISO).getTime();
    const end = new Date(sinceISO);
    end.setDate(end.getDate() + lookaheadDays);
    const endMs = end.getTime();

    const bookings = await this.fetchBookingsPaged();
    return bookings
      .filter((b) => {
        if (b.status !== "scheduled" && b.status !== "canceled") return false;
        const t = new Date(b.starting_time).getTime();
        return t >= start && t <= endMs;
      })
      .map((booking) => this.normalizeBooking(booking, booking.status === "canceled" ? "cancelled" : "created"));
  }
}

/**
 * Parses a `rel="next"` URL out of an RFC 5988-style Link response header
 * (e.g. `<https://api.oncehub.com/v2/bookings?after=BKNG-XYZ&limit=100>;
 * rel="next", <...>; rel="previous"`). Returns null once there's no next
 * page.
 */
function extractNextLinkFromHeader(linkHeader: string): string | null {
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

// ── Router ────────────────────────────────────────────────────────────────

export async function fetchTomorrowCallsForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta?: BookingPlatformMeta
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
  return new GHLCalendarClient(apiKey, meta.location_id, meta.calendar_id).getTomorrowCalls();

    case "oncehub":
      return new OnceHubClient(apiKey).getTomorrowCalls();

    default:
      throw new Error(
        `Unsupported booking platform: ${bookingPlatform}. ` +
          "Supported: calendly, cal_com, ghl_calendar, oncehub"
      );
  }
}

// Pre-Call Read recovery gap 1 — dynamic trigger. Used by
// dynamicBriefCron (src/inngest/crons.ts) instead of
// fetchTomorrowCallsForTenant when stack.brief_trigger_type ===
// "dynamic_webhook", so calls get briefed as soon as they enter the
// buyer's lead-time window rather than waiting for the nightly batch.
export async function fetchUpcomingCallsForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta: BookingPlatformMeta | undefined,
  startHoursFromNow: number,
  endHoursFromNow: number
): Promise<NormalizedCall[]> {
  switch (bookingPlatform) {
    case "calendly":
      return new CalendlyClient(apiKey).getUpcomingCallsWithinWindow(startHoursFromNow, endHoursFromNow);

    case "cal_com":
      return new CalComClient(apiKey).getUpcomingCallsWithinWindow(startHoursFromNow, endHoursFromNow);

case "ghl_calendar":
  if (!meta?.location_id) {
    throw new Error("GHL Calendar requires location_id in booking_platform_meta");
  }
  return new GHLCalendarClient(apiKey, meta.location_id, meta.calendar_id)
    .getUpcomingCallsWithinWindow(startHoursFromNow, endHoursFromNow);

    case "oncehub":
      return new OnceHubClient(apiKey).getUpcomingCallsWithinWindow(startHoursFromNow, endHoursFromNow);

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
  meta?: BookingPlatformMeta
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
      // GHL v2 Private Integrations do not expose an API endpoint for dynamic webhooks.
      // Returning undefined cleanly signals onboarding-service to activate 5-minute background polling.
      return;

    case "oncehub":
      console.warn("OnceHub does not support programmatic webhook registration. Buyer must configure manually.");
      return;

    default:
      return;
  }
}



// ── Live option discovery (calendar/event-type pickers) ────────────────────
//
// Shared by two callers that must never drift apart:
//   1. /api/integrations/booking/events — the new-engagement wizard, which
//      only has a raw, unsaved API key sitting in the browser.
//   2. /api/engagements/[id]/booking-calendars — Edit Stack Settings, which
//      resolves the already-stored, encrypted credential server-side so a
//      buyer fixing a misconfigured calendar never re-pastes a secret.
//
// This is the fix for the GHL 422 class of bug at its root: instead of a
// buyer hand-typing a raw calendar ID into an "(optional)" text field (and
// resolveCalendarId() silently guessing "first active calendar" when they
// don't), both onboarding and later edits present the buyer's *real*
// calendars by name and write back a verified ID.
export interface BookingOptionResult {
  id: string;
  name: string;
  link: string;
}

export async function fetchBookingOptions(
  bookingPlatform: string,
  apiKey: string,
  locationId?: string
): Promise<BookingOptionResult[]> {
  const cleanKey = apiKey.trim();

  switch (bookingPlatform) {
    case "calendly": {
      const client = new CalendlyClient(cleanKey);
      const orgUri = await client.getCurrentOrganization();

      const res = await fetchWithTimeout(
        `https://api.calendly.com/event_types?organization=${encodeURIComponent(orgUri)}&active=true`,
        { headers: { Authorization: `Bearer ${cleanKey}` } }
      );
      if (!res.ok) throw new Error(`Calendly event fetch failed [${res.status}]`);

      const data = (await res.json()) as { collection?: { uri: string; name: string; landing_page_url?: string }[] };
      return (data.collection ?? []).map((e) => ({
        id: e.uri.split("/").pop()!,
        name: e.name,
        link: e.landing_page_url ?? "",
      }));
    }

    case "cal_com": {
      const res = await fetchWithTimeout("https://api.cal.com/v2/event-types", {
        headers: { "cal-api-v2-key": cleanKey, "cal-api-version": "2024-08-13" },
      });
      if (!res.ok) throw new Error(`Cal.com event fetch failed [${res.status}]`);

      const data = (await res.json()) as {
        data?:
          | { eventTypes?: { id: string | number; slug?: string; title?: string; owner?: { username?: string } }[] }
          | { id: string | number; slug?: string; title?: string; owner?: { username?: string } }[];
      };
      const list = Array.isArray(data.data) ? data.data : (data.data?.eventTypes ?? []);
      return list.map((e) => ({
        id: String(e.id),
        name: e.title || e.slug || String(e.id),
        link: `https://cal.com/${e.owner?.username || "user"}/${e.slug ?? ""}`,
      }));
    }

    case "ghl_calendar": {
      if (!locationId?.trim()) {
        throw new Error("A GoHighLevel Location ID is required before calendars can be listed.");
      }
      const res = await fetchWithTimeout(
        `https://services.leadconnectorhq.com/calendars/?locationId=${encodeURIComponent(locationId.trim())}`,
        { headers: { Authorization: `Bearer ${cleanKey}`, Version: "2021-04-15" } }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`GHL calendar fetch failed [${res.status}]: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as { calendars?: { id: string; name?: string; widgetUrl?: string }[] };
      return (data.calendars ?? []).map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        link: c.widgetUrl ?? `https://api.leadconnectorhq.com/widget/booking/${c.id}`,
      }));
    }

    case "oncehub": {
      const res = await fetchWithTimeout("https://api.oncehub.com/v2/booking-pages?limit=100", {
        headers: { "API-Key": cleanKey },
      });
      if (!res.ok) throw new Error(`OnceHub booking pages fetch failed [${res.status}]`);

      const data = (await res.json()) as { data?: { id: string; name?: string; public_url?: string }[] };
      return (data.data ?? []).map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        link: p.public_url ?? "",
      }));
    }

    default:
      return [];
  }
}

export async function getAvailableSlotsForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta: BookingPlatformMeta | undefined,
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

// ── Polling fallback (Pin-Down recovery gap 5) ──────────────────────────────
//
// Restores the OG SKILL.md behavior for platforms that don't support (or
// the buyer hasn't configured) webhook subscriptions: install a
// scheduled 5-minute poll of "list bookings since timestamp" instead of
// silently doing nothing. See src/inngest/crons.ts#bookingPollCron for the
// scheduler that calls this, and stack.webhook_receiver_mode in
// src/models/schema.ts for the tenant-level switch.

export async function listBookingsSinceForTenant(
  bookingPlatform: string,
  apiKey: string,
  meta: BookingPlatformMeta | undefined,
  sinceISO: string
): Promise<NormalizedCall[]> {
  switch (bookingPlatform) {
    case "calendly":
      return new CalendlyClient(apiKey).listBookingsSince(sinceISO);

    case "cal_com":
      return new CalComClient(apiKey).listBookingsSince(sinceISO);

case "ghl_calendar":
  if (!meta?.location_id) {
    throw new Error("GHL Calendar requires location_id in booking_platform_meta");
  }
  return new GHLCalendarClient(apiKey, meta.location_id, meta.calendar_id)
    .listBookingsSince(sinceISO);

    case "oncehub":
      return new OnceHubClient(apiKey).listBookingsSince(sinceISO);

    default:
      // discover_from_docs / unsupported: nothing to poll until a
      // reviewed adapter exists — see doc-research.ts.
      return [];
  }
}

// ── Webhook idempotency (Pin-Down recovery gap 8) ───────────────────────────
//
// Derives a stable, payload-specific key per platform so a retried
// delivery of the exact same event collides on the same
// (event_source, idempotency_key) pair every time. Returns null when the
// payload shape doesn't contain anything stable enough to key on — the
// caller (booking-event/route.ts) logs a warning and proceeds without
// dedup in that case rather than dropping a legitimate booking.
export function deriveWebhookIdempotencyKey(bookingPlatform: string, payload: WebhookPayloadShape): string | null {
  switch (bookingPlatform) {
    case "calendly": {
      // Calendly's invitee.created/invitee.canceled payloads carry a
      // stable resource URI at payload.payload.uri (the invitee resource
      // itself) — unique per invitee per event, and identical across
      // retries of the same delivery.
      const uri: string | undefined = payload?.payload?.uri ?? payload?.payload?.invitee?.uri;
      
      // FIXED: Append the trigger so invitee.created and invitee.canceled don't collide in live webhooks
      const trigger = payload?.event ?? "unknown"; 
      return uri ? `${uri}:${trigger}` : null;
    }
    case "cal_com": {
      // Cal.com webhook payloads carry the booking's uid at payload.payload.uid
      // (or payload.uid on some trigger types).
      const uid: string | undefined = payload?.payload?.uid ?? payload?.uid;
      return uid ? `booking:${uid}:${payload?.triggerEvent ?? payload?.trigger ?? "event"}` : null;
    }
    case "ghl_calendar": {
      const id: string | undefined = payload?.id ?? payload?.appointment?.id ?? payload?.calendar?.id;
      return id ? `appt:${id}:${payload?.type ?? payload?.trigger ?? "event"}` : null;
    }
    case "oncehub": {
      const id: string | undefined = payload?.data?.id ?? payload?.booking?.id ?? payload?.id;
      return id ? `booking:${id}:${payload?.event ?? payload?.trigger ?? "event"}` : null;
    }
    default:
      return null;
  }
}