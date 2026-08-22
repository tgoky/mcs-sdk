"use client";

import { useMemo, useState } from "react";
import {
  Mail,
  MessageSquare,
  BarChart3,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  emailPlatformLabel,
  smsPlatformLabel,
  adDataPlatformLabel,
} from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import type { PileOnDetail, SequenceMessage } from "../_shared/types";
import type { RunStep } from "@/models/schema";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

function HighContrastBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  const styles: Record<Tone, string> = {
    success:
      "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/40 dark:bg-emerald-500/25",
    danger:
      "bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/40 dark:bg-rose-500/25",
    warning:
      "bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40 dark:bg-amber-500/25",
    info: "bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/40 dark:bg-sky-500/25",
    neutral:
      "bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function PileOnView({
  detail,
  steps,
}: {
  detail: PileOnDetail;
  steps: RunStep[];
}) {
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

  // Fix: this was matching against `.detail` ("Enrolled Prospect in
  // pre-call sequence" — never contains an email), when the actual
  // "Name <email>" pair is written to `.label` on the very first step of
  // every pile-on run (enrollment-service.ts logs it before attempting
  // enrollment, so it's there even on a run that failed immediately and
  // never got as far as writing a pile_on_sends row). That mismatch is
  // why the card fell back to "Booking Dispatch" with zero prospect info
  // even on runs that had a perfectly good name/email the whole time.
  const enrollmentStep = steps.find((s) => s.phase === "pile_on_enrollment" && s.label?.includes("<"));
  const labelMatch = enrollmentStep?.label?.match(/^(.*?)\s*<([^>]+@[^>]+)>$/);

  const rawProspectEmail = send?.prospectEmail ?? labelMatch?.[2];
  const prospectName = labelMatch?.[1] && labelMatch[1] !== "Prospect" ? labelMatch[1] : null;

  const prospectEmail =
    rawProspectEmail && rawProspectEmail !== "Enrolled Prospect"
      ? rawProspectEmail
      : null;

  const rawBookingId = send?.bookingId;
  const bookingId =
    rawBookingId && rawBookingId !== "null" && rawBookingId !== "—"
      ? rawBookingId
      : null;

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

  const buildSentenceSummary = () => {
    if (send?.error) {
      return `Run hit an execution error while attempting to personalize follow-ups for ${
        prospectEmail ?? "this booking"
      }.`;
    }
    if (send?.sentVia === "hybrid") {
      return `AI-personalized intro was written and delivered. Email sequence enrolled via ${emailPlatformLabel(
        run.stack?.email_platform
      )} and SMS dispatch triggered.`;
    }
    return `Standard template dispatched. Email sequence enrolled via ${emailPlatformLabel(
      run.stack?.email_platform
    )} without custom AI intro generation.`;
  };

  const channels = useMemo(() => {
    return [
      {
        id: "email-channel",
        type: "email" as const,
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
        tone: (emailStep?.status === "success"
          ? "success"
          : emailStep?.status === "failed"
          ? "danger"
          : emailStep?.status === "running"
          ? "info"
          : "neutral") as Tone,
        icon: Mail,
        platform: emailPlatformLabel(run.stack?.email_platform),
        step: emailStep,
      },
      {
        id: "sms-channel",
        type: "sms" as const,
        title: "SMS Sequence",
        subtitle:
          !run.stack?.sms_platform || run.stack.sms_platform === "none"
            ? "Not configured"
            : smsMessages.length > 0
            ? `${smsSentCount} sent${
                smsFailedCount > 0 ? `, ${smsFailedCount} failed` : ""
              } of ${smsMessages.length} attempted`
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
        tone: (!run.stack?.sms_platform || run.stack.sms_platform === "none"
          ? "neutral"
          : smsFailedCount > 0 && smsSentCount === 0
          ? "danger"
          : smsFailedCount > 0
          ? "warning"
          : smsSentCount > 0
          ? "success"
          : smsDispatchStep?.status === "failed"
          ? "danger"
          : "info") as Tone,
        icon: MessageSquare,
        platform: smsPlatformLabel(run.stack?.sms_platform),
        step: smsDispatchStep,
        messages: smsMessages,
      },
      {
        id: "ad-data-channel",
        type: "ad_data" as const,
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
        tone: (adDataStep?.status === "success"
          ? "success"
          : adDataStep?.status === "failed"
          ? "danger"
          : adDataStep?.status === "running"
          ? "info"
          : "neutral") as Tone,
        icon: BarChart3,
        platform: adDataPlatformLabel(run.stack?.ad_data_platform),
        step: adDataStep,
      },
    ];
  }, [
    run.stack,
    emailStep,
    adDataStep,
    smsDispatchStep,
    smsMessages,
    smsSentCount,
    smsFailedCount,
  ]);

  return (
    <div className="w-full space-y-5 font-sans antialiased text-zinc-900 dark:text-zinc-100">
      {/* ── 1. PROSPECT HEADER CARD ── */}
      {/* Fix: this used to have a border-l-4 colored accent bar (green on
          success) purely for decoration — the same status is already
          stated in words by the badge two lines down, so the bar added
          no information, just an "AI slop" visual flourish. Dropped. */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SquishySkillBadge
              skill="pile-on"
              size={32}
              enabled={outcomeTone === "success" || outcomeTone === "info"}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-zinc-900 dark:text-white">
                  {prospectName ??
                    prospectEmail ??
                    (bookingId ? `Booking #${bookingId}` : "Booking Dispatch")}
                </span>
                {prospectEmail && (
                  <button
                    type="button"
                    onClick={() => handleCopy(prospectEmail, "email")}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                    title="Copy email"
                  >
                    {copiedKey === "email" ? (
                      <Check size={13} className="text-emerald-500" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                )}
              </div>
              {prospectEmail && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  {prospectEmail}
                  {bookingId && <span className="text-zinc-400 dark:text-zinc-600"> · Booking #{bookingId}</span>}
                </p>
              )}
              {!prospectEmail && bookingId && (
                <p className="text-xs text-zinc-500 font-mono">
                  Booking #{bookingId}
                </p>
              )}
            </div>
          </div>

          <HighContrastBadge tone={outcomeTone}>
            {outcomeLabel}
          </HighContrastBadge>
        </div>

        {/* ── 2. CONVERSATIONAL SUMMARY BANNER ── */}
        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800/80 pt-2.5">
          {buildSentenceSummary()}
        </p>
      </div>

      {/* ── 3. EXECUTION STEPS BREADCRUMBS ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400">
        <span className="text-zinc-800 dark:text-zinc-200">
          Booking Received
        </span>
        <span className="text-zinc-300 dark:text-zinc-700 font-normal">•</span>
        <span className="text-zinc-800 dark:text-zinc-200">
          AI Personalization (
          {send?.sentVia === "hybrid" ? "Personalized" : "Standard"})
        </span>
        <span className="text-zinc-300 dark:text-zinc-700 font-normal">•</span>
        <span className="text-zinc-800 dark:text-zinc-200">
          Sequences Triggered
        </span>
      </div>

      {/* ── 4. AI PERSONALIZATION CONTENT ── */}
      <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            AI Personalization Content
          </span>
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
          <p className="whitespace-pre-wrap pl-3 border-l-2 border-amber-400 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
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
            Standard {emailPlatformLabel(run.stack?.email_platform)} sequence used
            — no AI-personalized intro generated.
          </p>
        )}
      </div>

      {/* ── 5. DISPATCH CHANNELS ── */}
      <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Dispatch Channels
        </span>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border-t border-b border-zinc-200 dark:border-zinc-800">
          {channels.map((ch) => {
            const Icon = ch.icon;
            const isEnabled = ch.tone !== "neutral" && ch.tone !== "danger";
            return (
              <div key={ch.id} className="py-3.5 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon size={15} className="text-zinc-400 shrink-0" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {ch.title}
                    </span>
                    <SquishySkillBadge
                      skill="pile-on"
                      size={20}
                      enabled={isEnabled}
                      count={
                        ch.type === "sms" && smsSentCount > 0
                          ? smsSentCount
                          : undefined
                      }
                    />
                  </div>
                  <HighContrastBadge tone={ch.tone}>
                    {ch.badge}
                  </HighContrastBadge>
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {ch.subtitle}
                </p>

                <div className="grid grid-cols-[130px_1fr] gap-y-1 text-xs pt-1">
                  <span className="text-zinc-400">Platform</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                    {ch.platform || "Not configured"}
                  </span>

                  {ch.step && (
                    <>
                      <span className="text-zinc-400">Last Attempt</span>
                      <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                        {new Date(
                          ch.step.completedAt ?? ch.step.startedAt
                        ).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>

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
                        className="flex items-center justify-between text-xs py-1.5 px-3 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800"
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
                        <HighContrastBadge
                          tone={m.status === "sent" ? "success" : "danger"}
                        >
                          {m.status === "sent" ? "Sent" : "Failed"}
                        </HighContrastBadge>
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