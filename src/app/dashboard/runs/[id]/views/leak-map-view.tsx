"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  FileText,
  HelpCircle,
  Search,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type { CorrelationFlag } from "@/lib/report-correlation";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import { SimpleMarkdown } from "@/components/simple-markdown";

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
  const [correlationFlags, setCorrelationFlags] = useState<CorrelationFlag[]>([]);

  // Cross-worker blend, read-only: this week's Showtime/Reputation
  // Manager correlation for this client, if any — same computation
  // Reports/Analytics already run (report-correlation.ts), fetched here
  // since this is a client component with no direct DB access. Best-
  // effort: a failed fetch just means no callout, never an error state,
  // since this is supplementary context, not this view's core content.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/engagements/${detail.run.engagementId}/correlation-flags`)
      .then((res) => (res.ok ? res.json() : { flags: [] }))
      .then((data) => {
        if (!cancelled) setCorrelationFlags(data.flags ?? []);
      })
      .catch(() => {
        if (!cancelled) setCorrelationFlags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.run.engagementId]);

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

  // Split so a real problem never has to compete for attention with 3
  // "insufficient data" tiles styled exactly the same way — the previous
  // layout gave every metric equal visual weight regardless of whether
  // there was anything to actually act on.
  const needsAttention = useMemo(
    () => filteredIssues.filter((i) => !i.insufficientData && (i.severity === "high" || i.severity === "medium")),
    [filteredIssues]
  );
  const otherIssues = useMemo(
    () => filteredIssues.filter((i) => i.insufficientData || i.severity === "low" || i.severity === "none"),
    [filteredIssues]
  );

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
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

        <ViewSwitcher value={mode} onChange={setMode} modes={["calendar", "list"]} className={embedded ? undefined : "ml-auto"} />
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
            <div key="calendar" className="run-view-content-enter space-y-4">
              {/* Verdict — the one thing this view leads with. Bigger dot,
                  bigger text, more room than a thin status strip, since
                  this is the answer to "is anything wrong," not a footnote. */}
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-transparent px-4 py-4 transition-all",
                  overallSeverity === "high" && "border-rose-500/50",
                  overallSeverity === "medium" && "border-orange-500/50",
                  overallSeverity !== "high" && overallSeverity !== "medium" && !hasAnyUsableData && "border-amber-500/50",
                  overallSeverity !== "high" && overallSeverity !== "medium" && hasAnyUsableData && "border-zinc-200/60 dark:border-zinc-800/60"
                )}
              >
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full shrink-0",
                      overallSeverity === "high" && "bg-rose-500",
                      overallSeverity === "medium" && "bg-orange-500",
                      overallSeverity !== "high" && overallSeverity !== "medium" && !hasAnyUsableData && "bg-amber-500",
                      overallSeverity !== "high" && overallSeverity !== "medium" && hasAnyUsableData && "bg-emerald-500"
                    )}
                    aria-hidden
                  />
                  <p className="text-base font-bold text-zinc-900 dark:text-white whitespace-nowrap">
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

              {/* Reputation-aware hypothesis — see report-correlation.ts.
                  Only ever renders when a real Showtime outcome and a
                  real RM risk signal both moved unfavorably this same
                  week for this client. */}
              {correlationFlags.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-orange-500/40 bg-transparent p-3">
                  {correlationFlags.map((flag, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs leading-relaxed text-orange-800 dark:text-orange-300">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>{flag.message}</span>
                    </p>
                  ))}
                </div>
              )}

              {filteredIssues.length === 0 && (
                <p className="text-xs italic text-zinc-500 dark:text-zinc-500">No funnel metrics match your search filter.</p>
              )}

              {/* Needs attention — real findings only, full weight. */}
              {needsAttention.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    Needs attention ({needsAttention.length})
                  </h3>
                  <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-transparent divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                    {needsAttention.map((issue) => (
                      <IssueRow key={issue.name} issue={issue} />
                    ))}
                  </div>
                </div>
              )}

              {/* Everything else — healthy or not enough data yet, same
                  visual weight as each other but muted relative to a real
                  finding, and collapsed out of the way whenever there's
                  something above that actually needs looking at. */}
              {otherIssues.length > 0 &&
                (needsAttention.length > 0 ? (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                      <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                      {otherIssues.length} other metric{otherIssues.length === 1 ? "" : "s"} — healthy or not enough data
                    </summary>
                    <div className="mt-1.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-transparent divide-y divide-zinc-200/60 dark:divide-zinc-800/60 opacity-70">
                      {otherIssues.map((issue) => (
                        <IssueRow key={issue.name} issue={issue} />
                      ))}
                    </div>
                  </details>
                ) : (
                  <div className="space-y-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                      {issues.length} metric{issues.length === 1 ? "" : "s"} evaluated
                    </h3>
                    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-transparent divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                      {otherIssues.map((issue) => (
                        <IssueRow key={issue.name} issue={issue} />
                      ))}
                    </div>
                  </div>
                ))}

              {/* Data Gaps — folded in as a disclosure next to the metrics
                  it explains, not a permanent sidebar competing with the
                  report for attention. */}
              {filteredGaps.length > 0 && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 [&::-webkit-details-marker]:hidden">
                    <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                    <HelpCircle size={12} />
                    Data gaps ({filteredGaps.length})
                  </summary>
                  <ul className="mt-1.5 space-y-1.5 pl-5">
                    {filteredGaps.map((g, i) => (
                      <li key={i} className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                        {humanizeGap(g)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Executive Report Reader — flows in the page's own scroll
                  now, no forced inner scrollbox hiding most of it. */}
              <div>
                <div className="mb-2 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-zinc-500 dark:text-zinc-400" />
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white">Executive Audit Report</h2>
                  </div>
                  {audit.reportMarkdown && (
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-700 text-xs font-mono transition-all cursor-pointer shadow-elevation-1 hover:shadow-elevation-2 hover-lift press-settle"
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
                  <SimpleMarkdown text={audit.reportMarkdown} className="pt-2 text-xs text-zinc-700 dark:text-zinc-300" />
                ) : (
                  <p className="pt-2 text-xs italic text-zinc-500 dark:text-zinc-500">
                    No report text stored for this run. Check the Steps panel to confirm whether delivery (Resend/Slack) succeeded.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* LIST VIEW */}
          {mode === "list" && (
            <div key="list" className="run-view-content-enter">
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

function IssueRow({ issue }: { issue: IssueType }) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);
  const current = Math.round(issue.current * 100) / 100;
  const prior = Math.round(issue.prior * 100) / 100;
  const delta = Math.round(issue.delta * 100) / 100;
  return (
    <div className="p-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{issue.name}</p>
        <StatusPill tone={tone}>{issue.insufficientData ? "insufficient data" : issue.severity}</StatusPill>
      </div>

      {/* One compact stats line instead of a 3-column number grid — same
          information, a fraction of the vertical space. */}
      <p className="mt-1 text-xs font-mono text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 flex-wrap">
        <span>
          Current <span className="font-bold text-zinc-900 dark:text-white">{current}</span>
        </span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span>Prior {prior}</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className={cn("font-semibold flex items-center gap-0.5", improved ? "text-emerald-500" : "text-rose-500")}>
          {improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {issue.delta > 0 ? "+" : ""}
          {delta}
        </span>
      </p>

      {/* Assessment */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
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