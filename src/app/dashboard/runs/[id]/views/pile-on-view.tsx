"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  BarChart3,
  Copy,
  Check,
  ShieldCheck,
  Search,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  emailPlatformLabel,
  smsPlatformLabel,
  adDataPlatformLabel,
  sentViaLabel,
  runStatusLabel,
} from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import { StatusPill } from "../_shared/status-pill";
import type { PileOnDetail, SequenceMessage } from "../_shared/types";
import type { RunStep } from "@/models/schema";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

export function PileOnView({
  detail,
  steps,
}: {
  detail: PileOnDetail;
  steps: RunStep[];
}) {
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

  // Real email or null — no fake fallback text
  const prospectEmail =
    send?.prospectEmail ??
    steps
      .find((s) => s.phase === "pile_on_enrollment" && s.detail?.includes("@"))
      ?.detail?.match(/<([^>]+@[^>]+)>/)?.[1] ??
    null;

  const bookingId = send?.bookingId ?? null;

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
    ? "Personalized"
    : emailStep?.status === "success"
    ? "Enrolled"
    : emailStep?.status === "failed"
    ? "Failed"
    : "Standard Template";

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
      title: "Email Sequence",
      subtitle: emailStep
        ? emailStep.detail ?? emailPlatformLabel(run.stack?.email_platform)
        : run.stack?.email_platform
        ? `${emailPlatformLabel(run.stack.email_platform)} — Not attempted`
        : "Not configured",
      badge:
        emailStep?.status === "success"
          ? "Enrolled"
          : emailStep?.status === "failed"
          ? "Failed"
          : emailStep?.status === "running"
          ? "In Progress"
          : "Not Attempted",
      tone:
        emailStep?.status === "success"
          ? "success"
          : emailStep?.status === "failed"
          ? "danger"
          : emailStep?.status === "running"
          ? "info"
          : "neutral",
      icon: Mail,
      platform: emailPlatformLabel(run.stack?.email_platform),
      step: emailStep,
    });

    rows.push({
      id: "sms-channel",
      type: "sms",
      title: "SMS Sequence",
      subtitle:
        !run.stack?.sms_platform || run.stack.sms_platform === "none"
          ? "Not configured"
          : smsMessages.length > 0
          ? `${smsSentCount} sent${smsFailedCount > 0 ? `, ${smsFailedCount} failed` : ""} of ${smsMessages.length} attempted`
          : smsDispatchStep?.status === "success"
          ? "Dispatched — waiting on schedule"
          : smsDispatchStep?.status === "failed"
          ? smsDispatchStep.detail ?? "Failed to start"
          : `${smsPlatformLabel(run.stack.sms_platform)} — no dispatch recorded`,
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
      title: "Ad Audience Cohort",
      subtitle: adDataStep
        ? adDataStep.detail ?? adDataPlatformLabel(run.stack?.ad_data_platform)
        : run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
        ? `${adDataPlatformLabel(run.stack.ad_data_platform)} — not updated`
        : "Not configured",
      badge:
        adDataStep?.status === "success"
          ? "Synced"
          : adDataStep?.status === "failed"
          ? "Failed"
          : adDataStep?.status === "running"
          ? "In Progress"
          : "Not Attempted",
      tone:
        adDataStep?.status === "success"
          ? "success"
          : adDataStep?.status === "failed"
          ? "danger"
          : adDataStep?.status === "running"
          ? "info"
          : "neutral",
      icon: BarChart3,
      platform: adDataPlatformLabel(run.stack?.ad_data_platform),
      step: adDataStep,
    });

    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q)
    );
  }, [
    run.stack,
    filterText,
    emailStep,
    adDataStep,
    smsDispatchStep,
    smsMessages,
    smsSentCount,
    smsFailedCount,
  ]);

  return (
    <div className="w-full space-y-6 font-sans antialiased text-zinc-900 dark:text-zinc-100">
      {/* ── HEADER TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          {prospectEmail && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-xs font-semibold shrink-0 border border-zinc-200 dark:border-zinc-700">
              {prospectEmail.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                {prospectEmail ?? `Booking #${bookingId}`}
              </span>
              {prospectEmail && (
                <button
                  type="button"
                  onClick={() => handleCopy(prospectEmail, "email")}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                  title="Copy email"
                >
                  {copiedKey === "email" ? (
                    <Check size={12} className="text-emerald-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              )}
            </div>
            {prospectEmail && bookingId && (
              <p className="text-xs text-zinc-500 font-mono">
                Booking #{bookingId}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
          <div className="relative w-48">
            <Search
              size={13}
              className="absolute left-2.5 top-2.5 text-zinc-400"
            />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter channels..."
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent py-1.5 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:border-zinc-400 dark:focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── EXECUTION FLOW ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
          Flow
        </span>
        <div className="flex items-center gap-1.5">
          <Zap size={13} className="text-emerald-500 shrink-0" />
          <span>Booking Received</span>
        </div>
        <span className="text-zinc-300 dark:text-zinc-700">•</span>
        <div className="flex items-center gap-1.5">
          <Sparkles
            size={13}
            className={cn(
              "shrink-0",
              send?.sentVia === "hybrid" ? "text-amber-500" : "text-zinc-400"
            )}
          />
          <span>
            AI Personalization (
            {send?.sentVia === "hybrid" ? "Personalized" : "Standard"})
          </span>
        </div>
        <span className="text-zinc-300 dark:text-zinc-700">•</span>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-sky-500 shrink-0" />
          <span>Sequences Triggered</span>
        </div>
      </div>

      {/* ── AI PERSONALIZATION CONTENT ── */}
      <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <Sparkles size={13} className="text-amber-500" />
            <span>AI Personalization Content</span>
          </div>
          {send?.personalizedIntro && (
            <button
              type="button"
              onClick={() => handleCopy(send.personalizedIntro!, "intro")}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
            >
              {copiedKey === "intro" ? (
                <Check size={11} className="text-emerald-500" />
              ) : (
                <Copy size={11} />
              )}
              <span>{copiedKey === "intro" ? "Copied" : "Copy"}</span>
            </button>
          )}
        </div>

        {send?.personalizedIntro ? (
          <p className="whitespace-pre-wrap pl-3 border-l-2 border-amber-500/80 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {send.personalizedIntro}
          </p>
        ) : send?.error ? (
          (() => {
            const diagnosis = classifyRunError(send.error);
            return (
              <div className="flex items-start gap-2 pl-3 border-l-2 border-rose-500 text-xs text-rose-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">
                    {diagnosis?.title ?? "Generation Error"}
                  </span>
                  <span>
                    {diagnosis?.explanation ?? "Failed to personalize intro."}
                  </span>
                </div>
              </div>
            );
          })()
        ) : (
          <p className="pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 text-xs italic text-zinc-400">
            Standard {emailPlatformLabel(run.stack?.email_platform)} sequence used — no AI-personalized intro generated.
          </p>
        )}
      </div>

      {/* ── DISPATCH CHANNELS ── */}
      <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-400">
          Dispatch Channels
        </span>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-b border-zinc-200 dark:border-zinc-800">
          {channels.map((ch) => {
            const Icon = ch.icon;
            return (
              <div key={ch.id} className="py-3.5 space-y-2">
                {/* Main Row */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={14} className="text-zinc-400 shrink-0" />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {ch.title}
                    </span>
                  </div>
                  <StatusPill tone={ch.tone} className="text-[10px]">
                    {ch.badge}
                  </StatusPill>
                </div>

                {/* Subtitle */}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {ch.subtitle}
                </p>

                {/* Metadata in tight, aligned grid */}
                <div className="grid grid-cols-[130px_1fr] gap-y-1 text-xs pt-1">
                  <span className="text-zinc-400">Platform</span>
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {ch.platform || "Not configured"}
                  </span>

                  {ch.step && (
                    <>
                      <span className="text-zinc-400">Last Attempt</span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {new Date(
                          ch.step.completedAt ?? ch.step.startedAt
                        ).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>

                {/* Failures Diagnostic */}
                {ch.step?.detail && ch.step.status === "failed" && (
                  <div className="pt-1 text-xs text-rose-500">
                    {(() => {
                      const diagnosis = classifyRunError(ch.step.detail);
                      return diagnosis ? (
                        <>
                          <span className="font-semibold block">
                            {diagnosis.title}
                          </span>
                          <span className="text-zinc-400">
                            {diagnosis.explanation}
                          </span>
                        </>
                      ) : (
                        <span>{ch.step.detail}</span>
                      );
                    })()}
                  </div>
                )}

                {/* SMS Detailed History */}
                {ch.type === "sms" && ch.messages && ch.messages.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">
                      Messages ({ch.messages.length})
                    </span>
                    {ch.messages.map((m, i) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800"
                      >
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Text #{i + 1} —{" "}
                          <span className="text-zinc-400 font-normal">
                            {new Date(m.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                        <StatusPill
                          tone={m.status === "sent" ? "success" : "danger"}
                          className="text-[9px]"
                        >
                          {m.status === "sent" ? "Sent" : "Failed"}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}