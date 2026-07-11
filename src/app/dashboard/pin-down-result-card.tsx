"use client";

import { useEffect, useRef, useState } from "react";
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
}

/**
 * The "setup complete" screen — extracted out of engagements/new/page.tsx
 * so it can be shown both there (right after submitting) and on the run
 * detail page (if the buyer navigates away and comes back once a pin-down
 * run finishes). Self-fetches from GET /api/engagements/[id] rather than
 * receiving this data as props, since it no longer arrives synchronously
 * in the setup POST response — see src/app/api/engagements/setup/route.ts
 * for why that changed.
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
      .catch((e: any) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  if (loadError) {
    return (
      <div className="rounded-lg p-4 text-sm font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 shadow-sm animate-in fade-in-50 duration-200">
        Couldn't load the setup result: {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg p-4 text-sm font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse shadow-sm">
        Loading setup result…
      </div>
    );
  }

  const isPasteReady = data.confirmationPageDeployment?.mode === "paste_ready";

  return (
    <div className="space-y-6 w-full max-w-none transition-colors duration-200" style={{ color: "var(--text-secondary)" }}>
      
      {/* Primary Status Card Wrapper */}
      <div className="rounded-lg p-5 space-y-2.5 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center space-x-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
              isPasteReady
                ? "bg-indigo-600 dark:bg-indigo-500 text-white"
                : "bg-emerald-600 dark:bg-emerald-400 text-white dark:text-zinc-950"
            }`}
          >
            {isPasteReady ? "!" : "✓"}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {isPasteReady ? "Setup complete — one manual step left" : "Setup complete"}
          </span>
        </div>
        <p className="text-sm font-normal leading-relaxed">
          {isPasteReady
            ? "Bookings will now flow in automatically. The confirmation page couldn't be auto-published to the client's hosting platform, so it's ready to paste in manually below."
            : "This client's account is ready. Bookings will now flow in automatically, and their confirmation page is live on their own site, ready for prospects."}
        </p>
      </div>

      {/* Manual Paste Code Interface Block */}
      {isPasteReady && data.pasteReadyHtml && (
        <div className="rounded-lg p-4 space-y-3 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-bold leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {data.pasteReadyInstructions}
          </p>
          {data.confirmationPageDeployment?.reason && (
            <p className="text-[11px] font-mono p-2 rounded bg-red-500/5 border border-red-500/10" style={{ color: "var(--error)" }}>
              Reason: {data.confirmationPageDeployment.reason}
            </p>
          )}
          <div className="flex items-center justify-between pt-1 font-mono">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Page HTML</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(data.pasteReadyHtml ?? "")}
              className="px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer border bg-background/50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              Copy HTML
            </button>
          </div>
          <textarea
            readOnly
            value={data.pasteReadyHtml}
            rows={6}
            className="w-full rounded-md px-3 py-2 text-[11px] font-mono resize-y focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 shadow-inner"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          />
        </div>
      )}

      {/* Metadata ID + Link Grid Parameters Layout */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg p-4 space-y-1 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Engagement ID</p>
          <p className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{data.engagementId}</p>
        </div>

        <div className="rounded-lg p-4 space-y-1 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {isPasteReady ? "Preview Link (temporary)" : "Confirmation Page Link"}
          </p>
          {data.confirmationPageUrl && (
            <a
              href={data.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm underline underline-offset-4 break-all block transition-colors font-bold hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              {data.confirmationPageUrl}
            </a>
          )}
        </div>
      </div>

      {/* Call to action panel trigger button */}
      <button
        onClick={() => router.push(`/dashboard/engagements/${data.engagementId}`)}
        className="px-4 py-2 text-sm font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer hover:opacity-90 active:translate-y-px text-white shadow-sm"
        style={{ background: "var(--accent)" }}
      >
        Go to Client Dashboard
      </button>
    </div>
  );
}