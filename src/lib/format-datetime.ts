// =============================================================================
// DIARY-STYLE DATE & TIME FORMATTING — single source of truth
//
// Before this file, ~16 different components each rolled their own
// `toLocaleString()` / `toLocaleTimeString()` call with different (or no)
// options. Three concrete bugs came out of that drift:
//
//   1. `.toLocaleString()` with no options (pile-on-view.tsx "Last Attempt")
//      renders locale-dependent numeric dates like "20/08/2026, 12:00:39" —
//      ambiguous DD/MM vs MM/DD depending on the reader's locale, includes
//      seconds nobody asked for, and — because `hour12` was never forced —
//      can render 24-hour "16:30" in some locales and unmarked "12:00" in
//      others, which is genuinely ambiguous (noon or midnight?).
//   2. Every other file picked its own subset of options, so a single
//      screen (a run's summary vs. its step log vs. its dispatch panel)
//      could show the same instant three different ways.
//   3. Step durations under a second rendered as raw "43ms" / "0ms" —
//      accurate, but it reads like a debug log, not something a client
//      should have to parse.
//
// Fix: one set of helpers, always explicit about hour12/AM-PM and always
// using a month *name* (never DD/MM digits) so there's no regional
// ambiguity. Everything that renders a timestamp to a person — run
// headers, step logs, cadence dates, dispatch "Last Attempt" — should go
// through these instead of calling toLocale*() directly.
// =============================================================================

function toDate(input: string | number | Date): Date {
  return input instanceof Date ? input : new Date(input);
}

/** "Aug 20, 2026" — never digits-only, so it can't be misread as DD/MM. */
export function formatDiaryDate(input: string | number | Date): string {
  return toDate(input).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "6:23 PM" — hour12 is always forced explicitly, never left to locale default. */
export function formatDiaryTime(input: string | number | Date): string {
  return toDate(input).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Aug 20, 2026 · 6:23 PM" — the standard diary-entry stamp for a single event. */
export function formatDiaryDateTime(input: string | number | Date): string {
  return `${formatDiaryDate(input)} · ${formatDiaryTime(input)}`;
}

/**
 * "Today at 6:23 PM" / "Yesterday at 6:23 PM" / "Aug 18, 2026 at 6:23 PM" —
 * for activity-feed-style entries where "today/yesterday" is more useful
 * than a repeated date.
 */
export function formatDiaryRelativeDateTime(input: string | number | Date): string {
  const d = toDate(input);
  const now = new Date();
  const dKey = d.toDateString();
  const todayKey = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dKey === todayKey) return `Today at ${formatDiaryTime(d)}`;
  if (dKey === yesterday.toDateString()) return `Yesterday at ${formatDiaryTime(d)}`;
  return `${formatDiaryDate(d)} at ${formatDiaryTime(d)}`;
}

/**
 * Duration for a *reader*, not a profiler. Anything under a third of a
 * second reads as "Instant" instead of a raw millisecond count — a client
 * doesn't need to know a step took "43ms," they need to know it basically
 * happened immediately. Above that, falls back to the same s/m breakdown
 * every duration formatter in the app was already using.
 */
export function formatReadableDuration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || ms < 0) return null;
  if (ms < 300) return "Instant";
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
