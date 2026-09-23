"use client";

// Phase 3's "preview-first entry point," extended past the original 3
// workers (pin-down, pre-call-read, icp-lock) per this session's own
// follow-up review. Unlike a mockup (rejected — a fake finding risks
// looking like a real one and setting a false expectation), this is a
// REAL, read-only scan of the client's current pipeline against their
// aging threshold: the credential is guaranteed present by the time
// anyone reaches this screen (Leak-Map is gated behind Pin-Down's own
// onboarding, and Pin-Down can't be armed without emailPlatform +
// emailPlatformCredential — the same credential this preview reads), for
// clients whose email platform is hubspot or ghl specifically, which is
// the only case this feature covers in a real run either way.
//
// Reads whatever aging_threshold_days is currently on file (default 30
// if never set) — there's no UI field on this screen to change it today
// (agingThresholdDays has a real schema slot and default from Phase 6,
// but no input anywhere yet collects it; a real, separate gap, not
// silently worked around here), so this preview reflects the threshold
// as-is rather than letting it be tuned live.

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

type PreviewResult =
  | { ok: true; platform: "hubspot" | "ghl"; agingThresholdDays: number; openCount: number; agingCount: number }
  | { ok: false; reason: "not_configured" | "no_credential" | "no_location_id" | "fetch_failed" };

const REASON_COPY: Record<string, string> = {
  not_configured: "Not available. This only covers clients on HubSpot or GHL as their email/CRM platform.",
  no_credential: "Waiting on your HubSpot/GHL credential. Connect it in Update Credentials to see a live preview here.",
  no_location_id: "Waiting on a GHL location id in the booking/email platform metadata.",
  fetch_failed: "Couldn't reach the CRM right now. This doesn't block saving, just try again in a bit.",
};

export function LeakMapLivePreview({ engagementId }: { engagementId: string }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/engagements/${engagementId}/bridges/leak-map/pipeline-aging-preview`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setResult({ ok: false, reason: "fetch_failed" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">Pipeline aging: live scan</span>
        </div>
      </div>
      <div className="p-3 bg-white dark:bg-zinc-950">
        {loading ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Scanning your current pipeline…</p>
        ) : result?.ok ? (
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            Of <span className="font-semibold">{result.openCount}</span> open {result.platform === "hubspot" ? "deals" : "opportunities"} right now,{" "}
            <span className="font-semibold">{result.agingCount}</span> {result.agingCount === 1 ? "has" : "have"} been in the pipeline longer than{" "}
            <span className="font-semibold">{result.agingThresholdDays} days</span> , exactly what Leak-Map's report would flag today.
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{REASON_COPY[result?.reason ?? "fetch_failed"]}</p>
        )}
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed border-t border-zinc-100 dark:border-zinc-900">
        A real, read-only scan of your current pipeline. Nothing here is written anywhere, and it's the same aging
        threshold check Leak-Map's own report uses.
      </p>
    </div>
  );
}
