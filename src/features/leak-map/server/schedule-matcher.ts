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
function getLocalWeekdayAndHour(date: Date, timezone: string): { weekday: number; hour: number; dayOfMonth: number } {
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
