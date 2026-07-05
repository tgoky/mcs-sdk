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
      <div className="rounded-lg p-4 text-sm text-rose-400 bg-rose-950/20 border border-rose-900/40">
        Couldn't load the setup result: {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg p-4 text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 animate-pulse">
        Loading setup result…
      </div>
    );
  }

  const isPasteReady = data.confirmationPageDeployment?.mode === "paste_ready";

  return (
    <div className="space-y-6 w-full max-w-none" style={{ color: "var(--text-secondary)" }}>
      <div className="rounded-lg p-5 space-y-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center space-x-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
            style={{
              background: isPasteReady ? "var(--accent)" : "var(--success)",
              color: isPasteReady ? "#fff" : "#04140f",
            }}
          >
            {isPasteReady ? "!" : "✓"}
          </span>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {isPasteReady ? "Setup complete — one manual step left" : "Setup complete"}
          </span>
        </div>
        <p className="text-sm font-normal">
          {isPasteReady
            ? "Bookings will now flow in automatically. The confirmation page couldn't be auto-published to the client's hosting platform, so it's ready to paste in manually below."
            : "This client's account is ready. Bookings will now flow in automatically, and their confirmation page is live on their own site, ready for prospects."}
        </p>
      </div>

      {isPasteReady && data.pasteReadyHtml && (
        <div className="rounded-lg p-4 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            {data.pasteReadyInstructions}
          </p>
          {data.confirmationPageDeployment?.reason && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Reason: {data.confirmationPageDeployment.reason}
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Page HTML</span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(data.pasteReadyHtml ?? "")}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
              style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
            >
              Copy HTML
            </button>
          </div>
          <textarea
            readOnly
            value={data.pasteReadyHtml}
            rows={6}
            className="w-full rounded-md px-3 py-2 text-[11px] font-mono resize-y focus:outline-none"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg p-4 space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Engagement ID</p>
          <p className="font-mono text-sm" style={{ color: "var(--text-primary)" }}>{data.engagementId}</p>
        </div>

        <div className="rounded-lg p-4 space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {isPasteReady ? "Preview Link (temporary)" : "Confirmation Page Link"}
          </p>
          {data.confirmationPageUrl && (
            <a
              href={data.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm underline underline-offset-4 break-all block transition-colors"
              style={{ color: "var(--accent)" }}
            >
              {data.confirmationPageUrl}
            </a>
          )}
        </div>
      </div>

      <button
        onClick={() => router.push(`/dashboard/engagements/${data.engagementId}`)}
        className="px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Go to Client Dashboard
      </button>
    </div>
  );
}
