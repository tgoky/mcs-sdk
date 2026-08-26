/**
 * Leak Map recovery gap 1 — matches a buyer's configured weekly/monthly
 * schedule against "now," in the buyer's own timezone. Used by
 * leakMapScheduleCron (crons.ts), which runs hourly and asks this
 * question for every engagement rather than driving a literal per-tenant
 * Inngest cron expression (Inngest cron triggers are static at deploy
 * time — see that cron's module comment for the full rationale).
 *
 * Matching is done to the top of the hour, not the minute — this cron
 * runs on the hour, so "hourLocal: 9" means "fires sometime in the 9:00-
 * 9:59 local hour," which is what "09:00 buyer-configurable" reasonably
 * means for a weekly/monthly report (nobody is watching the clock for
 * the exact minute a summary report lands).
 */

export interface WeeklySchedule {
  dayOfWeek: number; // 0=Sun..6=Sat
  hourLocal: number; // 0-23
  timezone: string; // IANA, e.g. "America/New_York"
}

export interface MonthlySchedule {
  dayOfMonth: number; // 1-31
  hourLocal: number;
  timezone: string;
}

export const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = { dayOfWeek: 1, hourLocal: 9, timezone: "UTC" }; // Monday 09:00
export const DEFAULT_MONTHLY_SCHEDULE: MonthlySchedule = { dayOfMonth: 1, hourLocal: 9, timezone: "UTC" }; // 1st, 09:00

/**
 * Resolves the local weekday (0=Sun..6=Sat) and hour (0-23) for a given
 * instant in a given IANA timezone, using Intl.DateTimeFormat rather than
 * a date-arithmetic library — correctly handles DST transitions for free,
 * since the timezone database backing Intl already does.
 */
export function getLocalWeekdayAndHour(date: Date, timezone: string): { weekday: number; hour: number; dayOfMonth: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dayStr = parts.find((p) => p.type === "day")?.value ?? "1";

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Intl's hour12:false formats midnight as "24" in some locales/environments
  // rather than "0" — normalize it.
  const hour = parseInt(hourStr, 10) % 24;

  return { weekday: weekdayMap[weekdayStr] ?? 0, hour, dayOfMonth: parseInt(dayStr, 10) };
}

export function matchesWeeklySchedule(schedule: WeeklySchedule | undefined | null, now: Date): boolean {
  const s = schedule ?? DEFAULT_WEEKLY_SCHEDULE;
  let local;
  try {
    local = getLocalWeekdayAndHour(now, s.timezone);
  } catch {
    // Invalid/unrecognized timezone string — fail safe to UTC rather than
    // throwing and silently skipping this engagement's audit forever.
    local = getLocalWeekdayAndHour(now, "UTC");
  }
  return local.weekday === s.dayOfWeek && local.hour === s.hourLocal;
}

export function matchesMonthlySchedule(schedule: MonthlySchedule | undefined | null, now: Date): boolean {
  const s = schedule ?? DEFAULT_MONTHLY_SCHEDULE;
  let local;
  try {
    local = getLocalWeekdayAndHour(now, s.timezone);
  } catch {
    local = getLocalWeekdayAndHour(now, "UTC");
  }
  return local.dayOfMonth === s.dayOfMonth && local.hour === s.hourLocal;
}

/**
 * Verified-defect fix (2026-08-08 handoff, defect #2) — generic version of
 * the same local-hour match used above, for daily crons that aren't
 * leak-map-specific (nightly briefs, credential health, lost-deal sweep).
 * `timezone` defaults to "UTC" when the engagement hasn't set one, so
 * every one of these crons behaves exactly as it does today (fires at the
 * literal UTC hour) until an engagement actually configures a non-UTC
 * timezone — no behavior change for existing tenants, just no longer
 * hardcoded.
 */
export function matchesDailyLocalHour(timezone: string | undefined | null, hourLocal: number, now: Date): boolean {
  let local;
  try {
    local = getLocalWeekdayAndHour(now, timezone || "UTC");
  } catch {
    local = getLocalWeekdayAndHour(now, "UTC");
  }
  return local.hour === hourLocal;
}

/** Same as matchesDailyLocalHour, gated to a single local weekday too (weeklyMetricsCron's Monday 08:00). */
export function matchesWeeklyLocalHour(
  timezone: string | undefined | null,
  dayOfWeek: number,
  hourLocal: number,
  now: Date
): boolean {
  let local;
  try {
    local = getLocalWeekdayAndHour(now, timezone || "UTC");
  } catch {
    local = getLocalWeekdayAndHour(now, "UTC");
  }
  return local.weekday === dayOfWeek && local.hour === hourLocal;
}

/**
 * Finds the next instant (as a UTC Date) at or after `from` that
 * leakMapScheduleCron's hourly matchesWeeklySchedule() check would fire
 * on. Deliberately searches hour-by-hour and calls the real matcher
 * rather than doing independent date arithmetic — the cron only ever
 * fires on a local-weekday+hour match, and DST transitions make
 * reimplementing that match independently a real way to drift out of
 * sync with what will actually happen. Capped at 24*8 hours (one week
 * plus slack) since a weekly schedule matches at least once in any
 * 7-day span.
 */
export function nextWeeklyOccurrence(schedule: WeeklySchedule | undefined | null, from: Date): Date {
  const cursor = new Date(from);
  cursor.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= 24 * 8; i++) {
    if (matchesWeeklySchedule(schedule, cursor)) return new Date(cursor);
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return cursor; // unreachable in practice — guarantees a return type
}

/** Same approach as nextWeeklyOccurrence, capped at 32 days. */
export function nextMonthlyOccurrence(schedule: MonthlySchedule | undefined | null, from: Date): Date {
  const cursor = new Date(from);
  cursor.setUTCMinutes(0, 0, 0);
  for (let i = 0; i <= 24 * 32; i++) {
    if (matchesMonthlySchedule(schedule, cursor)) return new Date(cursor);
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return cursor;
}

/**
 * Every instant in [rangeStart, rangeEnd) a weekly schedule matches — for
 * the cross-client Calendar view (2026-08-25), which needs to plot every
 * occurrence in a browsed month, not just the soonest one the way
 * nextWeeklyOccurrence does. Same matcher, same hour-by-hour scan
 * technique, just collecting instead of stopping at the first hit; bounded
 * by the range itself rather than a separate iteration cap. Guards against
 * a non-hour-aligned rangeStart (truncating minutes could otherwise walk
 * the cursor backward past rangeStart by up to 59 minutes).
 */
export function weeklyOccurrencesInRange(schedule: WeeklySchedule | undefined | null, rangeStart: Date, rangeEnd: Date): Date[] {
  const occurrences: Date[] = [];
  const cursor = new Date(rangeStart);
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < rangeEnd) {
    if (cursor >= rangeStart && matchesWeeklySchedule(schedule, cursor)) occurrences.push(new Date(cursor));
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return occurrences;
}

/** Same as weeklyOccurrencesInRange, for monthly schedules. */
export function monthlyOccurrencesInRange(schedule: MonthlySchedule | undefined | null, rangeStart: Date, rangeEnd: Date): Date[] {
  const occurrences: Date[] = [];
  const cursor = new Date(rangeStart);
  cursor.setUTCMinutes(0, 0, 0);
  while (cursor < rangeEnd) {
    if (cursor >= rangeStart && matchesMonthlySchedule(schedule, cursor)) occurrences.push(new Date(cursor));
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return occurrences;
}
