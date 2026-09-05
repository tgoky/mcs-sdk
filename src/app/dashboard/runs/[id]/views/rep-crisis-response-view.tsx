"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { StatusPill } from "../_shared/status-pill";
import type { RepCrisisResponseDetail } from "../_shared/types";

const SOURCE_LABEL: Record<string, string> = {
  engine_panel: "AI engine",
  trustpilot: "Trustpilot",
  reddit: "Reddit",
  twitter: "Twitter/X",
  anomaly: "Anomaly detection",
};

// Matches each source's own badge hue elsewhere in Reputation Manager
// (rep-skill-badge.tsx's REP_SKILL_SQUISHY_CONFIG) so "sky = AI engine",
// "orange = Reddit" etc. reads the same wherever it shows up.
const SOURCE_SWATCH: Record<string, string> = {
  engine_panel: "bg-sky-400",
  trustpilot: "bg-lime-500",
  reddit: "bg-orange-400",
  twitter: "bg-violet-400",
  anomaly: "bg-rose-500",
};

export function RepCrisisResponseView({ detail }: { detail: RepCrisisResponseDetail }) {
  const { incident } = detail;

  if (!incident) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No incident declared"
        description="This run assessed the client's flagged findings and stayed below the crisis threshold — nothing needed escalation."
      />
    );
  }

  const severityTone = incident.severityScore >= 80 ? "danger" : incident.severityScore >= 50 ? "warning" : "info";

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-600 dark:text-rose-400" />
            <h2 className="text-sm font-bold text-rose-900 dark:text-rose-200">Incident declared</h2>
          </div>
          <StatusPill tone={severityTone}>severity {incident.severityScore}/100</StatusPill>
        </div>
        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{incident.summary}</p>
        {incident.signalClass && (
          <p className="text-[11px] font-mono text-rose-700 dark:text-rose-400 mt-2">
            Force-triggered: {incident.signalClass.replace(/_/g, " ")} (declared regardless of score)
          </p>
        )}
        <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-2">
          Status: {incident.status} · Nothing has been published — this is a notification only.
        </p>
      </div>

      {incident.contributingFindings.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 mb-2">
            Contributing findings ({incident.contributingFindings.length})
          </h3>
          <div className="flex flex-col gap-2">
            {incident.contributingFindings.map((f, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-[2.5px] shrink-0 ${SOURCE_SWATCH[f.source] ?? "bg-zinc-400"}`} aria-hidden="true" />
                    <span className="text-[10px] font-mono font-bold uppercase text-zinc-600 dark:text-zinc-400">
                      {SOURCE_LABEL[f.source] ?? f.source}
                    </span>
                  </span>
                  {f.compositeScore !== undefined && (
                    <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-500">composite {f.compositeScore}</span>
                  )}
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">{f.excerpt}</p>
                {f.flagReason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{f.flagReason}</p>}
                {(f.reach !== undefined || f.sentiment !== undefined || f.permanence !== undefined) && (
                  <div className="flex gap-3 mt-1.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-500">
                    {f.reach !== undefined && <span>reach {f.reach}/10</span>}
                    {f.sentiment !== undefined && <span>sentiment {f.sentiment}/10</span>}
                    {f.permanence !== undefined && <span>permanence {f.permanence}/10</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
