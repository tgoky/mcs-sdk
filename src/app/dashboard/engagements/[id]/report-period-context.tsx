"use client";

// The This week / This month / All time tabs used to live entirely inside
// DynamicClientReport, with their own local useState. Moved into a shared
// context so the tab control itself can render up in the page header, on
// the same line as the Pause/Modify buttons, while DynamicClientReport
// (a sibling further down the page) still reads whichever period is
// selected — the two are otherwise unrelated server-rendered blocks with
// no parent/child relationship that would let this be plain prop drilling.

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ReportPeriod } from "@/features/reports/server/report-service";

export const PERIOD_TABS: { key: ReportPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all_time", label: "All time" },
];

interface ReportPeriodContextValue {
  period: ReportPeriod;
  setPeriod: (period: ReportPeriod) => void;
}

const ReportPeriodContext = createContext<ReportPeriodContextValue | null>(null);

export function ReportPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<ReportPeriod>("week");
  return <ReportPeriodContext.Provider value={{ period, setPeriod }}>{children}</ReportPeriodContext.Provider>;
}

export function useReportPeriod(): ReportPeriodContextValue {
  const ctx = useContext(ReportPeriodContext);
  if (!ctx) throw new Error("useReportPeriod must be used within a ReportPeriodProvider");
  return ctx;
}

/** The tab control itself — lives in the page header now, same line as
 * Pause/Modify, instead of floating above the report cards on its own. */
export function PeriodTabs() {
  const { period, setPeriod } = useReportPeriod();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 shrink-0">
      {PERIOD_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setPeriod(tab.key)}
          className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-mono whitespace-nowrap rounded-md transition-colors cursor-pointer ${
            period === tab.key
              ? "surface-glass-3 no-ambient-glow text-zinc-900 dark:text-zinc-100 font-semibold"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
