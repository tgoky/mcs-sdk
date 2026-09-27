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
import { Download, Trash2, ArrowUpRight, Loader2, PackageCheck } from "lucide-react";
import { getWorkerDefinition, type WorkerId } from "@/lib/worker-registry";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { useToast } from "@/components/toast/toast-provider";

/** Badges shown before "+N": enough to recognise the product at a glance. */
const BADGE_CAP = 5;

export function ProductCard({
  productId,
  name,
  description,
  image,
  installed,
  skillIds,
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
  enabledCount: number;
  runsInWindow: number;
  successRate: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skillNames = skillIds.map((id) => getWorkerDefinition(id).name).join(", ");

  async function toggleInstalled() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/packages/${productId}`, { method: installed ? "DELETE" : "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Could not ${installed ? "uninstall" : "install"} ${name}.`);
      if (installed) {
        // Uninstalling: stay put, just refresh this card's state.
        toast.success(`${name} uninstalled.`);
        router.refresh();
      } else {
        toast.success(`${name} installed.`);
        // Installing: a silent grid refresh left people staring at a
        // relabeled button with no next step — go straight to the
        // product's own page, where its first (onboarding) skill is
        // already the prominent "Set up {worker}" action.
        router.push(`/dashboard/library/${productId}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${installed ? "uninstall" : "install"} ${name}.`);
    } finally {
      setPending(false);
    }
  }

  const shown = skillIds.slice(0, BADGE_CAP);
  const more = skillIds.length - shown.length;

  // A small square tile: logo, name, the skills as a short badge stack
  // with how many are on, then the numbers. The tile opens the product;
  // Install is a small button, Uninstall a quiet icon.
  return (
    <div className="group relative flex aspect-square flex-col rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:hover:border-zinc-700">
      <Link href={`/dashboard/library/${productId}`} aria-label={`Open ${name}`} className="absolute inset-0 rounded-lg" />
      <ArrowUpRight size={13} className="absolute right-3 top-3 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-900 dark:text-zinc-500 dark:group-hover:text-zinc-100" />
      {/* The logo, large and centred in the space above the name. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-14 w-14 object-contain transition-transform group-hover:scale-105" />
      </div>

      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-bold text-zinc-900 group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-400" title={description}>
          {name}
        </h2>
        <p className="flex items-center gap-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
          {installed ? (
            <>
              <PackageCheck size={12} className="shrink-0 text-emerald-500" aria-hidden="true" /> Installed
            </>
          ) : (
            "Not installed"
          )}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-1.5" title={skillNames}>
        <div className="flex items-center -space-x-1">
          {shown.map((id) => (
            <div key={id} className="rounded-full ring-2 ring-white dark:ring-zinc-900">
              <AnySkillBadge skill={id} size={14} />
            </div>
          ))}
        </div>
        {more > 0 && <span className="text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">+{more}</span>}
        <span className="ml-auto text-[10.5px] tabular-nums text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{enabledCount}/{skillIds.length}</span> on
        </span>
      </div>

      <div className="relative z-10 mt-2 flex items-center gap-1.5 border-t border-zinc-200 pt-2 text-[10.5px] tabular-nums text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
        <span title="Runs in the last 7 days">{runsInWindow} runs</span>
        <span aria-hidden="true">·</span>
        <span
          title="Success rate"
          className={successRate === null ? "" : successRate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}
        >
          {successRate !== null ? `${successRate}%` : "No data"}
        </span>
        <button
          type="button"
          onClick={toggleInstalled}
          disabled={pending}
          data-tour="product-card-install"
          aria-label={installed ? `Uninstall ${name}` : `Install ${name}`}
          title={installed ? "Uninstall" : "Install"}
          className={`ml-auto inline-flex items-center gap-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
            installed
              ? "p-1 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
              : "bg-zinc-900 px-2 py-0.5 font-bold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          }`}
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : installed ? <Trash2 size={11} /> : <Download size={11} />}
          {!installed && (pending ? "Installing…" : "Install")}
        </button>
      </div>
      {error && <p className="relative z-10 mt-1 text-[10.5px] leading-snug text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
