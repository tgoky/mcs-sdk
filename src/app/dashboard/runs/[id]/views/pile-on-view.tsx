"use client";

import { useState } from "react";
import {
  Sparkles,
  Mail,
  MessageSquare,
  BarChart3,
  Copy,
  Check,
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
    ? "Standard sequence enrolled"
    : emailStep?.status === "failed"
    ? "Enrollment failed"
    : "Standard template used";

  const channels: {
    icon: React.ElementType;
    label: string;
    platform: string;
    badge: string;
    tone: Tone;
    step: RunStep | undefined;
    messages?: SequenceMessage[];
  }[] = [
    {
      icon: Mail,
      label: "Email",
      platform: emailPlatformLabel(run.stack?.email_platform),
      badge: emailStep?.status === "success" ? "Enrolled" : emailStep?.status === "failed" ? "Failed" : emailStep?.status === "running" ? "In progress" : "Not attempted",
      tone: emailStep?.status === "success" ? "success" : emailStep?.status === "failed" ? "danger" : emailStep?.status === "running" ? "info" : "neutral",
      step: emailStep,
    },
    {
      icon: MessageSquare,
      label: "SMS",
      platform: run.stack?.sms_platform && run.stack.sms_platform !== "none" ? smsPlatformLabel(run.stack.sms_platform) : "Not configured",
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
      step: smsDispatchStep,
      messages: smsMessages,
    },
    {
      icon: BarChart3,
      label: "Ad audience",
      platform: run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none" ? adDataPlatformLabel(run.stack.ad_data_platform) : "Not configured",
      badge: adDataStep?.status === "success" ? "Synced" : adDataStep?.status === "failed" ? "Failed" : adDataStep?.status === "running" ? "In progress" : "Not attempted",
      tone: adDataStep?.status === "success" ? "success" : adDataStep?.status === "failed" ? "danger" : adDataStep?.status === "running" ? "info" : "neutral",
      step: adDataStep,
    },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans antialiased">
      {/* Prospect + outcome — one flat line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-[300px]">
          {prospectEmail}
        </span>
        <button
          type="button"
          onClick={() => handleCopy(prospectEmail, "email")}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
          title="Copy email"
        >
          {copiedKey === "email" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-500">
          Booking {bookingId}
        </span>
        <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
      </div>

      {/* AI Personalization */}
      {send && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                {send.personalizedIntro ? "Personalized intro" : "AI personalization"}
              </span>
              {send.sentVia && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                  via {sentViaLabel(send.sentVia)}
                </span>
              )}
            </div>
            {send.personalizedIntro && (
              <button
                type="button"
                onClick={() => handleCopy(send.personalizedIntro!, "intro")}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {copiedKey === "intro" ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copiedKey === "intro" ? "Copied" : "Copy"}
              </button>
            )}
          </div>

          {send.personalizedIntro ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 pl-5">
              {send.personalizedIntro}
            </p>
          ) : send.error ? (() => {
            const diagnosis = classifyRunError(send.error);
            return (
              <div className="flex items-start gap-1.5 text-xs text-rose-500 pl-5">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {diagnosis ? (
                  <div>
                    <span className="font-semibold">{diagnosis.title}</span>
                    <span className="ml-1">{diagnosis.explanation}</span>
                  </div>
                ) : (
                  <span>Didn&apos;t go out — hit an unexpected error.</span>
                )}
              </div>
            );
          })() : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500 pl-5">
              Standard template used — no personalized intro generated.
            </p>
          )}
        </div>
      )}

      {/* Channel dispatch — flat rows with all drawer detail inline */}
      <div>
        <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 mb-2">
          Channel dispatch
        </span>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60 border-t border-b border-zinc-200 dark:border-zinc-800/60">
          {channels.map((ch) => {
            const Icon = ch.icon;
            const stepDiagnosis = ch.step?.detail && ch.step.status === "failed"
              ? classifyRunError(ch.step.detail)
              : null;

            return (
              <div key={ch.label} className="py-2.5 first:pt-3 last:pb-3">
                {/* Top row: icon, label, platform, pill */}
                <div className="flex items-start gap-3">
                  <Icon size={13} className="text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {ch.label}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                        {ch.platform}
                      </span>
                    </div>
                  </div>
                  <StatusPill tone={ch.tone} className="shrink-0">
                    {ch.badge}
                  </StatusPill>
                </div>

                {/* Detail block — only renders when there's something to show */}
                {(ch.step || (ch.messages && ch.messages.length > 0)) && (
                  <div className="mt-2 ml-[21px] pl-3 border-l border-zinc-200 dark:border-zinc-800/60 space-y-1.5">
                    {/* Step timestamp + resolved status */}
                    {ch.step && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-zinc-400 dark:text-zinc-500">
                          {new Date(ch.step.completedAt ?? ch.step.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <StatusPill
                          tone={ch.step.status === "success" ? "success" : ch.step.status === "failed" ? "danger" : "info"}
                        >
                          {runStatusLabel(ch.step.status)}
                        </StatusPill>
                      </div>
                    )}

                    {/* Error diagnosis from step */}
                    {stepDiagnosis && (
                      <div className="text-[11px]">
                        <span className="font-semibold text-rose-500">{stepDiagnosis.title}</span>
                        <span className="text-zinc-500 dark:text-zinc-400 ml-1">{stepDiagnosis.explanation}</span>
                      </div>
                    )}

                    {/* Non-classified step detail (success info, etc.) */}
                    {ch.step?.detail && !stepDiagnosis && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {ch.step.detail}
                      </p>
                    )}

                    {/* SMS individual message history */}
                    {ch.messages && ch.messages.length > 0 && (
                      <div className="space-y-1 pt-0.5">
                        {ch.messages.map((m, i) => {
                          const msgDiagnosis = m.error ? classifyRunError(m.error) : null;
                          return (
                            <div key={m.id} className="flex items-center gap-2 text-[11px]">
                              <span className="font-mono text-zinc-500 dark:text-zinc-500">
                                {new Date(m.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <StatusPill tone={m.status === "sent" ? "success" : "danger"}>
                                {m.status === "sent" ? "Sent" : "Failed"}
                              </StatusPill>
                              {msgDiagnosis && (
                                <span className="text-rose-500">{msgDiagnosis.title}</span>
                              )}
                              {!msgDiagnosis && m.error && (
                                <span className="text-rose-500">Error</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* SMS scheduled but no messages yet */}
                    {ch.label === "SMS" && (!ch.messages || ch.messages.length === 0) && ch.tone !== "neutral" && ch.tone !== "danger" && (
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
                        Messages will send on schedule — nothing dispatched yet.
                      </p>
                    )}
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