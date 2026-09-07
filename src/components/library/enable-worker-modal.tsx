"use client";

// src/components/library/enable-worker-modal.tsx
//
// Phase 5's "lighter form, grouped rows, not a long form" fallback for
// enabling a worker without chat. Scoped deliberately narrow, not a
// generic modal driven blindly off worker-registry.ts's configFields:
// most workers with real "ask" fields already have a genuine home for
// them — pre-call-read/leak-map/win-back all have hasHingesPanel: true,
// a real dedicated setup page reachable via "Configure" once enabled.
// pile-on is the one worker with real ask-kind fields (see
// worker-registry.ts's own "pile-on" entry) and NO hinges panel at all —
// clicking Enable for it today does a blind toggle, leaving smsPlatform/
// adDataPlatform silently defaulted rather than asked.
//
// Only asks the two fields safely persistable through the existing,
// deliberately-scoped PATCH /api/engagements/[id] route (see that
// route's own header comment — it explicitly allowlists sms_platform and
// ad_data_platform, not an arbitrary stack merge). pile-on's other
// classified ask fields (smsA2p10dlcStatus, smsComplianceFooterVariant,
// existingPileOnSequenceFlagged) aren't in that allowlist and don't get
// asked here — they're real, but a 30-second enable flow isn't the place
// to also collect SMS compliance registration details; Edit Stack
// Settings and Pin-Down's own setup screen already own those. "Skip for
// now" leaves the platform choices at "none" (today's actual default
// behavior), never blocking enabling on answering them.
//
// Generalizing this into a registry-driven form for every worker is a
// real future step, once a second worker needs the same treatment —
// same "generalize once a real second example exists" bar this codebase
// applies everywhere else, not before.

import { useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Modal } from "@/components/modal";
import { SMS_PLATFORM_LABELS, AD_DATA_PLATFORM_LABELS } from "@/lib/copy";

const SMS_OPTIONS = ["none", "twilio", "ghl_sms", "hubspot_sms"];
const AD_DATA_OPTIONS = ["none", "hyros", "google_sheets", "native_crm"];

export function EnablePileOnModal({
  engagementId,
  onClose,
  onEnabled,
}: {
  engagementId: string;
  onClose: () => void;
  onEnabled: () => void;
}) {
  const [smsPlatform, setSmsPlatform] = useState("none");
  const [adDataPlatform, setAdDataPlatform] = useState("none");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(skip: boolean) {
    setPending(true);
    setError(null);
    try {
      if (!skip && (smsPlatform !== "none" || adDataPlatform !== "none")) {
        const patchRes = await fetch(`/api/engagements/${engagementId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stack: {
              ...(smsPlatform !== "none" ? { sms_platform: smsPlatform } : {}),
              ...(adDataPlatform !== "none" ? { ad_data_platform: adDataPlatform } : {}),
            },
          }),
        });
        if (!patchRes.ok) {
          const body = await patchRes.json().catch(() => ({}));
          throw new Error(body?.error ?? "Failed to save the platform choice.");
        }
      }

      const enableRes = await fetch(`/api/engagements/${engagementId}/workers/pile-on/enable`, { method: "POST" });
      if (!enableRes.ok) {
        const body = await enableRes.json().catch(() => ({}));
        throw new Error(body?.error ?? "Could not enable Pile-On.");
      }
      onEnabled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="Enable Pile-On" onClose={onClose}>
      <div className="space-y-4 font-sans">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Two quick choices, both optional — skip either and it defaults to off, same as enabling without this. Finer setup (SMS compliance
          registration, ad-cohort account details) continues from Edit Stack Settings after enabling.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">SMS follow-ups</label>
          <select
            value={smsPlatform}
            onChange={(e) => setSmsPlatform(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-200"
          >
            {SMS_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {SMS_PLATFORM_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">Ad-data cohort sync</label>
          <select
            value={adDataPlatform}
            onChange={(e) => setAdDataPlatform(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-200"
          >
            {AD_DATA_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {AD_DATA_PLATFORM_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer disabled:opacity-40"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white px-3.5 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Enable Pile-On
          </button>
        </div>
      </div>
    </Modal>
  );
}
