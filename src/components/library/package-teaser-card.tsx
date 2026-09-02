import Link from "next/link";
import { Lock, FileWarning, Bell, ShieldCheck, ArrowRight, Brain, Database, MessageSquare, Radar } from "lucide-react";

export function PackageTeaserCard() {
  return (
    <Link
      href="/dashboard/library/counter-claim"
      className="group relative flex flex-col justify-between rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 backdrop-blur-md p-6 transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-700 shadow-sm hover:shadow-md"
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src="/images/repm.png"
              alt="Counter Claim"
              className="w-20 h-20 shrink-0 object-contain group-hover:scale-105 transition-transform"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-200 truncate">
                  Reputation Manager
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
          9-skill counter-claim pack with AI panel, Trustpilot/Reddit monitoring, Schema.org markup, and crisis playbook.
        </p>

        <div className="space-y-2 py-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 block">
            Planned Capabilities
          </span>
          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 font-sans">
            <div className="flex items-center gap-2">
              <Brain size={13} className="text-zinc-400 shrink-0" />
              <span>46-prompt AI engine </span>
            </div>
            <div className="flex items-center gap-2">
              <Database size={13} className="text-zinc-400 shrink-0" />
              <span>Schema.org JSON-LD + Wikidata disambiguation</span>
            </div>
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-zinc-400 shrink-0" />
              <span>7am/7pm scheduled runs with ntfy.sh + Twilio alerts</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} className="text-zinc-400 shrink-0" />
              <span>Threshold-80 crisis trigger + 6 force-trigger classes</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare size={13} className="text-zinc-400 shrink-0" />
              <span>Trustpilot & Reddit ingestion (read-only + comment ramp)</span>
            </div>
            <div className="flex items-center gap-2">
              <Radar size={13} className="text-zinc-400 shrink-0" />
              <span>Buyer-only authority to declare/publish responses</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>Reputation Manager Workers </span>
        <span className="inline-flex items-center gap-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
          View Teaser <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}