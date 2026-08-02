"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  BarChart3,
  Clock,
  User,
  ListChecks,
  Copy,
  Check,
  ShieldCheck,
  Search,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emailPlatformLabel, smsPlatformLabel, adDataPlatformLabel } from "@/lib/copy";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import type { PileOnDetail } from "../_shared/types";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function PileOnView({ detail }: { detail: PileOnDetail }) {
  const { run, send } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const outcomeTone: Tone = send?.error
    ? "danger"
    : send?.sentVia === "hybrid"
    ? "success"
    : "info";

  const outcomeLabel = send?.error
    ? "Failed"
    : send?.sentVia === "hybrid"
    ? "Personalized (hybrid)"
    : "Template fallback";

  // Filter channels for List/Board search
  const channels = useMemo(() => {
    const list = [
      {
        key: "email",
        type: "Email sequence",
        platform: emailPlatformLabel(run.stack?.email_platform),
        icon: Mail,
      },
      {
        key: "sms",
        type: "SMS sequence",
        platform:
          run.stack?.sms_platform && run.stack.sms_platform !== "none"
            ? smsPlatformLabel(run.stack.sms_platform)
            : "Not configured",
        icon: MessageSquare,
      },
      {
        key: "ad_data",
        type: "Ad attribution",
        platform:
          run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
            ? adDataPlatformLabel(run.stack.ad_data_platform)
            : "Not configured",
        icon: BarChart3,
      },
    ];

    if (!filterText.trim()) return list;
    const q = filterText.toLowerCase();
    return list.filter(
      (c) => c.type.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q)
    );
  }, [run.stack, filterText]);

  if (!send) {
    return (
      <div className="flex flex-col gap-3 font-sans antialiased">
        <EmptyState
          icon={Zap}
          title="No dispatch recorded for this run"
          description="This run either failed before the personalization dispatch completed, or it ran before per-run correlation was added — check the Steps panel for detailed logs."
        />

        {/* Stack Config Reference */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks size={14} className="text-zinc-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">
              Configured Dispatch Channels
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ChannelChip
              icon={Mail}
              label="Email sequence"
              value={emailPlatformLabel(run.stack?.email_platform)}
            />
            <ChannelChip
              icon={MessageSquare}
              label="SMS sequence"
              value={
                run.stack?.sms_platform && run.stack.sms_platform !== "none"
                  ? smsPlatformLabel(run.stack.sms_platform)
                  : "Not configured"
              }
            />
            <ChannelChip
              icon={BarChart3}
              label="Ad attribution"
              value={
                run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
                  ? adDataPlatformLabel(run.stack.ad_data_platform)
                  : "Not configured"
              }
            />
          </div>
        </div>
      </div>
    );
  }

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
            placeholder="Search prospect or channel..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        <ViewSwitcher value={mode} onChange={setMode} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. OVERVIEW / CALENDAR VIEW                                       */}
      {/* ----------------------------------------------------------------- */}
      {mode === "calendar" && (
        <>
          {/* Prospect Summary Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0 font-bold font-mono text-xs">
                {send.prospectEmail.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">{send.prospectEmail}</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(send.prospectEmail, "email")}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    title="Copy prospect email"
                  >
                    {copiedKey === "email" ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                  <span>Booking {send.bookingId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(send.bookingId, "bookingId")}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
                    title="Copy booking ID"
                  >
                    {copiedKey === "bookingId" ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
              {send.latencyMs != null && (
                <span className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-400">
                  <Clock size={11} /> {(send.latencyMs / 1000).toFixed(1)}s total
                </span>
              )}
            </div>
          </div>

          {/* Speed-to-Lead Execution Flow Pipeline */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="mb-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              Instant Speed-To-Lead Execution Flow
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <Zap size={14} className="text-emerald-400 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-zinc-200">1. Webhook Received</p>
                  <p className="text-[10px] text-zinc-500 font-mono">Instant Ack (200 OK)</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <Sparkles
                  size={14}
                  className={cn(
                    "shrink-0",
                    send.sentVia === "hybrid" ? "text-amber-400" : "text-zinc-500"
                  )}
                />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-zinc-200">2. AI Personalization</p>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {send.sentVia === "hybrid" ? "AI Intro Generated" : "Fallback Template Used"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <ShieldCheck size={14} className="text-sky-400 shrink-0" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-zinc-200">3. Multi-Channel Sync</p>
                  <p className="text-[10px] text-zinc-500 font-mono">ESP + SMS + Ad Cohort</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Personalization Preview Block */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">
                  AI Personalization Content
                </h3>
              </div>
              {send.personalizedIntro && (
                <button
                  type="button"
                  onClick={() => handleCopy(send.personalizedIntro!, "intro")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-mono transition-all cursor-pointer"
                >
                  {copiedKey === "intro" ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                  <span>{copiedKey === "intro" ? "Copied" : "Copy Intro"}</span>
                </button>
              )}
            </div>

            {send.personalizedIntro ? (
              <p className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-200 font-sans">
                {send.personalizedIntro}
              </p>
            ) : send.error ? (
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/10 p-3.5 text-xs text-rose-400 flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>Generation/delivery error: {send.error}</span>
              </div>
            ) : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500">
                No personalized text was generated — AI synthesis did not complete within the allocation budget, so the buyer's standard template intro was delivered to guarantee zero lead delay.
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
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-zinc-900/50">
                <th className="px-4 py-2 font-semibold">Channel</th>
                <th className="px-4 py-2 font-semibold">Platform</th>
                <th className="px-4 py-2 font-semibold">Prospect</th>
                <th className="px-4 py-2 font-semibold">Dispatch Outcome</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => {
                const Icon = ch.icon;
                return (
                  <tr key={ch.key} className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40">
                    <td className="px-4 py-2.5 font-medium text-white flex items-center gap-2">
                      <Icon size={12} className="text-zinc-400" />
                      {ch.type}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-300">{ch.platform}</td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono">{send.prospectEmail}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. ASANA KANBAN BOARD VIEW                                        */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["Personalized (Hybrid)", "Template Fallback", "Failed"] as const).map((col) => {
            const matchesCol =
              (col === "Personalized (Hybrid)" && send.sentVia === "hybrid" && !send.error) ||
              (col === "Template Fallback" && send.sentVia !== "hybrid" && !send.error) ||
              (col === "Failed" && Boolean(send.error));

            return (
              <div key={col} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-zinc-300">{col}</span>
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                    {matchesCol ? 1 : 0}
                  </span>
                </div>

                <div className="space-y-2">
                  {matchesCol ? (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold font-mono text-zinc-300 shrink-0">
                          {send.prospectEmail.slice(0, 2).toUpperCase()}
                        </div>
                        <p className="font-semibold text-white truncate">{send.prospectEmail}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 text-[10px] text-zinc-400 font-mono">
                        <span>Booking {send.bookingId.slice(0, 12)}...</span>
                        {send.latencyMs && <span>{(send.latencyMs / 1000).toFixed(1)}s</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600">
                      No dispatches in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. CONFIGURED DISPATCH CHANNELS FOOTER                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={14} className="text-zinc-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300">
            Configured Dispatch Channels
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ChannelChip
            icon={Mail}
            label="Email sequence"
            value={emailPlatformLabel(run.stack?.email_platform)}
          />
          <ChannelChip
            icon={MessageSquare}
            label="SMS sequence"
            value={
              run.stack?.sms_platform && run.stack.sms_platform !== "none"
                ? smsPlatformLabel(run.stack.sms_platform)
                : "Not configured"
            }
          />
          <ChannelChip
            icon={BarChart3}
            label="Ad attribution"
            value={
              run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
                ? adDataPlatformLabel(run.stack.ad_data_platform)
                : "Not configured"
            }
          />
        </div>

        <p className="mt-3 text-[10px] text-zinc-500">
          Per-channel enrollment outcomes for this specific run (ESP sequence, SMS schedule, ad cohort sync) are logged as steps — see the Steps panel for exact success/failure per channel.
        </p>
      </div>
    </div>
  );
}

function ChannelChip({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-500">
        <Icon size={11} /> {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-zinc-200">{value}</p>
    </div>
  );
}