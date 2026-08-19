"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Check, Loader2 } from "lucide-react";
import { COMMON_TIMEZONES, SUPPORTED_LOCALES, allTimezones } from "@/lib/timezones";

export function TimezoneRegionForm({
  workspaceId,
  initialTimezone,
  initialLocale,
}: {
  workspaceId: string;
  initialTimezone: string;
  initialLocale: string;
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [locale, setLocale] = useState(initialLocale);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The full IANA list, minus whatever's already in the curated quick-pick
  // group above it, so nothing appears twice in the dropdown.
  const otherTimezones = useMemo(() => {
    const common = new Set(COMMON_TIMEZONES.map((z) => z.value));
    return allTimezones()
      .filter((tz) => !common.has(tz))
      .sort((a, b) => a.localeCompare(b));
  }, []);

  const dirty = timezone !== initialTimezone || locale !== initialLocale;

  // Live "it's currently ___ there" preview — recomputed every 30s so it
  // doesn't drift stale if someone leaves the tab open while picking.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const preview = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(now);
    } catch {
      return null;
    }
  }, [now, timezone, locale]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/region-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="timezone" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Default timezone
          </label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-background border border-zinc-300 dark:border-zinc-800 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-600 transition-colors"
          >
            <optgroup label="Common">
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="All timezones">
              {otherTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="locale" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Date & number format
          </label>
          <select
            id="locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-background border border-zinc-300 dark:border-zinc-800 rounded-md text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-600 transition-colors"
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-400">
        <Globe size={14} className="shrink-0 text-zinc-400 dark:text-zinc-500" />
        {preview ? (
          <span>
            It&apos;s currently <span className="font-medium text-zinc-900 dark:text-zinc-100">{preview}</span> in
            this timezone.
          </span>
        ) : (
          <span>Preview unavailable for this selection.</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-md text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check size={13} />
            Saved
          </span>
        )}
      </div>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xl pt-2 border-t border-zinc-200 dark:border-zinc-800/60">
        This is the default applied to new clients when they&apos;re added — each client&apos;s own schedule can
        still be set independently under their Edit stack settings → Scheduling, which is what actually drives when
        their recovery sweeps and digests run.
      </p>
    </div>
  );
}
