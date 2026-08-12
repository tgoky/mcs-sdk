"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface EngagementResult {
  engagementId: string;
  buyer: string;
  confirmationPageUrl: string | null;
  confirmationPageDeployment?: {
    mode: "live" | "paste_ready" | "not_deployed";
    reason?: string;
  } | null;
  pasteReadyHtml?: string | null;
  pasteReadyInstructions?: string | null;
  // Pin-Down recovery gap 3 — hero + breakout video scripts
  pinDownScriptPack?: {
    generatedAt: string;
    heroScript: {
      title: string;
      targetLengthSeconds: number;
      chapters: Array<{ timestampLabel: string; beat: string; script: string }>;
      recordingPrompt: string;
    };
    breakoutScripts: Array<{
      id: string;
      title: string;
      script: string;
      recordingPrompt: string;
      sourceQuestion?: string;
    }>;
  } | null;
  // Pin-Down recovery gap 7 — existing-confirmation-page audit
  pinDownPageAudit?: {
    auditedUrl: string;
    existingPageStrengths: string[];
    existingPageWeaknesses: string[];
    v1Improvements: string[];
  } | null;
}

/**
 * The "setup complete" screen — extracted out of engagements/new/page.tsx
 * so it can be shown both there (right after submitting) and on the run
 * detail page (if the buyer navigates away and comes back once a pin-down
 * run finishes). Self-fetches from GET /api/engagements/[id] rather than
 * receiving this data as props, since it no longer arrives synchronously
 * in the setup POST response — see src/app/api/engagements/setup/route.ts
 * for why that changed.
 *
 * Restyled onto the app's actual bg-card/border-border Tailwind tokens
 * instead of a var(--surface) inline-style-per-element pattern — same
 * visual system as the rest of the dashboard, and each card now carries
 * a colored left accent (gold = fully done, indigo = one manual step
 * left) so the status reads at a glance instead of every card looking
 * like the same undifferentiated box.
 */
export function PinDownResultCard({ engagementId }: { engagementId: string }) {
  const router = useRouter();
  const [data, setData] = useState<EngagementResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engagements/${engagementId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load engagement.");
        return json.engagement as EngagementResult;
      })
      .then((engagement) => {
        if (!cancelled) setData(engagement);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Something went wrong.");
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  if (loadError) {
    return (
      <div className="rounded-lg p-4 text-sm font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 shadow-sm animate-in fade-in-50 duration-200">
        Couldn&apos;t load the setup result: {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg p-4 text-sm font-mono text-zinc-500 dark:text-zinc-400 bg-card border border-border animate-pulse shadow-sm">
        Loading setup result…
      </div>
    );
  }

  const isPasteReady = data.confirmationPageDeployment?.mode === "paste_ready";

  return (
    <div className="space-y-4 w-full max-w-none text-zinc-600 dark:text-zinc-400 transition-colors duration-200">

      {/* Primary status card — colored left accent flags status at a glance */}
      <div
        className={`rounded-lg p-5 space-y-2.5 shadow-sm bg-card border border-border border-l-4 ${
          isPasteReady ? "border-l-indigo-500 dark:border-l-indigo-400" : "border-l-ink"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-mono font-bold shrink-0 ${
              isPasteReady
                ? "bg-indigo-600 dark:bg-indigo-500 text-white"
                : "bg-ink text-ink-foreground"
            }`}
          >
            {isPasteReady ? "!" : "✓"}
          </span>
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {isPasteReady ? "Setup complete — one manual step left" : "Setup complete"}
          </span>
        </div>
        <p className="text-sm font-normal leading-relaxed">
          {isPasteReady
            ? "Bookings will now flow in automatically. The confirmation page couldn't be auto-published to the client's hosting platform, so it's ready to paste in manually below."
            : "This client's account is ready. Bookings will now flow in automatically, and their confirmation page is live on their own site, ready for prospects."}
        </p>
      </div>

      {/* Manual paste-code block */}
      {isPasteReady && data.pasteReadyHtml && (
        <div className="rounded-lg p-4 space-y-3 shadow-sm bg-card border border-border">
          <p className="text-xs font-bold leading-relaxed text-zinc-900 dark:text-zinc-100">
            {data.pasteReadyInstructions}
          </p>
          {data.confirmationPageDeployment?.reason && (
            <p className="text-[13px] font-mono p-2 rounded bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300">
              Reason: {data.confirmationPageDeployment.reason}
            </p>
          )}
          <div className="flex items-center justify-between pt-1 font-mono">
            <span className="text-[13px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">Page HTML</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(data.pasteReadyHtml ?? "")}
              className="px-2.5 py-1 text-[13px] font-bold rounded-md transition-all cursor-pointer border border-border bg-black/[0.02] dark:bg-white/5 hover:bg-black/[0.05] dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-200"
            >
              Copy HTML
            </button>
          </div>
          <textarea
            readOnly
            value={data.pasteReadyHtml}
            rows={6}
            className="w-full rounded-md px-3 py-2 text-[13px] font-mono resize-y focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 shadow-inner bg-black/[0.03] dark:bg-black/20 border border-border text-zinc-700 dark:text-zinc-300"
          />
        </div>
      )}

      {/* Engagement ID + confirmation link */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg p-4 space-y-1 shadow-sm bg-card border border-border">
          <p className="text-[13px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-500">Engagement ID</p>
          <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{data.engagementId}</p>
        </div>

        <div className="rounded-lg p-4 space-y-1 shadow-sm bg-card border border-border">
          <p className="text-[13px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            {isPasteReady ? "Preview Link (temporary)" : "Confirmation Page Link"}
          </p>
          {data.confirmationPageUrl && (
            <a
              href={data.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm underline underline-offset-4 break-all block transition-colors font-bold text-ink-hover dark:text-ink hover:opacity-80"
            >
              {data.confirmationPageUrl}
            </a>
          )}
        </div>
      </div>

      {/* Existing-page audit (Pin-Down recovery gap 7) */}
      {data.pinDownPageAudit && (
        <div className="rounded-lg p-4 space-y-3 shadow-sm bg-card border border-border">
          <p className="text-[13px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Existing Page Audit — {data.pinDownPageAudit.auditedUrl}
          </p>
          {data.pinDownPageAudit.existingPageStrengths.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">What&apos;s already working</p>
              <ul className="text-xs list-disc list-inside space-y-0.5 mt-1">
                {data.pinDownPageAudit.existingPageStrengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {data.pinDownPageAudit.existingPageWeaknesses.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Gaps the new page closes</p>
              <ul className="text-xs list-disc list-inside space-y-0.5 mt-1">
                {data.pinDownPageAudit.existingPageWeaknesses.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Hero + breakout video scripts (Pin-Down recovery gap 3) */}
      {data.pinDownScriptPack && (
        <div className="rounded-lg p-4 space-y-3 shadow-sm bg-card border border-border">
          <p className="text-[13px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Video Script Pack
          </p>
          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{data.pinDownScriptPack.heroScript.title}</p>
            <p className="text-xs italic mt-0.5">{data.pinDownScriptPack.heroScript.recordingPrompt}</p>
            <div className="mt-2 space-y-2">
              {data.pinDownScriptPack.heroScript.chapters.map((c, i) => (
                <div key={i} className="text-xs">
                  <span className="font-mono font-bold">{c.timestampLabel} · {c.beat}</span>
                  <p className="mt-0.5 leading-relaxed">{c.script}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-bold mb-2 text-zinc-900 dark:text-zinc-100">
              Breakout scripts ({data.pinDownScriptPack.breakoutScripts.length})
            </p>
            <div className="space-y-3">
              {data.pinDownScriptPack.breakoutScripts.map((b) => (
                <div key={b.id} className="text-xs">
                  <span className="font-mono font-bold">{b.title}</span>
                  <p className="mt-0.5 leading-relaxed">{b.script}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => router.push(`/dashboard/engagements/${data.engagementId}`)}
        className="px-4 py-2 text-sm font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer hover:opacity-90 active:translate-y-px text-ink-foreground bg-ink hover:bg-ink-hover shadow-sm"
      >
        Go to Client Dashboard
      </button>
    </div>
  );
}
