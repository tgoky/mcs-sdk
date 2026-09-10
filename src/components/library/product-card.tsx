"use client";

// src/components/library/product-card.tsx
//
// The Library's top-level unit is a Worker (Showtime, Reputation Manager)
// — the thing you actually Install/Uninstall — not a Skill (Show Rate
// Setup, Pre-Call Sequence, ...), which lives *inside* a worker and gets
// enabled/configured once that worker is installed. The previous flat
// grid put a Skill's own Install button at the top level, which both
// mislabeled the action (a Skill can't be installed, only enabled) and
// left nowhere for a real Uninstall to live. This card is that top level:
// read what a worker does, see its real workload, install or uninstall
// it, and drill into its own page to work with its skills.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Trash2, ArrowUpRight, Loader2 } from "lucide-react";
import { getWorkerDefinition, type WorkerId } from "@/lib/worker-registry";
import { HOME_COPY } from "@/lib/copy";
import { StatChip } from "@/components/library/stat-chip";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { RepSkillBadge } from "@/components/rep-skill-badge";
import type { RepSkillId } from "@/lib/rep-skill-manifest";

export function ProductCard({
  productId,
  name,
  description,
  image,
  installed,
  skillIds,
  isRep,
  enabledCount,
  runsInWindow,
  successRate,
}: {
  productId: string;
  name: string;
  description: string;
  /** Real artwork from WORKSPACE_PRODUCTS (copy.ts) — the app-store-style
   * hero look the old Library had, brought back onto today's two-tier
   * card without touching the Install/Enable machinery underneath it. */
  image: string;
  installed: boolean;
  /** Every skill this worker bundles, for the "Inside" preview row. */
  skillIds: WorkerId[];
  isRep: boolean;
  enabledCount: number;
  runsInWindow: number;
  successRate: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleInstalled() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/packages/${productId}`, { method: installed ? "DELETE" : "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not ${installed ? "uninstall" : "install"} ${name}.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${installed ? "uninstall" : "install"} ${name}.`);
    } finally {
      setPending(false);
    }
  }

  const skillNames = skillIds.map((id) => getWorkerDefinition(id).name).join(", ");

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl surface-glass-2 p-6 hover-lift hover:shadow-elevation-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
      <Link href={`/dashboard/library/${productId}`} className="space-y-5 block">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt={name}
              className="w-16 h-16 shrink-0 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  {name}
                </h2>
                {installed && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                    <Download size={11} className="stroke-[2.5]" /> Installed
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">By {HOME_COPY.footerNote}</p>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed mt-1.5 max-w-md">{description}</p>
            </div>
          </div>
          <ArrowUpRight
            size={18}
            className="shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
          />
        </div>

        <div className="flex items-center gap-6">
          <StatChip label="Skills on" value={`${enabledCount}/${skillIds.length}`} />
          <StatChip label="Runs (7d)" value={String(runsInWindow)} />
          <StatChip
            label="Success rate"
            value={successRate !== null ? `${successRate}%` : "—"}
            tone={successRate === null ? "neutral" : successRate >= 80 ? "success" : "warning"}
          />
        </div>

        <div className="flex items-start gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800/80">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 shrink-0 pt-0.5">
            Inside
          </span>
          <div className="flex items-center -space-x-1.5 shrink-0">
            {skillIds.map((id) =>
              isRep ? (
                <div key={id} className="ring-2 ring-white dark:ring-zinc-900 rounded-full">
                  <RepSkillBadge skill={id as RepSkillId} size={20} />
                </div>
              ) : (
                <div key={id} className="ring-2 ring-white dark:ring-zinc-900 rounded-full">
                  <SquishySkillBadge skill={id} size={20} />
                </div>
              )
            )}
          </div>
          <span className="text-xs text-zinc-700 dark:text-zinc-300 ml-1 font-mono text-[11px] font-medium leading-snug">
            {skillNames}
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-2 pt-4 mt-1">
        <button
          type="button"
          onClick={toggleInstalled}
          disabled={pending}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 hover-lift press-settle shadow-elevation-1 ${
            installed
              ? "border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-300 dark:hover:border-rose-800 hover:text-rose-700 dark:hover:text-rose-300 text-zinc-700 dark:text-zinc-200"
              : "bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900"
          }`}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : installed ? (
            <Trash2 size={13} />
          ) : (
            <Download size={13} />
          )}
          {pending ? (installed ? "Uninstalling…" : "Installing…") : installed ? "Uninstall" : "Install"}
        </button>
        <Link
          href={`/dashboard/library/${productId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          View skills <ArrowUpRight size={12} />
        </Link>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
