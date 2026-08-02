"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  FileText,
  Siren,
  HelpCircle,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import type { AuditRow, LeakMapDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

function severityRank(s: string) {
  return { high: 3, medium: 2, low: 1, none: 0 }[s] ?? 0;
}

export function LeakMapView({ detail }: { detail: LeakMapDetail }) {
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

  const handleCopyReport = () => {
    if (!audit?.reportMarkdown) return;
    navigator.clipboard.writeText(audit.reportMarkdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA PERSISTENT TOOLBAR                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search metric, issue, or report copy..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
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
              {/* Overall Severity Banner */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xl transition-all",
                  overallSeverity === "high" && "border-rose-900/50 bg-rose-950/10",
                  overallSeverity === "medium" && "border-orange-900/50 bg-orange-950/10",
                  (overallSeverity === "low" || overallSeverity === "none") &&
                    "border-zinc-800 bg-zinc-900/30"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border shrink-0",
                      overallSeverity === "high" && "bg-rose-500/15 text-rose-400 border-rose-900/50",
                      overallSeverity === "medium" && "bg-orange-500/15 text-orange-400 border-orange-900/50",
                      (overallSeverity === "low" || overallSeverity === "none") &&
                        "bg-zinc-800 text-zinc-400 border-zinc-700"
                    )}
                  >
                    <Siren size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      Overall Funnel Health:{" "}
                      {overallSeverity === "none" ? "Stable" : `${overallSeverity.toUpperCase()} Severity`}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {audit.runType} audit · {issues.length} metric
                      {issues.length === 1 ? "" : "s"} evaluated
                    </p>
                  </div>
                </div>

                {(audit.alertsFired?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-400">
                    <AlertTriangle size={12} /> {audit.alertsFired!.length} alert
                    {audit.alertsFired!.length === 1 ? "" : "s"} fired
                  </div>
                )}
              </div>

              {/* Severity-Ranked Metric Cards */}
              {filteredIssues.length > 0 && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {filteredIssues.map((issue) => (
                    <IssueCard key={issue.name} issue={issue} />
                  ))}
                </div>
              )}

              {/* Data Gaps */}
              {filteredGaps.length > 0 && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <HelpCircle size={14} className="text-zinc-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">
                      Identified Data Gaps
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {filteredGaps.map((g, i) => (
                      <li key={i} className="text-xs text-zinc-500 font-mono">
                        · {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Executive Report Reader */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-zinc-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">
                      Executive Audit Report
                    </h3>
                  </div>
                  {audit.reportMarkdown && (
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-mono transition-all cursor-pointer"
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
                  <div className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300 font-sans">
                    {audit.reportMarkdown}
                  </div>
                ) : (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500">
                    No report text stored for this run. Check the Steps panel to confirm whether delivery (Resend/Slack) succeeded.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 3. DENSE LIST VIEW                                                */}
          {/* ----------------------------------------------------------------- */}
          {mode === "list" && (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              {filteredIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 italic">
                  No funnel metrics match your search filter.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-zinc-900/50">
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
                      return (
                        <tr
                          key={issue.name}
                          className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40"
                        >
                          <td className="px-4 py-2.5 font-medium text-white">
                            {issue.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-zinc-400">
                            {Math.round(issue.prior * 100) / 100}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-white font-bold">
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
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* 4. ASANA KANBAN BOARD VIEW                                        */}
          {/* ----------------------------------------------------------------- */}
          {mode === "board" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["high", "medium", "low"] as const).map((sev) => {
                const columnIssues = filteredIssues.filter((i) => i.severity === sev);
                const columnTitle =
                  sev === "high"
                    ? "High Severity (Action Needed)"
                    : sev === "medium"
                    ? "Medium Severity (Watch)"
                    : "Low / Stable";

                return (
                  <div key={sev} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                    <div className="mb-2.5 flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-zinc-300">{columnTitle}</span>
                      <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                        {columnIssues.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {columnIssues.map((issue) => {
                        const improved = issue.delta > 0;
                        const tone = toneFromSeverity(issue.severity);
                        return (
                          <div
                            key={issue.name}
                            className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-white">{issue.name}</p>
                              <StatusPill tone={tone}>{issue.severity}</StatusPill>
                            </div>

                            <div className="flex items-baseline justify-between pt-1 border-t border-zinc-800/80 text-[11px]">
                              <span className="font-mono text-zinc-400">
                                Current: <strong className="text-white">{Math.round(issue.current * 100) / 100}</strong>
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 font-semibold font-mono",
                                  improved ? "text-emerald-400" : "text-rose-400"
                                )}
                              >
                                {improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {issue.delta > 0 ? "+" : ""}
                                {Math.round(issue.delta * 100) / 100}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {columnIssues.length === 0 && (
                        <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600">
                          No metrics in this severity tier
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IssueCard({
  issue,
}: {
  issue: AuditRow["topIssues"] extends (infer T)[] | null ? T : never;
}) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);
  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 transition-all shadow-md",
        tone === "danger" && "border-rose-900/40 bg-rose-950/10",
        tone === "warning" && "border-orange-900/40 bg-orange-950/10",
        (tone === "info" || tone === "neutral") && "border-zinc-800 bg-zinc-900/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-200">{issue.name}</p>
        <StatusPill tone={tone}>{issue.severity}</StatusPill>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold text-white font-mono">
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
    </div>
  );
}