"use client";

// src/components/reports/worker-report-block-grid.tsx
//
// The dynamic replacement for client-report-card.tsx / rep-client-report-
// card.tsx's boxed, product-specific layouts — one flat, transparent grid
// of whatever blocks worker-report-blocks.ts resolved for this client's
// actually-enabled workers. No card chrome (no border, no filled
// background) per direct feedback: "no useless cards, sometimes
// transparent ui is key." Same dotted background the dashboard/queue/runs
// pages already share (bg-dot-grid, globals.css) instead of inventing a
// new texture.

import { StatChip } from "@/components/library/stat-chip";
import type { ReportBlockWithTrend } from "@/lib/worker-report-blocks";

const TONE_MAP: Record<NonNullable<ReportBlockWithTrend["tone"]>, "neutral" | "success" | "warning" | "danger"> = {
  positive: "success",
  warning: "warning",
  negative: "danger",
  neutral: "neutral",
};

export function WorkerReportBlockGrid({ blocks }: { blocks: ReportBlockWithTrend[] }) {
  if (blocks.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400 py-4">
        No metrics yet for this client&apos;s enabled skills — check back once they&apos;ve run.
      </p>
    );
  }

  return (
    <div className="relative py-2">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />
      <div className="relative z-10 flex flex-wrap gap-x-10 gap-y-5">
        {blocks.map((block, i) => (
          <div key={`${block.workerId}-${block.label}-${i}`} className="min-w-[96px]">
            <StatChip label={block.label} value={block.displayValue} tone={TONE_MAP[block.tone ?? "neutral"]} />
            {block.trendLabel && (
              <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mt-1">{block.trendLabel}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
