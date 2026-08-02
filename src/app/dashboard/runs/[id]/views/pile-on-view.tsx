"use client";

import { Sparkles, Zap, Mail, MessageSquare, BarChart3, Clock, User, ListChecks } from "lucide-react";
import { emailPlatformLabel, smsPlatformLabel, adDataPlatformLabel } from "@/lib/copy";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import type { PileOnDetail } from "../_shared/types";

export function PileOnView({ detail }: { detail: PileOnDetail }) {
  const { run, send } = detail;

  if (!send) {
    return (
      <EmptyState
        icon={Zap}
        title="No dispatch recorded for this run"
        description="This run either failed before the personalization dispatch ran, or it ran before per-run correlation was added — check the Steps panel for what it actually did."
      />
    );
  }

  const outcomeTone = send.error ? "danger" : send.sentVia === "hybrid" ? "success" : "info";
  const outcomeLabel = send.error ? "Failed" : send.sentVia === "hybrid" ? "Personalized (hybrid)" : "Template fallback";

  return (
    <div className="flex flex-col gap-3">
      {/* Prospect Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-400">
            <User size={16} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">{send.prospectEmail}</p>
            <p className="text-xs text-zinc-500">Booking {send.bookingId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
          {send.latencyMs != null && (
            <span className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
              <Clock size={11} /> {(send.latencyMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* AI Personalization Preview */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Claude personalization preview</h3>
        </div>
        {send.personalizedIntro ? (
          <p className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-200">
            {send.personalizedIntro}
          </p>
        ) : send.error ? (
          <p className="rounded-xl border border-rose-900/40 bg-rose-950/10 p-3.5 text-xs text-rose-400">
            Generation/delivery failed within budget: {send.error}
          </p>
        ) : (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500">
            No personalized text was generated — the receiver budget (6s) was likely exceeded, so the buyer's standard template intro was delivered instead.
          </p>
        )}
      </div>

      {/* Multi-channel config context */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={14} className="text-zinc-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">Configured dispatch channels</h3>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ChannelChip icon={Mail} label="Email sequence" value={emailPlatformLabel(run.stack?.email_platform)} />
          <ChannelChip icon={MessageSquare} label="SMS sequence" value={run.stack?.sms_platform && run.stack.sms_platform !== "none" ? smsPlatformLabel(run.stack.sms_platform) : "Not configured"} />
          <ChannelChip icon={BarChart3} label="Ad attribution" value={run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none" ? adDataPlatformLabel(run.stack.ad_data_platform) : "Not configured"} />
        </div>
        <p className="mt-3 text-[10px] text-zinc-500">
          Per-channel enrollment outcomes for this specific run (ESP sequence, SMS schedule, ad cohort sync) are logged as steps — see the Steps panel for exact success/failure per channel.
        </p>
      </div>
    </div>
  );
}

function ChannelChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-500"><Icon size={11} /> {label}</p>
      <p className="mt-0.5 text-xs font-semibold text-zinc-200">{value}</p>
    </div>
  );
}
