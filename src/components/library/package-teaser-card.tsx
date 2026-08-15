import Link from "next/link";
import { Gavel, Lock, FileWarning, Bell, ShieldCheck, ArrowRight } from "lucide-react";

export function PackageTeaserCard() {
  return (
    <Link
      href="/dashboard/library/counter-claim"
      className="group relative flex flex-col justify-between rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 backdrop-blur-md p-6 transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-700 shadow-sm hover:shadow-md"
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/90 dark:bg-amber-500/90 opacity-80 group-hover:scale-105 transition-transform">
              <Gavel size={26} className="text-zinc-950 stroke-[2.3px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-200 truncate">
                  Counter Claim
                </h2>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 mt-0.5">By Mudd Labs</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 shrink-0">
            <Lock size={11} /> Coming Soon
          </span>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          Automated dispute responses for chargebacks — evidence packs and alerts generated as disputes come in.
        </p>

        <div className="space-y-2 py-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
            Planned Capabilities
          </span>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 font-sans">
            <div className="flex items-center gap-2">
              <FileWarning size={13} className="text-zinc-400 shrink-0" />
              <span>Automated evidence pack generation</span>
            </div>
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-zinc-400 shrink-0" />
              <span>Real-time chargeback dispute alerts</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} className="text-zinc-400 shrink-0" />
              <span>Unified workspace integration</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>Disputes &amp; Compliance</span>
        <span className="inline-flex items-center gap-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
          View Teaser <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}