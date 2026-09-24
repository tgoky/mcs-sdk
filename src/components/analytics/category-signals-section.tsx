import Link from "next/link";
import { TriangleAlert, Radar, Send, FileSearch, ShieldAlert, type LucideIcon } from "lucide-react";
import { workerPrimaryHref } from "@/lib/worker-registry";
import type { CategorySignal } from "@/features/reports/server/category-signals";
import type { WorkerCategory } from "@/lib/worker-registry";

// One glyph per fixed WorkerCategory (SIGNAL_CATEGORIES in
// category-signals.ts) — purely decorative, but it's what turns a flat
// list of labels into something that reads as a real taxonomy rather
// than four interchangeable rows of text.
const CATEGORY_ICONS: Record<WorkerCategory, LucideIcon> = {
  Setup: FileSearch,
  Monitoring: Radar,
  "Outreach & Sequences": Send,
  "Analysis & Briefing": FileSearch,
  "Crisis & Recovery": ShieldAlert,
};

/**
 * The deep-dive layer for Analytics, one card per WorkerCategory (4,
 * permanently) instead of one hardcoded section per worker. Each category
 * is its own bounded card — an icon, a name, and either "All quiet" or the
 * real flags — so the section reads as a small dashboard of fixed slots
 * instead of a plain list of horizontal rules that happens to have four
 * rows today.
 */
export function CategorySignalsSection({ signals }: { signals: CategorySignal[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          By category
        </h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Anything flagged across every client, grouped by what kind of work it is. A category stays quiet until one
          of its workers actually has something real to flag.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {signals.map((signal) => {
          const Icon = CATEGORY_ICONS[signal.category] ?? FileSearch;
          const isQuiet = signal.items.length === 0;
          return (
            <div
              key={signal.category}
              className={`rounded-xl border p-3.5 space-y-2 transition-colors ${
                isQuiet
                  ? "border-zinc-200/70 dark:border-zinc-800/70 bg-transparent"
                  : "border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-500/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isQuiet
                        ? "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400"
                        : "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {signal.category}
                  </span>
                </div>
                {isQuiet ? (
                  <span className="text-xs font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
                    All quiet
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 shrink-0">
                    {signal.items.length} flagged
                  </span>
                )}
              </div>

              {!isQuiet && (
                <div className="space-y-1 pt-1 border-t border-amber-200/60 dark:border-amber-900/30">
                  {signal.items.map((item, i) => (
                    <Link
                      key={`${item.engagementId}-${item.workerId}-${i}`}
                      href={workerPrimaryHref(item.workerId, item.engagementId)}
                      className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400 leading-relaxed -mx-1.5 px-1.5 py-1 mt-1 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.05] transition-colors"
                    >
                      <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {item.buyer} , {item.label}: {item.displayValue}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
