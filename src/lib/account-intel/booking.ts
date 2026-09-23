// src/lib/account-intel/booking.ts
//
// Deep reads of a booking tool: every event type with its form questions,
// the last 90 days of bookings (plus the next 30), who took them, which
// were canceled or marked no-show, and what prospects wrote when they
// booked. Endpoints and field names follow the same vendor APIs
// platforms/booking.ts already calls; anything a connection isn't allowed
// to read is skipped and reported, never guessed.

import { collectAnswers, summarizeBookings, type BookingRecord, type EventTypeInfo } from "./analyze";
import { AccountReader, inBatches, type Raw } from "./reader";
import type { AccountIntel, TeamMember } from "./types";

const LOOKBACK_DAYS = 90;
const LOOKAHEAD_DAYS = 30;
const MAX_BOOKINGS = 600;
/** Bookings whose invitee record is opened for attendance and answers. */
const MAX_INVITEE_READS = 80;

function windowBounds(now: Date) {
  return {
    from: new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000),
    to: new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000),
  };
}

function finish(provider: string, reader: AccountReader, now: Date, parts: Omit<AccountIntel, "provider" | "pulledAt" | "coverage">, records: BookingRecord[], eventTypes: EventTypeInfo[], meta?: Record<string, string>): AccountIntel {
  return {
    provider,
    pulledAt: now.toISOString(),
    coverage: reader.coverage(),
    ...parts,
    booking:
      records.length || eventTypes.length
        ? {
            history: summarizeBookings(records, { now, windowDays: LOOKBACK_DAYS, timeZone: parts.timeZone ?? null }),
            eventTypes,
            answers: collectAnswers(records),
            meta,
          }
        : undefined,
  };
}

// ── Calendly ─────────────────────────────────────────────────────────────

export async function pullCalendly(token: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ Authorization: `Bearer ${token}` });
  const base = "https://api.calendly.com";
  const me = await r.json<{ resource?: { uri?: string; name?: string; email?: string; timezone?: string; current_organization?: string; scheduling_url?: string } }>("account", `${base}/users/me`);
  const user = me?.resource;
  if (!user?.uri) return finish("calendly", r, now, {}, [], []);

  const types = await r.json<{ collection?: Raw[] }>("event types", `${base}/event_types?user=${encodeURIComponent(user.uri)}&count=100`);
  const eventTypes: EventTypeInfo[] = (types?.collection ?? []).map((t) => ({
    id: String(t.uri ?? ""),
    name: String(t.name ?? "Untitled"),
    slug: t.slug ?? null,
    url: t.scheduling_url ?? null,
    durationMin: typeof t.duration === "number" ? t.duration : null,
    active: t.active !== false,
    description: typeof t.description_plain === "string" ? t.description_plain.slice(0, 400) : null,
    questions: (t.custom_questions ?? []).filter((q: Raw) => q?.enabled !== false && q?.name).map((q: Raw) => ({ name: String(q.name), type: q.type ?? null, required: q.required ?? null })),
  }));
  const typeName = new Map(eventTypes.map((t) => [t.id, t.name]));

  const { from, to } = windowBounds(now);
  const events: Raw[] = [];
  let next: string | null =
    `${base}/scheduled_events?user=${encodeURIComponent(user.uri)}&min_start_time=${from.toISOString()}&max_start_time=${to.toISOString()}&count=100&sort=start_time:desc`;
  while (next && events.length < MAX_BOOKINGS && !r.outOfTime) {
    const page: { collection?: Raw[]; pagination?: { next_page?: string | null } } | null = await r.json("bookings", next);
    events.push(...(page?.collection ?? []));
    next = page?.pagination?.next_page ?? null;
  }

  // Attendance, answers and traffic source live on the invitee. Read the
  // most recent past bookings first (they carry the no-show marks), then
  // upcoming ones for their answers.
  const past = events.filter((e) => new Date(e.start_time).getTime() <= now.getTime());
  const upcoming = events.filter((e) => new Date(e.start_time).getTime() > now.getTime());
  const toOpen = [...past, ...upcoming].slice(0, MAX_INVITEE_READS);
  const invitees = new Map<string, Raw[]>();
  await inBatches(toOpen, 8, async (e) => {
    if (r.outOfTime || !e.uri) return;
    const data = await r.json<{ collection?: Raw[] }>("attendance and form answers", `${e.uri}/invitees?count=10`);
    if (data?.collection) invitees.set(e.uri, data.collection);
  });

  const records: BookingRecord[] = events.map((e) => {
    const inv = invitees.get(e.uri);
    const first = inv?.[0];
    const isPast = new Date(e.start_time).getTime() <= now.getTime();
    return {
      startAt: e.start_time,
      createdAt: e.created_at ?? null,
      status: e.status === "canceled" ? "canceled" : "active",
      eventTypeId: e.event_type ?? null,
      eventName: typeName.get(e.event_type) ?? e.name ?? null,
      noShow: inv && isPast && e.status !== "canceled" ? inv.some((i) => i.no_show) : null,
      answers: (inv ?? []).flatMap((i) => (i.questions_and_answers ?? []).map((qa: Raw) => ({ question: String(qa.question ?? ""), answer: String(qa.answer ?? "") }))),
      source: first?.tracking?.utm_source ?? null,
      hostName: e.event_memberships?.[0]?.user_name ?? null,
      cancelReason: e.cancellation?.reason ?? first?.cancellation?.reason ?? null,
    };
  });

  return finish(
    "calendly",
    r,
    now,
    { timeZone: user.timezone ?? null, business: { name: user.name ?? null, email: user.email ?? null } },
    records,
    eventTypes,
    user.current_organization ? { organization_uri: user.current_organization } : undefined
  );
}

// ── Cal.com ──────────────────────────────────────────────────────────────

const CAL_SKIP_FIELDS = new Set(["name", "email", "attendeephonenumber", "guests", "location", "reschedulereason", "notes_internal"]);

export async function pullCalCom(apiKey: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ "cal-api-v2-key": apiKey });
  const base = "https://api.cal.com/v2";
  const me = await r.json<{ data?: { username?: string; name?: string; email?: string; timeZone?: string } }>("account", `${base}/me`, { headers: { "cal-api-version": "2024-08-13" } });
  const username = me?.data?.username ?? null;

  const types = await r.json<{ data?: Raw[] }>("event types", `${base}/event-types`, { headers: { "cal-api-version": "2024-06-14" } });
  const fieldLabels = new Map<string, string>();
  const eventTypes: EventTypeInfo[] = (Array.isArray(types?.data) ? types!.data : []).map((t) => {
    const fields = (t.bookingFields ?? []) as Raw[];
    for (const f of fields) {
      const key = String(f.slug ?? f.name ?? "");
      if (key && f.label) fieldLabels.set(key, String(f.label));
    }
    return {
      id: String(t.id),
      name: String(t.title ?? "Untitled"),
      slug: t.slug ?? null,
      url: username && t.slug ? `https://cal.com/${username}/${t.slug}` : null,
      durationMin: typeof t.lengthInMinutes === "number" ? t.lengthInMinutes : null,
      active: t.hidden !== true,
      description: typeof t.description === "string" ? t.description.slice(0, 400) : null,
      questions: fields
        .filter((f) => !CAL_SKIP_FIELDS.has(String(f.slug ?? f.name ?? "").toLowerCase()))
        .map((f) => ({ name: String(f.label ?? f.slug ?? f.name), type: f.type ?? null, required: f.required ?? null })),
    };
  });
  const typeName = new Map(eventTypes.map((t) => [t.id, t.name]));

  const { from, to } = windowBounds(now);
  const bookings: Raw[] = [];
  for (let skip = 0; skip < MAX_BOOKINGS && !r.outOfTime; skip += 100) {
    const page = await r.json<{ data?: Raw[]; pagination?: { hasNextPage?: boolean } }>(
      "bookings",
      `${base}/bookings?afterStart=${from.toISOString()}&beforeEnd=${to.toISOString()}&take=100&skip=${skip}&sortStart=desc`,
      { headers: { "cal-api-version": "2024-08-13" } }
    );
    const rows = Array.isArray(page?.data) ? page!.data : [];
    bookings.push(...rows);
    if (rows.length < 100 || page?.pagination?.hasNextPage === false) break;
  }

  const records: BookingRecord[] = bookings
    .filter((b) => b.status !== "rejected")
    .map((b) => {
      const isPast = new Date(b.start).getTime() <= now.getTime();
      const attendees = (b.attendees ?? []) as Raw[];
      const absentKnown = attendees.some((a) => typeof a.absent === "boolean");
      const answers = Object.entries((b.bookingFieldsResponses ?? {}) as Record<string, unknown>)
        .filter(([k, v]) => !CAL_SKIP_FIELDS.has(k.toLowerCase()) && typeof v === "string" && v.trim())
        .map(([k, v]) => ({ question: fieldLabels.get(k) ?? k, answer: String(v) }));
      return {
        startAt: b.start,
        createdAt: b.createdAt ?? null,
        status: b.status === "cancelled" ? "canceled" : "active",
        eventTypeId: b.eventTypeId != null ? String(b.eventTypeId) : null,
        eventName: typeName.get(String(b.eventTypeId)) ?? b.title ?? null,
        noShow: isPast && b.status !== "cancelled" && absentKnown ? attendees.some((a) => a.absent === true) : null,
        answers,
        source: typeof b.metadata?.utm_source === "string" ? b.metadata.utm_source : null,
        hostName: b.hosts?.[0]?.name ?? null,
        cancelReason: b.cancellationReason ?? null,
      } satisfies BookingRecord;
    });

  return finish(
    "cal_com",
    r,
    now,
    { timeZone: me?.data?.timeZone ?? null, business: { name: me?.data?.name ?? null, email: me?.data?.email ?? null } },
    records,
    eventTypes,
    username ? { username } : undefined
  );
}

// ── GoHighLevel calendars ────────────────────────────────────────────────

const GHL_HEADERS = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28" });

export async function pullGhlCalendars(token: string, locationId: string, now = new Date(), reader?: AccountReader): Promise<Pick<AccountIntel, "booking" | "team"> & { reader: AccountReader }> {
  const r = reader ?? new AccountReader(GHL_HEADERS(token));
  const base = "https://services.leadconnectorhq.com";
  const loc = encodeURIComponent(locationId);

  const [cals, usersData] = await Promise.all([
    r.json<{ calendars?: Raw[] }>("calendars", `${base}/calendars/?locationId=${loc}`),
    r.json<{ users?: Raw[] }>("team", `${base}/users/?locationId=${loc}`),
  ]);
  const users = new Map<string, string>();
  const team: TeamMember[] = [];
  for (const u of usersData?.users ?? []) {
    const name = String(u.name ?? [u.firstName, u.lastName].filter(Boolean).join(" ")).trim();
    if (!name) continue;
    if (u.id) users.set(u.id, name);
    team.push({ name, email: u.email ?? null, role: u.roles?.role ?? u.role ?? null });
  }

  const calendars = (cals?.calendars ?? []).slice(0, 12);
  const eventTypes: EventTypeInfo[] = calendars.map((c) => ({
    id: String(c.id),
    name: String(c.name ?? "Calendar"),
    slug: c.widgetSlug ?? c.slug ?? null,
    url: c.id ? `https://api.leadconnectorhq.com/widget/booking/${c.id}` : null,
    durationMin: typeof c.slotDuration === "number" ? c.slotDuration : null,
    active: c.isActive !== false,
    description: typeof c.description === "string" ? c.description.replace(/<[^>]+>/g, " ").slice(0, 400) : null,
    questions: [],
  }));

  const { from, to } = windowBounds(now);
  const records: BookingRecord[] = [];
  await inBatches(calendars, 4, async (c) => {
    if (r.outOfTime) return;
    const data = await r.json<{ events?: Raw[] }>(
      "appointments",
      `${base}/calendars/events?locationId=${loc}&calendarId=${encodeURIComponent(c.id)}&startTime=${from.getTime()}&endTime=${to.getTime()}`
    );
    for (const e of data?.events ?? []) {
      const s = String(e.appointmentStatus ?? "").toLowerCase();
      if (s === "invalid") continue;
      records.push({
        startAt: e.startTime,
        createdAt: e.dateAdded ?? null,
        status: s === "cancelled" ? "canceled" : s === "noshow" ? "no_show" : s === "showed" ? "showed" : "active",
        eventTypeId: String(c.id),
        eventName: String(c.name ?? "Calendar"),
        noShow: s === "noshow" ? true : s === "showed" ? false : null,
        hostName: e.assignedUserId ? (users.get(e.assignedUserId) ?? null) : null,
      });
    }
  });

  return {
    reader: r,
    team: team.length ? team : undefined,
    booking:
      records.length || eventTypes.length
        ? {
            history: summarizeBookings(records, { now, windowDays: LOOKBACK_DAYS }),
            eventTypes,
            answers: [],
            meta: { location_id: locationId },
          }
        : undefined,
  };
}

// ── OnceHub ──────────────────────────────────────────────────────────────

export async function pullOnceHub(apiKey: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ "API-Key": apiKey });
  const base = "https://api.oncehub.com/v2";
  const pages = await r.json<{ data?: Raw[] }>("booking pages", `${base}/booking-pages?limit=100`);
  const eventTypes: EventTypeInfo[] = (pages?.data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.label ?? p.name ?? "Booking page"),
    slug: p.url ? String(p.url).split("/").pop() : null,
    url: p.url ?? null,
    durationMin: null,
    active: p.active !== false,
    questions: [],
  }));

  const { from } = windowBounds(now);
  const raw: Raw[] = [];
  let after: string | null = null;
  for (let i = 0; i < 6 && !r.outOfTime; i++) {
    // Paged by `after` (the last id) and `limit`, filtered on
    // last_updated_time.gt, as Airbyte's OnceHub connector reads them.
    const page: { data?: Raw[] } | null = await r.json(
      "bookings",
      `${base}/bookings?limit=100&last_updated_time.gt=${encodeURIComponent(from.toISOString())}${after ? `&after=${encodeURIComponent(after)}` : ""}`
    );
    const rows: Raw[] = page?.data ?? [];
    raw.push(...rows);
    if (rows.length < 100) break;
    after = rows[rows.length - 1]?.id ?? null;
    if (!after) break;
  }

  const records: BookingRecord[] = raw
    .filter((b) => b.starting_time && new Date(b.starting_time) >= from)
    .map((b) => {
      const s = String(b.status ?? "").toLowerCase();
      return {
        startAt: b.starting_time,
        createdAt: b.creation_time ?? null,
        status: s.includes("cancel") ? "canceled" : s.includes("no_show") || s.includes("no-show") ? "no_show" : s === "completed" ? "showed" : "active",
        eventTypeId: b.booking_page ? String(b.booking_page) : null,
        eventName: b.subject ?? null,
        noShow: s.includes("no_show") ? true : s === "completed" ? false : null,
        // custom_fields per OnceHub's webhook docs (platforms/booking.ts);
        // also looked for under form_submission, where the REST booking
        // keeps what the form collected.
        answers: [...(b.custom_fields ?? []), ...(b.form_submission?.custom_fields ?? [])].map((f: Raw) => ({ question: String(f.name ?? f.label ?? ""), answer: String(f.value ?? "") })),
        cancelReason: b.cancel_reschedule_reason ?? null,
      } satisfies BookingRecord;
    });

  return finish("oncehub", r, now, {}, records, eventTypes);
}
