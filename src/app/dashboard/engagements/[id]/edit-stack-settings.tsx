"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Save } from "lucide-react";
import { BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS } from "@/lib/copy";
import { platformSupportsAutoWebhook } from "@/lib/booking-sync-status";
import type { EngagementStack } from "@/models/schema";

// Kept in lockstep with the PATCH route's own allow-list — a value the
// route would reject shouldn't be offered as a dropdown option here.
const BOOKING_PLATFORM_OPTIONS = Object.keys(BOOKING_PLATFORM_LABELS) as Array<
  keyof typeof BOOKING_PLATFORM_LABELS
>;
const EMAIL_PLATFORM_OPTIONS = ["klaviyo", "hubspot", "activecampaign", "convertkit", "mailchimp", "smtp"] as const;

function metaFieldsFor(platform: string | undefined): Array<{ key: string; label: string; placeholder?: string }> {
  switch (platform) {
    case "ghl_calendar":
      return [
        { key: "location_id", label: "Location ID" },
        { key: "calendar_id", label: "Calendar ID (optional)" },
      ];
    case "calendly":
      return [
        { key: "organization_uri", label: "Organization URI" },
        { key: "event_type_uuid", label: "Event type UUID (optional)" },
      ];
    case "cal_com":
      return [
        { key: "username", label: "Cal.com username" },
        { key: "cal_event_type_id", label: "Event type ID (optional)" },
      ];
    case "oncehub":
      return [{ key: "account_id", label: "Account ID" }];
    default:
      return [];
  }
}

export function EditStackSettings({
  engagementId,
  initialStack,
}: {
  engagementId: string;
  initialStack: EngagementStack | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bookingPlatform, setBookingPlatform] = useState(initialStack?.booking_platform ?? "");
  const [meta, setMeta] = useState<Record<string, string>>({
    location_id: initialStack?.booking_platform_meta?.location_id ?? "",
    calendar_id: initialStack?.booking_platform_meta?.calendar_id ?? "",
    organization_uri: initialStack?.booking_platform_meta?.organization_uri ?? "",
    event_type_uuid: initialStack?.booking_platform_meta?.event_type_uuid ?? "",
    username: initialStack?.booking_platform_meta?.username ?? "",
    cal_event_type_id: initialStack?.booking_platform_meta?.cal_event_type_id ?? "",
    account_id: initialStack?.booking_platform_meta?.account_id ?? "",
  });
  const [emailPlatform, setEmailPlatform] = useState(initialStack?.email_platform ?? "");
  // Was defaulting to "webhook" whenever nothing had been saved yet, which
  // silently pre-selected an option the buyer never chose and made an
  // unconfigured engagement look configured. Reflect the real stored value
  // (including "unset") instead — see the "— not set —" option below.
  const [webhookMode, setWebhookMode] = useState(initialStack?.webhook_receiver_mode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const activeMetaFields = metaFieldsFor(bookingPlatform);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const metaPayload = Object.fromEntries(
        activeMetaFields
          .map((f) => [f.key, meta[f.key]?.trim() ?? ""])
          .filter(([, v]) => v !== "")
      );

      const res = await fetch(`/api/engagements/${engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stack: {
            ...(bookingPlatform ? { booking_platform: bookingPlatform } : {}),
            ...(Object.keys(metaPayload).length > 0 ? { booking_platform_meta: metaPayload } : {}),
            ...(emailPlatform ? { email_platform: emailPlatform } : {}),
            ...(webhookMode ? { webhook_receiver_mode: webhookMode } : {}),
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(data.error ?? "Failed to save.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-1 rounded border border-zinc-300 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 transition-all cursor-pointer"
      >
        <Settings2 className="w-3 h-3" /> Edit stack settings
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" /> Edit stack settings
        </p>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono leading-relaxed">
        Fixes a mistake made during onboarding — e.g. a wrong location ID — without deleting the client.
        This does not touch stored credential secrets; use &quot;Update credentials&quot; below for that.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 block">
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Booking platform</span>
          <select
            value={bookingPlatform}
            onChange={(e) => setBookingPlatform(e.target.value)}
            className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
          >
            <option value="">— not set —</option>
            {BOOKING_PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>{BOOKING_PLATFORM_LABELS[p]}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 block">
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Booking events received via</span>
          <select
            value={webhookMode}
            onChange={(e) => setWebhookMode(e.target.value as typeof webhookMode)}
            className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
          >
            <option value="">— not set —</option>
            <option value="webhook">
              {platformSupportsAutoWebhook(bookingPlatform)
                ? "Webhook (registered automatically)"
                : "Webhook (you paste this into the platform manually)"}
            </option>
            <option value="polling">
              Polling{platformSupportsAutoWebhook(bookingPlatform) ? "" : " (automatic fallback)"}
            </option>
            <option value="none">Not tracked</option>
          </select>
          {!platformSupportsAutoWebhook(bookingPlatform) && (
            <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 leading-relaxed">
              {BOOKING_PLATFORM_LABELS[bookingPlatform as keyof typeof BOOKING_PLATFORM_LABELS] ?? "This platform"} can&apos;t register a webhook by itself — polling covers you every 5 min until you paste one in (see the sync status card above).
            </p>
          )}
        </label>

        {activeMetaFields.map((f) => (
          <label key={f.key} className="space-y-1 block">
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">{f.label}</span>
            <input
              value={meta[f.key] ?? ""}
              onChange={(e) => setMeta((m) => ({ ...m, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
            />
          </label>
        ))}

        <label className="space-y-1 block">
          <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">Email platform</span>
          <select
            value={emailPlatform}
            onChange={(e) => setEmailPlatform(e.target.value as typeof emailPlatform)}
            className="w-full text-xs font-mono px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
          >
            <option value="">— not set —</option>
            {EMAIL_PLATFORM_OPTIONS.map((p) => (
              <option key={p} value={p}>{EMAIL_PLATFORM_LABELS[p]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-white disabled:opacity-50 transition-all cursor-pointer"
        >
          <Save className="w-3 h-3" /> {busy ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-[11px] font-mono text-gold-hover dark:text-gold">Saved.</span>}
        {error && <span className="text-[11px] font-mono text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
    </div>
  );
}
