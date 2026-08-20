"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  BarChart3,
  ListChecks,
  Copy,
  Check,
  ShieldCheck,
  Search,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emailPlatformLabel, smsPlatformLabel, adDataPlatformLabel, sentViaLabel, runStatusLabel } from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import { StatusPill } from "../_shared/status-pill";
import type { PileOnDetail, SequenceMessage } from "../_shared/types";
import type { RunStep } from "@/models/schema";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function PileOnView({ detail, steps }: { detail: PileOnDetail; steps: RunStep[] }) {
  const { run, send, smsMessages } = detail;
  const [filterText, setFilterText] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const latestStepFor = (phase: string): RunStep | undefined => {
    const matches = steps.filter((s) => s.phase === phase);
    return matches[matches.length - 1];
  };

  const emailStep = latestStepFor("pile_on_enrollment");
  const adDataStep = latestStepFor("ad_data_cohort");
  const smsDispatchStep = latestStepFor("sms_enrollment");

  const smsSentCount = smsMessages.filter((m) => m.status === "sent").length;
  const smsFailedCount = smsMessages.filter((m) => m.status === "failed").length;

  const prospectEmail = send?.prospectEmail
    ?? steps.find(s => s.phase === "pile_on_enrollment" && s.detail?.includes("@"))?.detail?.match(/<([^>]+@[^>]+)>/)?.[1]
    ?? "Enrolled Prospect";

  const bookingId = send?.bookingId ?? "—";

  const outcomeTone: Tone = send?.error
    ? "danger"
    : send?.sentVia === "hybrid"
    ? "success"
    : emailStep?.status === "failed"
    ? "danger"
    : emailStep?.status === "success"
    ? "success"
    : "info";

  const outcomeLabel = send?.error
    ? "Failed"
    : send?.sentVia === "hybrid"
    ? "Personalized message"
    : emailStep?.status === "success"
    ? "Standard Sequence Enrolled"
    : emailStep?.status === "failed"
    ? "Enrollment Failed"
    : "Standard template used";

  // Filterable channel rows — flat list, no grouping needed
  const channels = useMemo(() => {
    const q = filterText.toLowerCase().trim();

    const rows: {
      id: string;
      type: "email" | "sms" | "ad_data";
      title: string;
      subtitle: string;
      badge: string;
      tone: Tone;
      icon: React.ElementType;
      platform: string;
      step: RunStep | undefined;
      messages?: SequenceMessage[];
    }[] = [];

    rows.push({
      id: "email-channel",
      type: "email",
      title: "Email Sequence Dispatch",
      subtitle: emailStep
        ? emailStep.detail ?? emailPlatformLabel(run.stack?.email_platform)
        : run.stack?.email_platform
        ? `${emailPlatformLabel(run.stack.email_platform)} — wasn't attempted on this run`
        : "Not configured",
      badge: emailStep?.status === "success" ? "Enrolled" : emailStep?.status === "failed" ? "Failed" : emailStep?.status === "running" ? "In progress" : "Not attempted",
      tone: emailStep?.status === "success" ? "success" : emailStep?.status === "failed" ? "danger" : emailStep?.status === "running" ? "info" : "neutral",
      icon: Mail,
      platform: emailPlatformLabel(run.stack?.email_platform),
      step: emailStep,
    });

    rows.push({
      id: "sms-channel",
      type: "sms",
      title: "SMS Sequence Dispatch",
      subtitle:
        !run.stack?.sms_platform || run.stack.sms_platform === "none"
          ? "Not configured"
          : smsMessages.length > 0
          ? `${smsSentCount} sent${smsFailedCount > 0 ? `, ${smsFailedCount} failed` : ""} of ${smsMessages.length} attempted so far`
          : smsDispatchStep?.status === "success"
          ? "Sequence dispatched — no messages sent yet (still waiting on scheduled times)"
          : smsDispatchStep?.status === "failed"
          ? (smsDispatchStep.detail ?? "Sequence failed to start")
          : `${smsPlatformLabel(run.stack.sms_platform)} — no dispatch recorded on this run`,
      badge:
        !run.stack?.sms_platform || run.stack.sms_platform === "none"
          ? "Disabled"
          : smsFailedCount > 0 && smsSentCount === 0
          ? "Failed"
          : smsFailedCount > 0
          ? `${smsSentCount} sent, ${smsFailedCount} failed`
          : smsSentCount > 0
          ? `${smsSentCount} sent`
          : smsDispatchStep?.status === "failed"
          ? "Failed"
          : "Scheduled",
      tone:
        !run.stack?.sms_platform || run.stack.sms_platform === "none"
          ? "neutral"
          : smsFailedCount > 0 && smsSentCount === 0
          ? "danger"
          : smsFailedCount > 0
          ? "warning"
          : smsSentCount > 0
          ? "success"
          : smsDispatchStep?.status === "failed"
          ? "danger"
          : "info",
      icon: MessageSquare,
      platform: smsPlatformLabel(run.stack?.sms_platform),
      step: smsDispatchStep,
      messages: smsMessages,
    });

    rows.push({
      id: "ad-data-channel",
      type: "ad_data",
      title: "Ad Audience Update",
      subtitle: adDataStep
        ? adDataStep.detail ?? adDataPlatformLabel(run.stack?.ad_data_platform)
        : run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
        ? `${adDataPlatformLabel(run.stack.ad_data_platform)} — not updated on this run`
        : "Not configured",
      badge: adDataStep?.status === "success" ? "Synced" : adDataStep?.status === "failed" ? "Failed" : adDataStep?.status === "running" ? "In progress" : "Not attempted",
      tone: adDataStep?.status === "success" ? "success" : adDataStep?.status === "failed" ? "danger" : adDataStep?.status === "running" ? "info" : "neutral",
      icon: BarChart3,
      platform: adDataPlatformLabel(run.stack?.ad_data_platform),
      step: adDataStep,
    });

    if (!q) return rows;
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );
  }, [send, run.stack, filterText, emailStep, adDataStep, smsDispatchStep, smsMessages, smsSentCount, smsFailedCount]);

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ── TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f8f7fa] dark:bg-zinc-950 p-1.5 border border-zinc-200 dark:border-zinc-800">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search channel..."
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
          />
        </div>
      </div>

      {/* ── PROSPECT HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 shrink-0 font-bold font-mono text-xs">
            {prospectEmail.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-zinc-900 dark:text-white">{prospectEmail}</p>
              <button
                type="button"
                onClick={() => handleCopy(prospectEmail, "email")}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                title="Copy prospect email"
              >
                {copiedKey === "email" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
              <span>Booking {bookingId}</span>
              {send && (
                <button
                  type="button"
                  onClick={() => handleCopy(send.bookingId, "bookingId")}
                  className="text-zinc-700 dark:text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
                  title="Copy booking ID"
                >
                  {copiedKey === "bookingId" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              )}
            </div>
          </div>
        </div>
        <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
      </div>

      {/* ── SPEED-TO-LEAD PIPELINE ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4">
        <h3 className="mb-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
          Instant Speed-To-Lead Execution Flow
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 p-2.5">
            <Zap size={14} className="text-emerald-400 shrink-0" />
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">1. Booking Received</p>
              <p className="text-[10px] text-zinc-500">Confirmed instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 p-2.5">
            <Sparkles
              size={14}
              className={cn("shrink-0", send?.sentVia === "hybrid" ? "text-amber-400" : "text-zinc-500")}
            />
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">2. AI Personalization</p>
              <p className="text-[10px] text-zinc-500">{send?.sentVia === "hybrid" ? "Personalized intro written" : "Standard template used"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 p-2.5">
            <ShieldCheck size={14} className="text-sky-400 shrink-0" />
            <div className="min-w-0 text-xs">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200">3. Follow-Up Sequences</p>
              <p className="text-[10px] text-zinc-500">Email, text & ad audience updated</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI PERSONALIZATION CONTENT ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              AI Personalization Content
            </h3>
          </div>
          {send?.personalizedIntro && (
            <button
              type="button"
              onClick={() => handleCopy(send.personalizedIntro!, "intro")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-700 text-xs font-mono transition-all cursor-pointer"
            >
              {copiedKey === "intro" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copiedKey === "intro" ? "Copied" : "Copy Intro"}</span>
            </button>
          )}
        </div>

        {send?.personalizedIntro ? (
          <p className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
            {send.personalizedIntro}
          </p>
        ) : send?.error ? (() => {
          const diagnosis = classifyRunError(send.error);
          return (
            <div className="rounded-xl border border-rose-900/40 bg-rose-950/10 p-3.5 text-xs text-rose-400 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {diagnosis ? (
                <div>
                  <span className="font-semibold block">{diagnosis.title}</span>
                  <span>{diagnosis.explanation}</span>
                </div>
              ) : (
                <span>This didn&apos;t go out — it hit an unexpected error. If it keeps happening, let your account contact know.</span>
              )}
            </div>
          );
        })() : (
          <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500">
            This prospect got your standard {emailPlatformLabel(run.stack?.email_platform)} sequence — no AI-personalized intro was generated for this send.
          </p>
        )}
      </div>

      {/* ── CHANNEL DETAILS — flat, stacked, everything visible ── */}
      <div className="flex flex-col gap-2.5">
        {channels.map((ch) => {
          const Icon = ch.icon;
          return (
            <div
              key={ch.id}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3 space-y-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon size={13} className="text-amber-500 dark:text-amber-400 shrink-0" />
                  <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{ch.title}</p>
                </div>
                <StatusPill tone={ch.tone} className="text-[9.5px] shrink-0">{ch.badge}</StatusPill>
              </div>

              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">{ch.subtitle}</p>

              {/* Platform + prospect metadata */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-3 text-xs text-zinc-700 dark:text-zinc-300 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Connected platform</span>
                  <span>{ch.platform || "—"}{ch.platform === "Not configured" ? "" : ""}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Prospect</span>
                  <span className="truncate max-w-[60%] text-right">{send?.prospectEmail ?? "This booking"}</span>
                </div>
              </div>

              {/* SMS: individual message history */}
              {ch.type === "sms" && ch.messages && ch.messages.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Send history ({ch.messages.length})
                  </span>
                  {ch.messages.map((m: SequenceMessage, i: number) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-700 dark:text-zinc-300 font-semibold">Text message {i + 1}</span>
                        <StatusPill tone={m.status === "sent" ? "success" : "danger"}>
                          {m.status === "sent" ? "Sent" : "Failed"}
                        </StatusPill>
                      </div>
                      <p className="text-zinc-500">{new Date(m.sentAt).toLocaleString()}</p>
                      {m.error && (() => {
                        const diagnosis = classifyRunError(m.error);
                        return diagnosis ? (
                          <p className="text-rose-400">{diagnosis.title}</p>
                        ) : (
                          <p className="text-rose-400">This message didn&apos;t send.</p>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}

              {ch.type === "sms" && (!ch.messages || ch.messages.length === 0) && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/40 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg">
                  No individual messages have sent yet — they go out on the schedule set for this booking, each logged here the moment it sends.
                </p>
              )}

              {/* Email / Ad Data: step attempt detail */}
              {(ch.type === "email" || ch.type === "ad_data") && ch.step && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3 text-xs text-zinc-700 dark:text-zinc-300 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Last attempt</span>
                    <StatusPill
                      tone={ch.step.status === "success" ? "success" : ch.step.status === "failed" ? "danger" : "info"}
                    >
                      {runStatusLabel(ch.step.status)}
                    </StatusPill>
                  </div>
                  <p className="text-zinc-500">
                    {new Date(ch.step.completedAt ?? ch.step.startedAt).toLocaleString()}
                  </p>
                  {ch.step.detail && ch.step.status === "failed"
                    ? (() => {
                        const diagnosis = classifyRunError(ch.step!.detail);
                        return diagnosis ? (
                          <div className="pt-1">
                            <p className="text-zinc-700 dark:text-zinc-300 font-semibold">{diagnosis.title}</p>
                            <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">{diagnosis.explanation}</p>
                          </div>
                        ) : (
                          <p className="text-zinc-600 dark:text-zinc-400 pt-1">This didn&apos;t go out — it hit an unexpected error.</p>
                        );
                      })()
                    : ch.step.detail
                    ? <p className="text-zinc-600 dark:text-zinc-400 pt-1">{ch.step.detail}</p>
                    : null}
                </div>
              )}

              {(ch.type === "email" || ch.type === "ad_data") && !ch.step && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed bg-white/40 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg">
                  Nothing has been attempted on this channel for this run yet.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── CONFIGURED DISPATCH CHANNELS FOOTER ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={14} className="text-zinc-600 dark:text-zinc-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Configured Dispatch Channels
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ChannelChip icon={Mail} label="Email sequence" value={emailPlatformLabel(run.stack?.email_platform)} />
          <ChannelChip
            icon={MessageSquare}
            label="SMS sequence"
            value={run.stack?.sms_platform && run.stack.sms_platform !== "none" ? smsPlatformLabel(run.stack.sms_platform) : "Not configured"}
          />
          <ChannelChip
            icon={BarChart3}
            label="Ad attribution"
            value={run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none" ? adDataPlatformLabel(run.stack.ad_data_platform) : "Not configured"}
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
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-2.5">
      <p className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-500">
        <Icon size={11} /> {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}