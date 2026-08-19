/**
 * Timezone/locale support shared between:
 *  - Settings > Timezones & Region (workspace-level default —
 *    src/app/dashboard/settings/language)
 *  - the per-engagement Scheduling field (edit-stack-settings.tsx, which
 *    writes engagements.stack.timezone — the value the crons actually
 *    read via matchesDailyLocalHour/matchesWeeklyLocalHour)
 *
 * Validation uses Intl.supportedValuesOf("timeZone") — the runtime's own
 * IANA database — rather than a hand-maintained allowlist, so it never
 * silently drifts out of date the way a hardcoded list would as the tz
 * database updates. A hand-picked COMMON_TIMEZONES list still backs the
 * dropdown's default/quick-pick options so the UI doesn't dump all ~400
 * zones on someone who just wants "Eastern Time."
 */

let cachedZones: Set<string> | null = null;

/** Every IANA zone name the current runtime recognizes. Cached — the
 * underlying tz database doesn't change within a process lifetime. */
export function allTimezones(): string[] {
  if (!cachedZones) {
    cachedZones = new Set(Intl.supportedValuesOf("timeZone"));
  }
  return Array.from(cachedZones);
}

export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || !tz.trim()) return false;
  if (tz === "UTC") return true;
  if (!cachedZones) cachedZones = new Set(Intl.supportedValuesOf("timeZone"));
  return cachedZones.has(tz);
}

/** A short, curated set of common zones for the dropdown's top options —
 * covers the regions this app's buyers most often operate in. The
 * dropdown also allows picking from the full IANA list below this group. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)" },
  { value: "America/Sao_Paulo", label: "Brasília Time (São Paulo)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Central European Time (Paris)" },
  { value: "Europe/Berlin", label: "Central European Time (Berlin)" },
  { value: "Africa/Accra", label: "Accra" },
  { value: "Africa/Lagos", label: "West Africa Time (Lagos)" },
  { value: "Africa/Johannesburg", label: "South Africa Time (Johannesburg)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Dubai)" },
  { value: "Asia/Kolkata", label: "India Standard Time (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (Tokyo)" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

/** Curated locales for date/number formatting — kept small and explicit
 * (allowlisted, not free text) since a locale drives real formatting
 * behavior elsewhere in the app (see lib/workspace-format.ts). */
export const SUPPORTED_LOCALES: { value: string; label: string }[] = [
  { value: "en-US", label: "English (United States) — MM/DD/YYYY" },
  { value: "en-GB", label: "English (United Kingdom) — DD/MM/YYYY" },
  { value: "en-CA", label: "English (Canada) — YYYY-MM-DD" },
  { value: "en-AU", label: "English (Australia) — DD/MM/YYYY" },
  { value: "en-ZA", label: "English (South Africa) — YYYY/MM/DD" },
  { value: "fr-FR", label: "French (France) — DD/MM/YYYY" },
  { value: "de-DE", label: "German (Germany) — DD.MM.YYYY" },
  { value: "es-ES", label: "Spanish (Spain) — DD/MM/YYYY" },
  { value: "pt-BR", label: "Portuguese (Brazil) — DD/MM/YYYY" },
];

export function isValidLocale(locale: string): boolean {
  return SUPPORTED_LOCALES.some((l) => l.value === locale);
}

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_LOCALE = "en-US";
