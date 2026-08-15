import Link from "next/link";
import { ArrowUpRight, Gavel } from "lucide-react";

export function PackageTeaserCard() {
  return (
    <Link
      href="/dashboard/library/counter-claim"
      className="group block rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/30 transition-colors p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/90 dark:bg-amber-500/90 opacity-80">
            <Gavel size={20} className="text-zinc-950 stroke-[2.3px]" />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-zinc-300">Counter Claim</h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-md">
              Automated dispute responses for chargebacks — evidence packs and alerts generated as
              disputes come in.
            </p>
          </div>
        </div>
        <ArrowUpRight size={16} className="shrink-0 text-zinc-700 group-hover:text-zinc-500 transition-colors" />
      </div>
    </Link>
  );
}
