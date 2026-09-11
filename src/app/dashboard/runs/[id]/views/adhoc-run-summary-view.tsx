"use client";

// src/app/dashboard/runs/[id]/views/adhoc-run-summary-view.tsx
//
// Fallback view for the 6 chat-only adhoc RM actions (rep-engine-adhoc-
// check, rep-crisis-stress-test, rep-draft-response, rep-twitter-deep-
// scan, rep-trustpilot-deep-scan, rep-reddit-deep-scan) — before this,
// SkillView's switch had no case for any of them, so they fell to
// `default: <PinDownView>`, which renders Showtime script/brief/page-audit
// deliverables that are always null for an RM run. None of these 6 write
// to a dedicated ingestion table (they're ephemeral spot-checks or, for
// the 3 deep-scans, they insert into the SAME tables the regular watch
// skills do — no separate view needed since that data already shows up
// wherever the regular watch findings are shown). Their real output is
// entirely in the run's own summary (whatWorked/whatFailed/openItems/
// decisionsMade), so that's all this renders.

import { CheckCircle2, XCircle, Circle, ListChecks } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import type { AdhocRunDetail } from "../_shared/types";

function SummarySection({ icon: Icon, label, items, tone }: { icon: React.ElementType; label: string; items: string[]; tone: "success" | "danger" | "neutral" | "info" }) {
  if (items.length === 0) return null;
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "info"
      ? "text-sky-600 dark:text-sky-400"
      : "text-zinc-500 dark:text-zinc-400";
  return (
    <div className="space-y-2">
      <span className={`flex items-center gap-1.5 text-[10.5px] font-mono font-bold uppercase tracking-wider ${toneClass}`}>
        <Icon size={13} /> {label}
      </span>
      <ul className="space-y-1.5 pl-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdhocRunSummaryView({ detail }: { detail: AdhocRunDetail }) {
  const { summary } = detail.run;

  if (!summary) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No summary recorded for this run"
        description="This run either hasn't finished yet or failed before it could record what happened."
      />
    );
  }

  const hasAnything =
    summary.whatWorked.length > 0 || summary.whatFailed.length > 0 || summary.openItems.length > 0 || summary.decisionsMade.length > 0;

  if (!hasAnything) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Nothing recorded for this run"
        description="The run completed without producing any summary detail."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans antialiased">
      <SummarySection icon={CheckCircle2} label="What worked" items={summary.whatWorked} tone="success" />
      <SummarySection icon={XCircle} label="What failed" items={summary.whatFailed} tone="danger" />
      <SummarySection icon={Circle} label="Decisions made" items={summary.decisionsMade} tone="info" />
      <SummarySection icon={ListChecks} label="Open items" items={summary.openItems} tone="neutral" />
    </div>
  );
}
