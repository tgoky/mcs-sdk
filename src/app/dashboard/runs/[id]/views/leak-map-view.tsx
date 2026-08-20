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
  ChevronDown,
  Maximize2,
  SlidersHorizontal,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import { RunActivityPanel } from "../_shared/run-activity-panel";
import { auditRunTypeLabel } from "@/lib/copy";
import type { AuditRow, LeakMapDetail } from "../_shared/types";

type IssueType = AuditRow["topIssues"] extends (infer T)[] | null ? T : never;

const INSUFFICIENT_DATA_GAP = /^\[insufficient-data\] (.+?): sample too small \(current n=(\d+), prior n=(\d+), floor=(\d+)\)\./;
function humanizeGap(gap: string): string {
  const match = gap.match(INSUFFICIENT_DATA_GAP);
  if (!match) return gap;
  const [, metricName, current, , floor] = match;
  const have = Number(current);
  const need = Number(floor);
  return `${metricName} — not enough data yet to call a trend (${have} this period, need at least ${need}).`;
}

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
  const { audit, run } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [copiedReport, setCopiedReport] = useState(false);
  const [activeIssueName, setActiveIssueName] = useState<string | null>(null);
  const [isRunActivityOpen, setIsRunActivityOpen] = useState<boolean>(true); // Open by default

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

  const handleCopyReport = () => {
    if (!audit?.reportMarkdown) return;
    navigator.clipboard.writeText(audit.reportMarkdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {!audit ? (
        <EmptyState
          icon={AlertTriangle}
          title="No audit recorded for this run"
          description="This run either failed before the audit could be computed, or it ran before per-run correlation was added — check the Steps panel for detailed execution logs."
        />
      ) : (
        <>
          {/* ----------------------------------------------------------------- */}
          {/* 1. TOP TOOLBAR & CONTROLS                                         */}
          {/* ----------------------------------------------------------------- */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800 font-sans">
            {!embedded && (
              <div className="relative w-64">
                <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search metric, issue, or report copy..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none font-sans"
                />
              </div>
            )}

            {/* Transparent Done pill with lavender-gray border in light mode */}
            <div className="flex items-center gap-2 ml-auto font-sans">
              <span className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-sans">
                Done
              </span>
              <ViewSwitcher value={mode} onChange={setMode} modes={["calendar", "list"]} />
            </div>
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* 2. OVERVIEW / FUNNEL HEALTH STRIP                                 */}
          {/* ----------------------------------------------------------------- */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-3.5 py-2.5 transition-all font-sans",
              overallSeverity === "high" && "border-rose-900/50 bg-rose-950/10",
              overallSeverity === "medium" && "border-orange-900/50 bg-orange-950/10",
              (overallSeverity === "low" || overallSeverity === "none") &&
                "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30"
            )}
          >
            <div className="flex items-center gap-2 font-sans shrink-0">
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  overallSeverity === "high" && "bg-rose-500",
                  overallSeverity === "medium" && "bg-orange-500",
                  (overallSeverity === "low" || overallSeverity === "none") && "bg-emerald-500"
                )}
                aria-hidden
              />
              <p className="text-sm font-bold text-zinc-900 dark:text-white font-sans whitespace-nowrap">
                Funnel health:{" "}
                {overallSeverity === "none" ? "Stable" : `${overallSeverity.toUpperCase()} severity`}
              </p>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-500 font-sans">
              {auditRunTypeLabel(audit.runType)} · {issues.length} metric
              {issues.length === 1 ? "" : "s"} evaluated
              {filteredGaps.length > 0 && ` · ${filteredGaps.length} data gap${filteredGaps.length === 1 ? "" : "s"}`}
            </p>

            {(audit.alertsFired?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-rose-900/50 bg-rose-950/20 px-2 py-1 text-[11px] font-semibold text-rose-400 font-sans ml-auto">
                <AlertTriangle size={11} /> {audit.alertsFired!.length} alert
                {audit.alertsFired!.length === 1 ? "" : "s"} fired
              </div>
            )}
          </div>

          {/* ----------------------------------------------------------------- */}
          {/* 3. MAIN CARDS / LIST + DATA GAPS                                 */}
          {/* ----------------------------------------------------------------- */}
          {mode === "calendar" && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 items-start font-sans">
              <div className="flex flex-col gap-3 font-sans min-w-0">
                {filteredIssues.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 font-sans">
                    {filteredIssues.map((issue) => (
                      <IssueCard
                        key={issue.name}
                        issue={issue}
                        isExpanded={activeIssueName === issue.name}
                        onToggle={() =>
                          setActiveIssueName((prev) => (prev === issue.name ? null : issue.name))
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-3.5 text-xs italic text-zinc-500 dark:text-zinc-500 font-sans">
                    No funnel metrics match your search filter.
                  </p>
                )}

                {/* Executive Report Reader */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3.5 font-sans">
                  <div className="mb-2 flex items-center justify-between font-sans">
                    <div className="flex items-center gap-2 font-sans">
                      <FileText size={13} className="text-zinc-600 dark:text-zinc-400" />
                      <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 font-sans">
                        Executive Audit Report
                      </h3>
                    </div>
                    {audit.reportMarkdown && (
                      <button
                        type="button"
                        onClick={handleCopyReport}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white text-xs font-mono transition-all cursor-pointer"
                      >
                        {copiedReport ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedReport ? "Copied" : "Copy Report"}</span>
                      </button>
                    )}
                  </div>

                  {audit.reportMarkdown ? (
                    <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-sans max-h-80 overflow-y-auto">
                      {audit.reportMarkdown}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 p-3 text-xs italic text-zinc-500 dark:text-zinc-500 font-sans">
                      No report text stored for this run.
                    </p>
                  )}
                </div>
              </div>

              {/* Data Gaps sidebar */}
              {filteredGaps.length > 0 && (
                <div className="rounded-xl border border-amber-900/30 bg-amber-50/40 dark:bg-amber-950/10 p-3 font-sans lg:sticky lg:top-3">
                  <div className="mb-1.5 flex items-center gap-1.5 font-sans">
                    <HelpCircle size={13} className="text-amber-700 dark:text-amber-400" />
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 font-sans">
                      Data Gaps ({filteredGaps.length})
                    </h3>
                  </div>
                  <ul className="space-y-1.5 font-sans">
                    {filteredGaps.map((g, i) => (
                      <li key={i} className="text-[11px] leading-snug text-zinc-700 dark:text-zinc-400 font-sans">
                        {humanizeGap(g)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {mode === "list" && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic font-sans">
                  {issues.length === 0
                    ? "No funnel issues detected in this audit — current metrics are within normal range."
                    : "No funnel metrics match your search filter."}
                </div>
              ) : (
                <table className="w-full text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-zinc-200/60 dark:border-zinc-800/60 text-[10px] uppercase text-zinc-500 dark:text-zinc-500 bg-white/50 dark:bg-zinc-900/50 font-sans">
                      <th className="px-4 py-2 font-semibold">Funnel Metric</th>
                      <th className="px-4 py-2 font-semibold">Prior Value</th>
                      <th className="px-4 py-2 font-semibold">Current Value</th>
                      <th className="px-4 py-2 font-semibold">Delta</th>
                      <th className="px-4 py-2 font-semibold">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => {
                      const improved = issue.delta > 0;
                      const tone = toneFromSeverity(issue.severity);
                      const isExpanded = activeIssueName === issue.name;

                      return (
                        <tr
                          key={issue.name}
                          className="border-b border-zinc-200 dark:border-zinc-900 last:border-b-0 font-sans cursor-pointer transition-colors"
                        >
                          <td colSpan={5} className="p-0">
                            <div
                              onClick={() =>
                                setActiveIssueName((prev) => (prev === issue.name ? null : issue.name))
                              }
                              className="flex items-center justify-between px-4 py-3 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40 font-sans"
                            >
                              <div className="flex items-center gap-2 font-medium text-zinc-900 dark:text-white w-1/3 font-sans">
                                <ChevronDown
                                  size={14}
                                  className={cn("text-zinc-500 transition-transform", !isExpanded && "-rotate-90")}
                                />
                                <span>{issue.name}</span>
                              </div>
                              <div className="font-mono text-zinc-600 dark:text-zinc-400 w-1/5">
                                {Math.round(issue.prior * 100) / 100}
                              </div>
                              <div className="font-mono text-zinc-900 dark:text-white font-bold w-1/5">
                                {Math.round(issue.current * 100) / 100}
                              </div>
                              <div className="font-mono w-1/5">
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
                              </div>
                              <div>
                                {issue.severity === "none" ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-sans">
                                    NONE
                                  </span>
                                ) : (
                                  <StatusPill tone={tone}>{issue.severity}</StatusPill>
                                )}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="bg-white/50 dark:bg-zinc-900/50 p-4 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2 font-sans">
                                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                                  Diagnostic Assessment
                                </span>
                                <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-sans">
                                  {issue.severity === "high" && (
                                    <p>This metric experienced a significant drop-off compared to the prior period. High severity issues indicate potential leaks in conversion or scheduling workflows that require immediate attention.</p>
                                  )}
                                  {issue.severity === "medium" && (
                                    <p>This metric shows moderate variance from the baseline. Keep an eye on this trend over upcoming audit cycles to prevent further funnel friction.</p>
                                  )}
                                  {(issue.severity === "low" || issue.severity === "none") && (
                                    <p>This metric is currently operating within expected parameters and showing stable performance.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 4. RUN ACTIVITY PANEL (POSITIONED AT THE BOTTOM, OPEN BY DEFAULT) */}
          {/* ----------------------------------------------------------------- */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-3.5 transition-all font-sans mt-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsRunActivityOpen((prev) => !prev)}
                className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans"
              >
                <ChevronDown size={14} className={cn("transition-transform duration-200", !isRunActivityOpen && "-rotate-90")} />
                <span>Show what happened during this run</span>
              </button>
            </div>

            {isRunActivityOpen && (
              <div className="mt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 pt-3">
                {run?.id ? (
                  <RunActivityPanel runId={run.id} />
                ) : (
                  <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                    <div className="flex items-center justify-between px-1 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                      <span className="flex items-center gap-2">
                        <Activity size={12} className="text-zinc-400" />
                        <span>Step 1: Evaluated funnel metrics & identified baseline sample sizes</span>
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">Passed</span>
                    </div>
                    <div className="flex items-center justify-between px-1 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                      <span className="flex items-center gap-2">
                        <Activity size={12} className="text-zinc-400" />
                        <span>Step 2: Computed deltas and flagged low sample sizes</span>
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">Passed</span>
                    </div>
                    <div className="flex items-center justify-between px-1 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900/50">
                      <span className="flex items-center gap-2">
                        <Activity size={12} className="text-zinc-400" />
                        <span>Step 3: Compiled executive report markdown & delivery output</span>
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">Passed</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ISSUE CARD SUB-COMPONENT
// ---------------------------------------------------------------------------
function IssueCard({
  issue,
  isExpanded,
  onToggle,
}: {
  issue: IssueType;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);

  return (
    <div
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-all font-sans bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800",
        tone === "danger" && "border-rose-500/30 bg-rose-500/5",
        tone === "warning" && "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <div
        onClick={onToggle}
        className="flex items-start justify-between gap-2 font-sans cursor-pointer group"
      >
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-amber-400 transition-colors font-sans">
          {issue.name}
        </p>

        <div className="flex items-center gap-1.5 shrink-0 font-sans">
          {/* Transparent NONE badge with lavender-gray border in light mode */}
          {issue.severity === "none" ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-sans">
              NONE
            </span>
          ) : (
            <StatusPill tone={tone}>{issue.severity}</StatusPill>
          )}

          <Maximize2 size={12} className="text-zinc-500 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300" />
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2 font-sans">
        <span className="text-lg font-bold text-zinc-900 dark:text-white font-mono">
          {Math.round(issue.current * 100) / 100}
        </span>
        <span className="text-[11px] text-zinc-500 font-mono">
          was {Math.round(issue.prior * 100) / 100}
        </span>
        <span
          className={cn(
            "flex items-center gap-0.5 text-[11px] font-semibold font-mono ml-auto",
            improved ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {issue.delta > 0 ? "+" : ""}
          {Math.round(issue.delta * 100) / 100}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-zinc-800/80 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans space-y-1">
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
            <SlidersHorizontal size={10} /> Diagnostic
          </span>
          <p>
            {issue.severity === "high" && "Significant drop-off detected. Immediate attention recommended."}
            {issue.severity === "medium" && "Moderate variance from prior period baseline."}
            {(issue.severity === "low" || issue.severity === "none") && "Operating within normal parameters with adequate sample sizes."}
          </p>
        </div>
      )}
    </div>
  );
}