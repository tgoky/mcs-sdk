"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  FileText,
  HelpCircle,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";

const INSUFFICIENT_DATA_GAP = /^\[insufficient-data\] (.+?): sample too small \(current n=(\d+), prior n=(\d+), floor=(\d+)\)\./;
function humanizeGap(gap: string): string {
  const match = gap.match(INSUFFICIENT_DATA_GAP);
  if (!match) return gap;
  const [, metricName, current, , floor] = match;
  const have = Number(current);
  const need = Number(floor);
  return `${metricName} — not enough data yet to call a trend (${have} this period, need at least ${need}).`;
}

import { auditRunTypeLabel } from "@/lib/copy";
import type { AuditRow, LeakMapDetail } from "../_shared/types";

type IssueType = AuditRow["topIssues"] extends (infer T)[] | null ? T : never;

function severityRank(s: string) {
  return { high: 3, medium: 2, low: 1, none: 0 }[s] ?? 0;
}

export function LeakMapView({
  detail,
  embedded = false,
}: {
  detail: LeakMapDetail;
  embedded?: boolean;
}) {
  const { audit } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [copiedReport, setCopiedReport] = useState(false);

  const issues = useMemo(() => {
    if (!audit?.topIssues) return [];
    return [...audit.topIssues].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity)
    );
  }, [audit]);

  const filteredIssues = useMemo(() => {
    if (!filterText.trim()) return issues;
    const q = filterText.toLowerCase();
    return issues.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.severity.toLowerCase().includes(q)
    );
  }, [issues, filterText]);

  const filteredGaps = useMemo(() => {
    if (!audit?.gaps) return [];
    if (!filterText.trim()) return audit.gaps;
    const q = filterText.toLowerCase();
    return audit.gaps.filter((g) => g.toLowerCase().includes(q));
  }, [audit?.gaps, filterText]);

  const overallSeverity = issues[0]?.severity ?? "none";
  // Distinguishes "every metric came back none/low because things are
  // actually fine" from "every metric came back none because none of
  // them had enough data to say anything" — computeDelta forces severity
  // to "none" in both cases, so severity alone can't tell them apart.
  // Drives the status strip below; the per-metric cards use
  // issue.insufficientData directly for the same reason.
  const hasAnyUsableData = issues.some((i) => !i.insufficientData);

  const handleCopyReport = () => {
    if (!audit?.reportMarkdown) return;
    navigator.clipboard.writeText(audit.reportMarkdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800">
        {!embedded && (
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search metric, issue, or report copy..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
            />
          </div>
        )}

        <ViewSwitcher value={mode} onChange={setMode} modes={["calendar", "list"]} className="ml-auto" />
      </div>

      {!audit ? (
        <EmptyState
          icon={AlertTriangle}
          title="No audit recorded for this run"
          description="This run either failed before the audit could be computed, or it ran before per-run correlation was added — check the Steps panel for detailed execution logs."
        />
      ) : (
        <>
          {/* CALENDAR / OVERVIEW VIEW */}
          {mode === "calendar" && (
            <>
              {/* Status Strip */}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-3.5 py-2.5 transition-all",
                  overallSeverity === "high" && "border-rose-900/50 bg-rose-950/10",
                  overallSeverity === "medium" && "border-orange-900/50 bg-orange-950/10",
                  overallSeverity !== "high" && overallSeverity !== "medium" && !hasAnyUsableData &&
                    "border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10",
                  overallSeverity !== "high" && overallSeverity !== "medium" && hasAnyUsableData &&
                    "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30"
                )}
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      overallSeverity === "high" && "bg-rose-500",
                      overallSeverity === "medium" && "bg-orange-500",
                      overallSeverity !== "high" && overallSeverity !== "medium" && !hasAnyUsableData && "bg-amber-500",
                      overallSeverity !== "high" && overallSeverity !== "medium" && hasAnyUsableData && "bg-emerald-500"
                    )}
                    aria-hidden
                  />
                  <p className="text-sm font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                    Funnel health:{" "}
                    {overallSeverity === "none"
                      ? hasAnyUsableData
                        ? "Stable"
                        : "Not enough data yet"
                      : `${overallSeverity.toUpperCase()} severity`}
                  </p>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  {auditRunTypeLabel(audit.runType)} · {issues.length} metric
                  {issues.length === 1 ? "" : "s"} evaluated
                  {filteredGaps.length > 0 && ` · ${filteredGaps.length} data gap${filteredGaps.length === 1 ? "" : "s"}`}
                </p>

                {(audit.alertsFired?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 rounded-md border border-rose-900/50 bg-rose-950/20 px-2 py-1 text-[11px] font-semibold text-rose-400 ml-auto">
                    <AlertTriangle size={11} /> {audit.alertsFired!.length} alert
                    {audit.alertsFired!.length === 1 ? "" : "s"} fired
                  </div>
                )}
              </div>

              {/* Issues + Data Gaps */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 items-start">
                <div className="flex flex-col gap-3 min-w-0">
                  {filteredIssues.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {filteredIssues.map((issue) => (
                        <IssueCard key={issue.name} issue={issue} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-3.5 text-xs italic text-zinc-500 dark:text-zinc-500">
                      No funnel metrics match your search filter.
                    </p>
                  )}

                  {/* Executive Report Reader */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-zinc-600 dark:text-zinc-400" />
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                          Executive Audit Report
                        </h3>
                      </div>
                      {audit.reportMarkdown && (
                        <button
                          type="button"
                          onClick={handleCopyReport}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-700 text-xs font-mono transition-all cursor-pointer"
                        >
                          {copiedReport ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>{copiedReport ? "Copied" : "Copy Report"}</span>
                        </button>
                      )}
                    </div>

                    {audit.reportMarkdown ? (
                      <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 max-h-80 overflow-y-auto">
                        {audit.reportMarkdown}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 p-3 text-xs italic text-zinc-500 dark:text-zinc-500">
                        No report text stored for this run. Check the Steps panel to confirm whether delivery (Resend/Slack) succeeded.
                      </p>
                    )}
                  </div>
                </div>

                {/* Data Gaps sidebar */}
                {filteredGaps.length > 0 && (
                  <div className="rounded-xl border border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10 p-3 lg:sticky lg:top-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <HelpCircle size={13} className="text-amber-700 dark:text-amber-400" />
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        Data Gaps ({filteredGaps.length})
                      </h3>
                    </div>
                    <ul className="space-y-1.5">
                      {filteredGaps.map((g, i) => (
                        <li key={i} className="text-[11px] leading-snug text-zinc-700 dark:text-zinc-400">
                          {humanizeGap(g)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* LIST VIEW */}
          {mode === "list" && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic">
                  {issues.length === 0
                    ? "No funnel issues detected in this audit — the current metrics are within normal range."
                    : "No funnel metrics match your search filter."}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200/60 dark:border-zinc-800/60 text-[10px] uppercase text-zinc-500 dark:text-zinc-500 bg-white/50 dark:bg-zinc-900/50">
                      <th className="px-4 py-2 font-semibold">Funnel Metric</th>
                      <th className="px-4 py-2 font-semibold">Prior Value</th>
                      <th className="px-4 py-2 font-semibold">Current Value</th>
                      <th className="px-4 py-2 font-semibold">Delta</th>
                      <th className="px-4 py-2 font-semibold">Severity</th>
                      <th className="px-4 py-2 font-semibold">Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => {
                      const improved = issue.delta > 0;
                      const tone = toneFromSeverity(issue.severity);
                      return (
                        <tr
                          key={issue.name}
                          className="border-b border-zinc-200 dark:border-zinc-900 last:border-b-0"
                        >
                          <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-white">
                            {issue.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                            {Math.round(issue.prior * 100) / 100}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-zinc-900 dark:text-white font-bold">
                            {Math.round(issue.current * 100) / 100}
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 font-semibold",
                                improved ? "text-emerald-400" : "text-rose-400"
                              )}
                            >
                              {improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {issue.delta > 0 ? "+" : ""}
                              {Math.round(issue.delta * 100) / 100}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusPill tone={tone}>{issue.insufficientData ? "insufficient data" : issue.severity}</StatusPill>
                          </td>
                          <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400 max-w-[220px]">
                            {issue.insufficientData
                              ? "Not enough data yet — sample below the reliability floor."
                              : issue.severity === "high"
                              ? "Significant drop-off — requires immediate attention."
                              : issue.severity === "medium"
                              ? "Moderate variance — monitor over upcoming cycles."
                              : "Within expected parameters."}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: IssueType }) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);
  // A metric with insufficientData always has severity "none" (computeDelta
  // forces this), but "none because unconfirmed" and "none because
  // genuinely nominal" need to look different here, or this card ends up
  // asserting "stable performance" for something that was never actually
  // checked — which is exactly what it did before this field existed.
  const cardTone = issue.insufficientData ? "gap" : tone;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-all",
        cardTone === "danger" && "border-rose-900/40 bg-rose-950/10",
        cardTone === "warning" && "border-orange-900/40 bg-orange-950/10",
        cardTone === "gap" && "border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10",
        (cardTone === "info" || cardTone === "neutral") && "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {issue.name}
        </p>
        <StatusPill tone={tone}>{issue.insufficientData ? "insufficient data" : issue.severity}</StatusPill>
      </div>

      {/* Numbers row */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Current</span>
          <p className="text-sm font-bold text-zinc-900 dark:text-white font-mono">
            {Math.round(issue.current * 100) / 100}
          </p>
        </div>
        <div>
          <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Prior</span>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 font-mono">
            {Math.round(issue.prior * 100) / 100}
          </p>
        </div>
        <div>
          <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Shift</span>
          <p
            className={cn(
              "text-sm font-bold font-mono flex items-center gap-0.5",
              improved ? "text-emerald-400" : "text-rose-400"
            )}
          >
            {improved ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {issue.delta > 0 ? "+" : ""}
            {Math.round(issue.delta * 100) / 100}
          </p>
        </div>
      </div>

      {/* Assessment */}
      <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-2">
        {issue.insufficientData
          ? "Not enough data yet to call a trend for this metric — the sample is below the reliability floor, so this isn't confirmation of healthy performance, just an unknown."
          : issue.severity === "high"
          ? "Significant drop-off compared to the prior period. Potential leak in conversion or scheduling workflow — prioritize investigation."
          : issue.severity === "medium"
          ? "Moderate variance from baseline. Track over upcoming audit cycles to catch further funnel friction early."
          : "Operating within expected parameters with stable performance."}
      </p>
    </div>
  );
}