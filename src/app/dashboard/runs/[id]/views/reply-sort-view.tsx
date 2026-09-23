"use client";

// Reply Sort's own run-detail view. coldOpenReplies has no runId column
// (replies arrive on their own schedule via the ESP's inbox, not tied to
// a specific dispatch the way a pushed lead is) — scoped to this run's
// own [startedAt, completedAt] window instead, same convention the RM
// watch views already use for their own runId-less ingestion tables.

import { MessageSquare, ExternalLink } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { StatusPill } from "../_shared/status-pill";
import type { ReplySortDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const DISPOSITION_META: Record<string, { label: string; tone: Tone }> = {
  interested: { label: "Interested", tone: "success" },
  objection: { label: "Objection", tone: "warning" },
  not_now: { label: "Not now", tone: "info" },
  not_a_fit: { label: "Not a fit", tone: "neutral" },
  auto_reply: { label: "Auto-reply", tone: "neutral" },
  unsubscribe: { label: "Unsubscribe", tone: "neutral" },
  unclassified: { label: "Unclassified (needs review)", tone: "danger" },
};

export function ReplySortView({ detail }: { detail: ReplySortDetail }) {
  const { replies } = detail;

  if (replies.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No replies classified in this run"
        description="No new replies came in during this run's window. That's a normal, healthy outcome, not a failure."
      />
    );
  }

  const routed = replies.filter((r) => r.routedToQueue && !r.queueResolvedAt).length;

  return (
    <div className="flex flex-col gap-2 font-sans antialiased">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500 pb-1 border-b border-zinc-200 dark:border-zinc-800">
        {replies.length} repl{replies.length === 1 ? "y" : "ies"} classified{routed > 0 ? ` · ${routed} routed to Queue` : ""}
      </p>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {replies.map((r) => {
          const meta = DISPOSITION_META[r.disposition] ?? { label: r.disposition, tone: "neutral" as Tone };
          return (
            <div key={r.id} className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{r.leadEmail}</span>
                <div className="flex items-center gap-1.5">
                  <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  {r.routedToQueue && !r.queueResolvedAt && (
                    <a href="/dashboard/queue" className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2">
                      Queue <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{r.rawBody}</p>
              <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mt-1">
                classified via {r.classificationSource}
                {r.campaignId ? ` · ${r.campaignId}` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
