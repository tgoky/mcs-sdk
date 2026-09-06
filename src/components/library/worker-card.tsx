"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, BarChart3 } from "lucide-react";
import type { WorkerDefinition } from "@/lib/worker-registry";

const PRODUCT_LABELS: Record<WorkerDefinition["productId"], string> = {
  showtime: "Showtime",
  "reputation-manager": "Reputation Manager",
};

const PRODUCT_ANALYTICS_HREF: Record<WorkerDefinition["productId"], string> = {
  showtime: "/dashboard/analytics",
  "reputation-manager": "/dashboard/reputation-manager/analytics",
};

const PRODUCT_ACCENT: Record<WorkerDefinition["productId"], string> = {
  showtime: "border-amber-200 dark:border-amber-900/70",
  "reputation-manager": "border-indigo-200 dark:border-indigo-900/70",
};

/**
 * One worker, one card — enabled or not, for exactly one client
 * (whichever engagement the Library page resolved as this workspace's
 * primary one). A worker with no such engagement to enable against
 * (brand-new workspace, nothing created yet) can't do anything from here
 * — the card still renders so the catalog stays browsable, but its
 * Enable action is disabled with an explanation rather than silently
 * failing on click.
 */
export function WorkerCard({
  worker,
  enabled,
  engagementId,
}: {
  worker: WorkerDefinition;
  enabled: boolean;
  engagementId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsOwnSetup = worker.runOnSetup;
  const bridgeHref = engagementId ? `/dashboard/engagements/${engagementId}/bridges/${worker.id}` : null;
  const configureHref = worker.hasHingesPanel && engagementId ? `/dashboard/engagements/${engagementId}/bridges/${worker.id}` : engagementId ? `/dashboard/engagements/${engagementId}` : null;
  const analyticsHref = PRODUCT_ANALYTICS_HREF[worker.productId];

  async function enable() {
    if (!engagementId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/engagements/${engagementId}/workers/${worker.id}/enable`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Could not enable ${worker.name}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not enable ${worker.name}.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border ${PRODUCT_ACCENT[worker.productId]} bg-white dark:bg-zinc-900/60 p-5 shadow-sm min-h-[200px]`}>
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">{worker.name}</h3>
            <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">{PRODUCT_LABELS[worker.productId]}</p>
          </div>
          {enabled && (
            <span className="shrink-0 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">
              Enabled
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{worker.description}</p>
      </div>

      <div className="pt-4 flex items-center gap-2">
        {enabled ? (
          <>
            {configureHref && (
              <Link
                href={configureHref}
                title="Configure"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 w-8 h-8 text-zinc-700 dark:text-zinc-200 transition-colors"
              >
                <Settings className="w-4 h-4" />
              </Link>
            )}
            <Link
              href={analyticsHref}
              title="Analytics"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 w-8 h-8 text-zinc-700 dark:text-zinc-200 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
            </Link>
          </>
        ) : needsOwnSetup ? (
          bridgeHref ? (
            <Link
              href={bridgeHref}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors"
            >
              Set up {worker.name}
            </Link>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-500">Create a client first to set this up.</span>
          )
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={pending || !engagementId}
            title={!engagementId ? "Create a client first" : undefined}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors cursor-pointer"
          >
            {pending ? "Enabling…" : "Enable"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
