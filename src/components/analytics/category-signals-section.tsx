import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { workerPrimaryHref } from "@/lib/worker-registry";
import type { CategorySignal } from "@/features/reports/server/category-signals";

/**
 * The deep-dive layer for Analytics, one flat row per WorkerCategory
 * (5, permanently) instead of one hardcoded section per worker — same
 * plain divide-y list PortfolioOutcomesSection already uses above it on
 * this page, no cards, no boxes, dot-grid showing through. A category
 * with nothing flagged reads "All quiet," not a wall of empty stats.
 */
export function CategorySignalsSection({ signals }: { signals: CategorySignal[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          By category
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          Every worker across the portfolio, grouped by what it does — not one section per skill.
        </p>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
        {signals.map((signal) => (
          <div key={signal.category} className="py-3 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {signal.category}
              </span>
              {signal.items.length === 0 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  All quiet
                </span>
              )}
            </div>

            {signal.items.length > 0 && (
              <div className="space-y-1">
                {signal.items.map((item, i) => (
                  <Link
                    key={`${item.engagementId}-${item.workerId}-${i}`}
                    href={workerPrimaryHref(item.workerId, item.engagementId)}
                    className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 leading-relaxed -mx-2 px-2 py-0.5 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      {item.buyer} — {item.label}: {item.displayValue}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
