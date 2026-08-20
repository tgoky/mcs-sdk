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
  Maximize2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";

/**
 * Horror Story #4 fix — audit-engine.ts writes gap entries like
 * "[insufficient-data] Booking show rate: sample too small (current n=0,
 * prior n=0, floor=5). Delta suppressed, no recommendation should be
 * generated for this metric." — a string built for the LLM prompt (it's
 * an instruction: don't generate a recommendation for this one), not for
 * a person reading the report. This was rendering verbatim, brackets and
 * all. Other gap strings (e.g. "Could not pull X: <error>") are already
 * plain English and pass through unchanged.
 */
const INSUFFICIENT_DATA_GAP = /^\[insufficient-data\] (.+?): sample too small \(current n=(\d+), prior n=(\d+), floor=(\d+)\)\./;
function humanizeGap(gap: string): string {
  const match = gap.match(INSUFFICIENT_DATA_GAP);
  if (!match) return gap;
  const [, metricName, current, , floor] = match;
  const have = Number(current);
  const need = Number(floor);
  return `${metricName} — not enough data yet to call a trend (${have} this period, need at least ${need}).`;
}
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  /** True when rendered inside another page (e.g. the engagement's Funnel
   * Audit tile) rather than as the full run page — hides the search bar
   * so it doesn't duplicate the host page's own search/filter UI. */
  embedded?: boolean;
}) {
  const { audit } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [copiedReport, setCopiedReport] = useState(false);
  const [activeIssue, setActiveIssue] = useState<IssueType | null>(null);

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
      {/* ----------------------------------------------------------------- */}
      {/* 1. TOOLBAR — Board mode dropped (a 3-column kanban of at most a  */}
      {/* handful of metrics added a mode without adding information); the */}
      {/* search bar is hidden when embedded so it doesn't duplicate the   */}
      {/* host page's own filter UI.                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800 font-sans">
        {!embedded && (
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search metric, issue, or report copy..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs font-sans text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
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
          {/* ----------------------------------------------------------------- */}
          {/* 2. OVERVIEW VIEW                                                  */}
          {/* ----------------------------------------------------------------- */}
          {mode === "calendar" && (
            <>
              {/* Compact Status Strip — one line, no oversized icon/shadow */}
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

              {/* Issues (main column) + Data Gaps (sidebar — always visible, no scrolling past cards to find it) */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-3 items-start font-sans">
                <div className="flex flex-col gap-3 font-sans min-w-0">
                  {filteredIssues.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 font-sans">
                      {filteredIssues.map((issue) => (
                        <IssueCard
                          key={issue.name}
                          issue={issue}
                          onClick={() => setActiveIssue(issue)}
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
                      <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-sans max-h-80 overflow-y-auto">
                        {audit.reportMarkdown}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 p-3 text-xs italic text-zinc-500 dark:text-zinc-500 font-sans">
                        No report text stored for this run. Check the Steps panel to confirm whether delivery (Resend/Slack) succeeded.
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
            </>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 3. DENSE LIST VIEW                                                */}
          {/* ----------------------------------------------------------------- */}
          {mode === "list" && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 font-sans">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 dark:text-zinc-500 italic font-sans">
                  {issues.length === 0
                    ? "No funnel issues detected in this audit — the current metrics are within normal range."
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
                      <th className="px-4 py-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => {
                      const improved = issue.delta > 0;
                      const tone = toneFromSeverity(issue.severity);
                      return (
                        <tr
                          key={issue.name}
                          className="border-b border-zinc-200 dark:border-zinc-900 last:border-b-0 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40 font-sans cursor-pointer transition-colors"
                          onClick={() => setActiveIssue(issue)}
                        >
                          <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-white font-sans">
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
                            <StatusPill tone={tone}>{issue.severity}</StatusPill>
                          </td>
                          <td className="px-4 py-2.5 text-right font-sans">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveIssue(issue);
                              }}
                              className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer font-sans"
                            >
                              Inspect
                            </button>
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

      {/* ----------------------------------------------------------------- */}
      {/* 5. METRIC DETAIL INSPECTION DRAWER (STRICT FONT PERSISTENCE)      */}
      {/* ----------------------------------------------------------------- */}
      <LeakMapDetailDrawer
        issue={activeIssue}
        onClose={() => setActiveIssue(null)}
      />
    </div>
  );
}

function IssueCard({
  issue,
  onClick,
}: {
  issue: IssueType;
  onClick: () => void;
}) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-all group cursor-pointer font-sans",
        tone === "danger" && "border-rose-900/40 bg-rose-950/10 hover:border-rose-800/60",
        tone === "warning" && "border-orange-900/40 bg-orange-950/10 hover:border-orange-800/60",
        (tone === "info" || tone === "neutral") && "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-400 dark:hover:border-zinc-700"
      )}
    >
      <div className="flex items-start justify-between gap-2 font-sans">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-amber-400 transition-colors font-sans">
          {issue.name}
        </p>
        <div className="flex items-center gap-1.5 shrink-0 font-sans">
          <StatusPill tone={tone}>{issue.severity}</StatusPill>
          <Maximize2 size={12} className="text-zinc-700 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2 font-sans">
        <span className="text-lg font-bold text-zinc-900 dark:text-white font-mono">
          {Math.round(issue.current * 100) / 100}
        </span>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono">
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
    </button>
  );
}

// ---------------------------------------------------------------------------
// LEAK MAP METRIC DETAIL DRAWER
// ---------------------------------------------------------------------------
function LeakMapDetailDrawer({
  issue,
  onClose,
}: {
  issue: IssueType | null;
  onClose: () => void;
}) {
  const tone = issue ? toneFromSeverity(issue.severity) : "neutral";
  const improved = issue ? issue.delta > 0 : false;

  return (
    <Sheet open={!!issue} onOpenChange={(open) => !open && onClose()}>
      {/* Explicit font-sans antialiased text-zinc-900 dark:text-zinc-100 on portal root prevents font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-lg font-sans antialiased text-zinc-900 dark:text-zinc-100">
        {issue && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-mono">
                    Funnel Metric Inspection
                  </span>
                </div>
                <StatusPill tone={tone}>{issue.severity}</StatusPill>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold text-zinc-900 dark:text-white font-sans">
                {issue.name}
              </SheetTitle>
              <SheetDescription className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">
                Evaluated drop-off metric from the latest funnel audit.
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 font-sans pt-2">
              {/* Metric Breakdown */}
              <div className="grid grid-cols-3 gap-2 text-xs font-sans">
                <div className="space-y-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 font-sans">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Current</span>
                  <p className="font-bold text-zinc-900 dark:text-white text-sm font-mono">
                    {Math.round(issue.current * 100) / 100}
                  </p>
                </div>
                <div className="space-y-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 font-sans">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Prior</span>
                  <p className="font-semibold text-zinc-600 dark:text-zinc-400 text-sm font-mono">
                    {Math.round(issue.prior * 100) / 100}
                  </p>
                </div>
                <div className="space-y-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 font-sans">
                  <span className="block text-[10px] font-mono uppercase text-zinc-500 dark:text-zinc-500">Shift</span>
                  <p
                    className={cn(
                      "font-bold text-sm font-mono flex items-center gap-0.5",
                      improved ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {improved ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {issue.delta > 0 ? "+" : ""}
                    {Math.round(issue.delta * 100) / 100}
                  </p>
                </div>
              </div>

              {/* Severity Context & Guidance */}
              <div className="space-y-2 font-sans">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Diagnostic Assessment
                </span>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-sans">
                  {issue.severity === "high" && (
                    <p className="font-sans">
                      This metric experienced a significant drop-off compared to the prior period. High severity issues indicate potential leaks in conversion or scheduling workflows that require immediate attention.
                    </p>
                  )}
                  {issue.severity === "medium" && (
                    <p className="font-sans">
                      This metric shows moderate variance from the baseline. Keep an eye on this trend over upcoming audit cycles to prevent further funnel friction.
                    </p>
                  )}
                  {(issue.severity === "low" || issue.severity === "none") && (
                    <p className="font-sans">
                      This metric is currently operating within expected parameters and showing stable performance.
                    </p>
                  )}
                </div>
              </div>
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}