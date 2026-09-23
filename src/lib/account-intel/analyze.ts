// src/lib/account-intel/analyze.ts
//
// Pure summaries of what a connected account holds: booking history,
// deals, email campaigns, and what prospects wrote on booking forms. The
// provider pulls (booking.ts, crm.ts) turn each vendor's records into the
// shared shapes below; everything here is plain arithmetic over them, so
// it's tested without any network.

export type BookingStatus = "active" | "canceled" | "no_show" | "showed";

export interface BookingRecord {
  startAt: string;
  createdAt?: string | null;
  status: BookingStatus;
  eventTypeId?: string | null;
  eventName?: string | null;
  /** True when the host marked the invitee a no-show, false when we looked
   * and they weren't, null when this booking's attendance wasn't read. */
  noShow?: boolean | null;
  answers?: { question: string; answer: string }[];
  source?: string | null;
  hostName?: string | null;
  cancelReason?: string | null;
}

export interface EventTypeInfo {
  id: string;
  name: string;
  slug?: string | null;
  url?: string | null;
  durationMin?: number | null;
  active: boolean;
  description?: string | null;
  questions: { name: string; type?: string | null; required?: boolean | null }[];
}

export interface BookingHistory {
  windowDays: number;
  total: number;
  past: number;
  upcoming: number;
  canceled: number;
  /** Share of all bookings that were canceled, 0 to 100. */
  cancelRate: number | null;
  /** Past, not canceled bookings whose attendance was read. */
  attendanceKnown: number;
  noShows: number;
  /** Of attendanceKnown, 0 to 100. Null below a handful of calls. */
  noShowRate: number | null;
  perWeek: number;
  medianLeadTimeDays: number | null;
  busiestDays: string[];
  busiestHours: string[];
  byEventType: { id: string | null; name: string; count: number; canceled: number }[];
  sources: { source: string; count: number }[];
  cancelReasons: string[];
  hosts: { name: string; count: number }[];
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MIN_ATTENDANCE_SAMPLE = 8;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tally<T extends string>(values: (T | null | undefined)[]): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Weekday and hour in the account's own timezone (falls back to UTC). */
function localParts(iso: string, timeZone: string | null): { day: number; hour: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return day >= 0 && Number.isFinite(hour) ? { day, hour } : null;
  } catch {
    return { day: d.getUTCDay(), hour: d.getUTCHours() };
  }
}

function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}

export function summarizeBookings(records: BookingRecord[], opts: { now: Date; windowDays: number; timeZone?: string | null }): BookingHistory {
  const now = opts.now.getTime();
  const valid = records.filter((r) => !Number.isNaN(new Date(r.startAt).getTime()));
  const past = valid.filter((r) => new Date(r.startAt).getTime() <= now);
  const upcoming = valid.length - past.length;
  const canceled = valid.filter((r) => r.status === "canceled").length;

  const attended = past.filter((r) => r.status !== "canceled" && (r.status === "no_show" || r.status === "showed" || typeof r.noShow === "boolean"));
  const noShows = attended.filter((r) => r.status === "no_show" || r.noShow === true).length;

  const leadDays = valid
    .map((r) => (r.createdAt ? (new Date(r.startAt).getTime() - new Date(r.createdAt).getTime()) / 86_400_000 : NaN))
    .filter((d) => Number.isFinite(d) && d >= 0);
  const lead = median(leadDays);

  const held = valid.filter((r) => r.status !== "canceled");
  const local = held.map((r) => localParts(r.startAt, opts.timeZone ?? null)).filter((p): p is { day: number; hour: number } => p !== null);
  const days = tally(local.map((p) => DAY_NAMES[p.day]));
  const hours = tally(local.map((p) => String(p.hour)));
  // Only name a busiest day or hour when it clearly stands out.
  const standout = <T,>(list: { key: T; count: number }[], n: number) => (local.length >= 10 ? list.slice(0, n).filter((x) => x.count >= Math.max(2, local.length * 0.15)) : []);

  const byType = new Map<string, { id: string | null; name: string; count: number; canceled: number }>();
  for (const r of valid) {
    const key = r.eventTypeId ?? r.eventName ?? "";
    if (!key) continue;
    const entry = byType.get(key) ?? { id: r.eventTypeId ?? null, name: r.eventName ?? "Untitled", count: 0, canceled: 0 };
    entry.count += 1;
    if (r.status === "canceled") entry.canceled += 1;
    byType.set(key, entry);
  }

  const weeks = Math.max(1, opts.windowDays / 7);
  const pastInWindow = past.filter((r) => now - new Date(r.startAt).getTime() <= opts.windowDays * 86_400_000).length;

  return {
    windowDays: opts.windowDays,
    total: valid.length,
    past: past.length,
    upcoming,
    canceled,
    cancelRate: pct(canceled, valid.length),
    attendanceKnown: attended.length,
    noShows,
    noShowRate: attended.length >= MIN_ATTENDANCE_SAMPLE ? pct(noShows, attended.length) : null,
    perWeek: round1(pastInWindow / weeks),
    medianLeadTimeDays: lead === null ? null : round1(lead),
    busiestDays: standout(days, 2).map((d) => d.key),
    busiestHours: standout(hours, 2).map((h) => hourLabel(Number(h.key))),
    byEventType: [...byType.values()].sort((a, b) => b.count - a.count),
    sources: tally(valid.map((r) => r.source?.trim().toLowerCase() || null)).slice(0, 8).map((s) => ({ source: s.key, count: s.count })),
    cancelReasons: uniqueText(valid.map((r) => r.cancelReason), 12),
    hosts: tally(valid.map((r) => r.hostName?.trim() || null)).slice(0, 10).map((h) => ({ name: h.key, count: h.count })),
  };
}

function uniqueText(values: (string | null | undefined)[], max: number, maxLen = 280): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = scrubContact(v?.trim() ?? "").slice(0, maxLen);
    const key = t.toLowerCase();
    if (t.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Emails and phone numbers out of free text a prospect typed. */
export function scrubContact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\(?(?:\d[\s().-]{0,2}){7,}\d/g, "[phone]");
}

// Booking-form questions that only collect contact details say nothing
// about the business.
const CONTACT_QUESTION = /^(name|full name|first name|last name|email|e-mail|phone|phone number|mobile|cell|guests?|location|time ?zone|company name|website|linkedin)\b/i;

export interface QuestionAnswers {
  question: string;
  responses: number;
  answers: string[];
}

/** What prospects wrote on the booking form, grouped per question. */
export function collectAnswers(records: BookingRecord[], perQuestion = 30): QuestionAnswers[] {
  const groups = new Map<string, { question: string; values: string[] }>();
  for (const r of records) {
    for (const a of r.answers ?? []) {
      const q = a.question?.trim();
      const v = a.answer?.trim();
      if (!q || !v || CONTACT_QUESTION.test(q)) continue;
      const key = q.toLowerCase();
      const g = groups.get(key) ?? { question: q, values: [] };
      g.values.push(v);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({ question: g.question, responses: g.values.length, answers: uniqueText(g.values, perQuestion, 400) }))
    .filter((g) => g.answers.length > 0)
    .sort((a, b) => b.responses - a.responses)
    .slice(0, 12);
}

// ── Deals ────────────────────────────────────────────────────────────────

export interface DealRecord {
  amount?: number | null;
  createdAt?: string | null;
  closedAt?: string | null;
  status: "open" | "won" | "lost";
  stage?: string | null;
  source?: string | null;
  lostReason?: string | null;
}

export interface DealHistory {
  currency: string | null;
  total: number;
  open: number;
  won: number;
  lost: number;
  winRate: number | null;
  averageWon: number | null;
  medianWon: number | null;
  wonValue: number;
  openValue: number;
  medianCycleDays: number | null;
  stages: { stage: string; count: number }[];
  sources: { source: string; count: number }[];
  lostReasons: string[];
}

export function summarizeDeals(deals: DealRecord[], currency: string | null): DealHistory {
  const won = deals.filter((d) => d.status === "won");
  const lost = deals.filter((d) => d.status === "lost");
  const open = deals.filter((d) => d.status === "open");
  const amounts = won.map((d) => d.amount).filter((a): a is number => typeof a === "number" && a > 0);
  const cycles = won
    .map((d) => (d.createdAt && d.closedAt ? (new Date(d.closedAt).getTime() - new Date(d.createdAt).getTime()) / 86_400_000 : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const med = median(amounts);
  const cycle = median(cycles);
  return {
    currency,
    total: deals.length,
    open: open.length,
    won: won.length,
    lost: lost.length,
    winRate: won.length + lost.length >= 5 ? pct(won.length, won.length + lost.length) : null,
    averageWon: amounts.length ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) : null,
    medianWon: med === null ? null : Math.round(med),
    wonValue: Math.round(amounts.reduce((a, b) => a + b, 0)),
    openValue: Math.round(open.reduce((sum, d) => sum + (typeof d.amount === "number" && d.amount > 0 ? d.amount : 0), 0)),
    medianCycleDays: cycle === null ? null : round1(cycle),
    stages: tally(open.map((d) => d.stage ?? null)).slice(0, 12).map((s) => ({ stage: s.key, count: s.count })),
    sources: tally(deals.map((d) => d.source?.trim() || null)).slice(0, 8).map((s) => ({ source: s.key, count: s.count })),
    lostReasons: uniqueText(lost.map((d) => d.lostReason), 12),
  };
}

// ── Email campaigns ──────────────────────────────────────────────────────

export interface CampaignRecord {
  name?: string | null;
  subject?: string | null;
  sentAt?: string | null;
  recipients?: number | null;
  /** 0 to 1. */
  openRate?: number | null;
  clickRate?: number | null;
}

export interface EmailHistory {
  campaigns: number;
  perMonth: number | null;
  lastSentAt: string | null;
  averageOpenRate: number | null;
  averageClickRate: number | null;
  recentSubjects: string[];
  bestSubjects: { subject: string; openRate: number }[];
}

export function summarizeCampaigns(campaigns: CampaignRecord[]): EmailHistory {
  const dated = campaigns
    .filter((c) => c.sentAt && !Number.isNaN(new Date(c.sentAt).getTime()))
    .sort((a, b) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime());
  const all = dated.length ? dated : campaigns;
  let perMonth: number | null = null;
  if (dated.length >= 2) {
    const spanDays = (new Date(dated[0].sentAt!).getTime() - new Date(dated[dated.length - 1].sentAt!).getTime()) / 86_400_000;
    perMonth = round1(dated.length / Math.max(1, spanDays / 30));
  }
  // Rates only from sends big enough to mean something, weighted by size.
  const sized = all.filter((c) => (c.recipients ?? 0) >= 50 || c.recipients == null);
  const weighted = (key: "openRate" | "clickRate") => {
    const rows = sized.filter((c) => typeof c[key] === "number" && c[key]! >= 0 && c[key]! <= 1);
    if (rows.length === 0) return null;
    const w = rows.reduce((s, c) => s + (c.recipients ?? 1), 0);
    return round1((rows.reduce((s, c) => s + c[key]! * (c.recipients ?? 1), 0) / w) * 100);
  };
  const subjects = uniqueText(all.map((c) => c.subject ?? c.name), 15, 160);
  const best = sized
    .filter((c) => c.subject && typeof c.openRate === "number" && (c.recipients ?? 0) >= 50)
    .sort((a, b) => b.openRate! - a.openRate!)
    .slice(0, 3)
    .map((c) => ({ subject: c.subject!, openRate: round1(c.openRate! * 100) }));
  return {
    campaigns: campaigns.length,
    perMonth,
    lastSentAt: dated[0]?.sentAt ?? null,
    averageOpenRate: weighted("openRate"),
    averageClickRate: weighted("clickRate"),
    recentSubjects: subjects,
    bestSubjects: best,
  };
}

/** The Calendly event type whose public link matches a link found on the
 * site, by URL or slug. */
export function matchEventTypeToLink(types: EventTypeInfo[], link: string | null | undefined): EventTypeInfo | null {
  if (!link) return null;
  const clean = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const target = clean(link);
  const exact = types.find((t) => t.url && clean(t.url) === target);
  if (exact) return exact;
  const lastSegment = target.split("/").pop() ?? "";
  if (!lastSegment) return null;
  const bySlug = types.filter((t) => t.slug && t.slug.toLowerCase() === lastSegment);
  return bySlug.length === 1 ? bySlug[0] : null;
}
