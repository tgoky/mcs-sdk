"use client";

// src/app/dashboard/engagements/[id]/confirmation-page-row.tsx
//
// The page Show Rate Setup exists to build: where it lives, whether it's
// live, and the way to rebuild it. Shown first on Show Rate Setup's own
// page, above the pieces it's made from (voice, briefs, scripts).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Copy, Loader2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";

export type ConfirmationPageState = {
  url: string | null;
  deployment: {
    mode: "live" | "paste_ready" | "not_deployed" | "pending_review";
    deployedVia?: string;
    reason?: string;
    pendingActionId?: string;
    lastAttemptedAt: string;
  } | null;
  pasteReadyHtml: string | null;
  pasteReadyInstructions: string | null;
};

const HOST_LABELS: Record<string, string> = {
  webflow: "Webflow",
  wordpress: "WordPress",
  nextjs_vercel: "Vercel",
  vercel: "Vercel",
};

function when(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One line saying where the page stands, for the row's collapsed subtitle. */
export function confirmationPageSummary(page: ConfirmationPageState): string {
  const mode = page.deployment?.mode;
  if (mode === "live") return `Live${page.deployment?.deployedVia ? ` on ${HOST_LABELS[page.deployment.deployedVia] ?? page.deployment.deployedVia}` : ""}`;
  if (mode === "paste_ready") return "Built. Paste it into the site to go live";
  if (mode === "pending_review") return "Built. Waiting for approval before it's published";
  if (mode === "not_deployed") return "Not published";
  return page.url ? "Preview ready" : "Not built yet";
}

export function ConfirmationPageBody({ engagementId, page }: { engagementId: string; page: ConfirmationPageState }) {
  const router = useRouter();
  const toast = useToast();
  const [building, setBuilding] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mode = page.deployment?.mode ?? null;
  const at = when(page.deployment?.lastAttemptedAt);

  async function rebuild() {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/pin-down/run-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piece: "confirmation_page" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't start the rebuild.");
      setRunId(json.runId ?? null);
      toast.success(page.url ? "Rebuilding the confirmation page." : "Building the confirmation page.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the rebuild.");
    } finally {
      setBuilding(false);
    }
  }

  async function copyHtml() {
    try {
      await navigator.clipboard.writeText(page.pasteReadyHtml ?? "");
      toast.success("Page HTML copied.");
    } catch {
      toast.error("Couldn't copy. Select the HTML below and copy it by hand.");
    }
  }

  return (
    <div className="space-y-4 pt-1 text-sm">
      {page.url ? (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{mode === "live" ? "Live at" : "Preview at"}</p>
          <a
            href={page.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 break-all font-medium text-zinc-900 underline underline-offset-4 hover:opacity-80 dark:text-zinc-100"
          >
            {page.url}
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
          </a>
          {at && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Last published {at}</p>}
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          The page every prospect sees after booking, in the client&apos;s own brand. It hasn&apos;t been built yet.
        </p>
      )}

      {mode === "pending_review" && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
          Built and waiting for someone to approve it in the Queue before it&apos;s published to the site.
        </p>
      )}

      {(mode === "paste_ready" || mode === "not_deployed") && page.deployment?.reason && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
          It couldn&apos;t be published automatically: {page.deployment.reason}
        </p>
      )}

      {mode === "paste_ready" && page.pasteReadyHtml && (
        <div className="space-y-2">
          {page.pasteReadyInstructions && <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{page.pasteReadyInstructions}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Page HTML</span>
            <button
              type="button"
              onClick={copyHtml}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-[12px] font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <Copy className="h-3 w-3" /> Copy HTML
            </button>
          </div>
          <textarea
            readOnly
            value={page.pasteReadyHtml}
            rows={5}
            aria-label="Page HTML"
            className="w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[12px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={rebuild}
          disabled={building}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {building && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {page.url ? "Rebuild the page" : "Build the page"}
        </button>
        {runId && (
          <a href={`/dashboard/runs/${runId}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            Follow the run <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
        {error && <p className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
