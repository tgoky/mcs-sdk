"use client";

// Daily Send's own run-detail view — the real, per-run scope
// coldOpenLeads.runId makes possible (each lead row is tied to the exact
// run that fetched/pushed it), same as Pile-On/Win-Back's own per-run
// views. Before this existed, an individual Daily Send run fell to the
// generic AdhocRunSummaryView — prose bullets ("pushed 18, held 2") with
// no way to see which leads those actually were.

import { Send } from "lucide-react";
import { EmptyState } from "../_shared/empty-state";
import { StatusPill } from "../_shared/status-pill";
import type { DailySendDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const LEAD_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pushed: { label: "Pushed", tone: "success" },
  dry_run: { label: "Dry run", tone: "info" },
  held: { label: "Held for review", tone: "warning" },
  duplicate: { label: "Duplicate", tone: "neutral" },
  skipped_dead: { label: "Skipped — dead lead", tone: "neutral" },
  skipped_filtered: { label: "Skipped — filtered", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
  discarded: { label: "Discarded", tone: "neutral" },
};

function leadName(l: DailySendDetail["leads"][number]): string {
  const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim();
  return name || l.email;
}

export function DailySendView({ detail }: { detail: DailySendDetail }) {
  const { leads } = detail;

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No leads recorded for this run"
        description="This run either fetched nothing new (every lead already on file was a duplicate) or failed before any lead was processed."
      />
    );
  }

  const pushed = leads.filter((l) => l.status === "pushed").length;
  const held = leads.filter((l) => l.status === "held").length;
  const errors = leads.filter((l) => l.status === "error").length;

  return (
    <div className="flex flex-col gap-2 font-sans antialiased">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-500 pb-1 border-b border-zinc-200 dark:border-zinc-800">
        {leads.length} lead{leads.length === 1 ? "" : "s"} · {pushed} pushed
        {held > 0 ? ` · ${held} held` : ""}
        {errors > 0 ? ` · ${errors} error(s)` : ""}
      </p>
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {leads.map((l) => {
          const meta = LEAD_STATUS_META[l.status] ?? { label: l.status, tone: "neutral" as Tone };
          return (
            <div key={l.id} className="py-3 first:pt-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{leadName(l)}</span>
                <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {l.companyName} {l.icp ? `· ${l.icp}` : ""} · {l.campaignId}
              </p>
              {l.status === "error" && l.statusDetail != null && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-mono break-all">
                  {typeof l.statusDetail === "string" ? l.statusDetail : JSON.stringify(l.statusDetail)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
