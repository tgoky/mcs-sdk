"use client";

import { AlertTriangle, TrendingDown, TrendingUp, FileText, Siren, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill, toneFromSeverity } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import type { AuditRow, LeakMapDetail } from "../_shared/types";

function severityRank(s: string) {
  return { high: 3, medium: 2, low: 1, none: 0 }[s] ?? 0;
}

export function LeakMapView({ detail }: { detail: LeakMapDetail }) {
  const { audit } = detail;

  if (!audit) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No audit recorded for this run"
        description="This run either failed before the audit could be computed, or it ran before per-run correlation was added — check the Steps panel for what it actually did."
      />
    );
  }

  const issues = [...(audit.topIssues ?? [])].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  const overallSeverity = issues[0]?.severity ?? "none";

  return (
    <div className="flex flex-col gap-3">
      {/* Overall severity banner */}
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
        overallSeverity === "high" && "border-rose-900/50 bg-rose-950/10",
        overallSeverity === "medium" && "border-orange-900/50 bg-orange-950/10",
        (overallSeverity === "low" || overallSeverity === "none") && "border-zinc-800 bg-zinc-900/30"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            overallSeverity === "high" && "bg-rose-500/15 text-rose-400",
            overallSeverity === "medium" && "bg-orange-500/15 text-orange-400",
            (overallSeverity === "low" || overallSeverity === "none") && "bg-zinc-800 text-zinc-400"
          )}>
            <Siren size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Overall funnel health: {overallSeverity === "none" ? "Stable" : `${overallSeverity} severity`}</p>
            <p className="text-xs text-zinc-500">{audit.runType} audit · {issues.length} metric{issues.length === 1 ? "" : "s"} evaluated</p>
          </div>
        </div>
        {(audit.alertsFired?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-400">
            <AlertTriangle size={12} /> {audit.alertsFired!.length} alert{audit.alertsFired!.length === 1 ? "" : "s"} fired
          </div>
        )}
      </div>

      {/* Severity-ranked metric cards */}
      {issues.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {issues.map((issue) => (
            <IssueCard key={issue.name} issue={issue} />
          ))}
        </div>
      )}

      {/* Data gaps */}
      {(audit.gaps?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-2 flex items-center gap-2">
            <HelpCircle size={14} className="text-zinc-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Data gaps</h3>
          </div>
          <ul className="space-y-1">
            {audit.gaps!.map((g, i) => (
              <li key={i} className="text-xs text-zinc-500">· {g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Executive report reader */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <FileText size={14} className="text-zinc-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Executive report</h3>
        </div>
        {audit.reportMarkdown ? (
          <div className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs leading-relaxed text-zinc-300">
            {audit.reportMarkdown}
          </div>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500">
            No report text stored for this run — it likely ran before report persistence was added. Check the Steps panel to confirm whether delivery (Resend/Slack) succeeded.
          </p>
        )}
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: AuditRow["topIssues"] extends (infer T)[] | null ? T : never }) {
  const improved = issue.delta > 0;
  const tone = toneFromSeverity(issue.severity);
  return (
    <div className={cn(
      "rounded-2xl border p-3.5",
      tone === "danger" && "border-rose-900/40 bg-rose-950/10",
      tone === "warning" && "border-orange-900/40 bg-orange-950/10",
      (tone === "info" || tone === "neutral") && "border-zinc-800 bg-zinc-900/40"
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-200">{issue.name}</p>
        <StatusPill tone={tone}>{issue.severity}</StatusPill>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold text-white">{Math.round(issue.current * 100) / 100}</span>
        <span className="text-[11px] text-zinc-500">was {Math.round(issue.prior * 100) / 100}</span>
        <span className={cn("flex items-center gap-0.5 text-[11px] font-semibold", improved ? "text-emerald-400" : "text-rose-400")}>
          {improved ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {issue.delta > 0 ? "+" : ""}{Math.round(issue.delta * 100) / 100}
        </span>
      </div>
    </div>
  );
}
