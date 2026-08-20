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
  ChevronRight,
  SlidersHorizontal,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { PileOnDetail, SequenceMessage } from "../_shared/types";
import type { RunStep } from "@/models/schema";

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

interface InspectableChannelCard {
  id: string;
  type: "ai_intro" | "email" | "sms" | "ad_data";
  title: string;
  subtitle: string;
  badge: string;
  tone: Tone;
  icon: React.ElementType;
  payload: any;
}

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
  const [activeDrawerCard, setActiveDrawerCard] = useState<InspectableChannelCard | null>(null);

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

  const prospectEmail =
    send?.prospectEmail ??
    steps
      .find((s) => s.phase === "pile_on_enrollment" && s.detail?.includes("@"))
      ?.detail?.match(/<([^>]+@[^>]+)>/)?.[1] ??
    "Enrolled Prospect";

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

  const channelCards = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    const cards: InspectableChannelCard[] = [];

    if (send) {
      cards.push({
        id: "ai-intro",
        type: "ai_intro",
        title: "AI Personalization",
        subtitle:
          send.personalizedIntro ??
          (send.error
            ? `Didn't go out — ${classifyRunError(send.error)?.title ?? "hit an unexpected error"}`
            : "Standard template intro delivered"),
        badge: sentViaLabel(send.sentVia),
        tone: send.sentVia === "hybrid" ? "success" : "info",
        icon: Sparkles,
        payload: { send },
      });
    }

    cards.push(
      {
        id: "email-channel",
        type: "email",
        title: "Email Sequence",
        subtitle: emailStep
          ? emailStep.detail ?? emailPlatformLabel(run.stack?.email_platform)
          : run.stack?.email_platform
          ? `${emailPlatformLabel(run.stack.email_platform)} — wasn't attempted`
          : "Not configured",
        badge:
          emailStep?.status === "success"
            ? "Enrolled"
            : emailStep?.status === "failed"
            ? "Failed"
            : emailStep?.status === "running"
            ? "In progress"
            : "Not attempted",
        tone:
          emailStep?.status === "success"
            ? "success"
            : emailStep?.status === "failed"
            ? "danger"
            : emailStep?.status === "running"
            ? "info"
            : "neutral",
        icon: Mail,
        payload: {
          platform: emailPlatformLabel(run.stack?.email_platform),
          raw: run.stack?.email_platform,
          step: emailStep,
        },
      },
      {
        id: "sms-channel",
        type: "sms",
        title: "SMS Sequence",
        subtitle:
          !run.stack?.sms_platform || run.stack.sms_platform === "none"
            ? "Not configured"
            : smsMessages.length > 0
            ? `${smsSentCount} sent${smsFailedCount > 0 ? `, ${smsFailedCount} failed` : ""} of ${smsMessages.length} attempted`
            : smsDispatchStep?.status === "success"
            ? "Dispatched — waiting on scheduled times"
            : smsDispatchStep?.status === "failed"
            ? smsDispatchStep.detail ?? "Sequence failed to start"
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
        payload: {
          platform: smsPlatformLabel(run.stack?.sms_platform),
          raw: run.stack?.sms_platform,
          messages: smsMessages,
          dispatchStep: smsDispatchStep,
        },
      },
      {
        id: "ad-data-channel",
        type: "ad_data",
        title: "Ad Audience Update",
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
            ? "In progress"
            : "Not attempted",
        tone:
          adDataStep?.status === "success"
            ? "success"
            : adDataStep?.status === "failed"
            ? "danger"
            : adDataStep?.status === "running"
            ? "info"
            : "neutral",
        icon: BarChart3,
        payload: {
          platform: adDataPlatformLabel(run.stack?.ad_data_platform),
          raw: run.stack?.ad_data_platform,
          step: adDataStep,
        },
      }
    );

    return cards.filter(
      (card) =>
        !q ||
        card.title.toLowerCase().includes(q) ||
        card.subtitle.toLowerCase().includes(q)
    );
  }, [
    send,
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
    <div className="max-w-3xl mx-auto py-2 space-y-6 font-sans antialiased text-zinc-900 dark:text-zinc-100">
      {/* 1. Header & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              {prospectEmail}
            </h2>
            <button
              type="button"
              onClick={() => handleCopy(prospectEmail, "email")}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              title="Copy prospect email"
            >
              {copiedKey === "email" ? (
                <Check size={13} className="text-emerald-500" />
              ) : (
                <Copy size={13} />
              )}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
            <span>Booking #{bookingId}</span>
            {send && (
              <button
                type="button"
                onClick={() => handleCopy(send.bookingId, "bookingId")}
                className="hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                {copiedKey === "bookingId" ? (
                  <Check size={11} className="text-emerald-500 inline" />
                ) : (
                  <Copy size={11} className="inline" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
          <div className="relative w-40 sm:w-48">
            <Search
              size={13}
              className="absolute left-2.5 top-2.5 text-zinc-400"
            />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter channels..."
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent py-1 pl-8 pr-2.5 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
            />
          </div>
        </div>
      </div>

      {/* 2. Execution Flow Steps */}
      <div className="py-1">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
          Execution Flow
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-xs">
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <Zap size={14} className="text-emerald-500 shrink-0" />
            <span>1. Booking Received</span>
          </div>
          <ChevronRight size={12} className="hidden sm:block text-zinc-300 dark:text-zinc-700" />
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <Sparkles
              size={14}
              className={cn(
                "shrink-0",
                send?.sentVia === "hybrid" ? "text-amber-500" : "text-zinc-400"
              )}
            />
            <span>
              2. AI Personalization (
              {send?.sentVia === "hybrid" ? "Personalized" : "Standard"})
            </span>
          </div>
          <ChevronRight size={12} className="hidden sm:block text-zinc-300 dark:text-zinc-700" />
          <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
            <ShieldCheck size={14} className="text-sky-500 shrink-0" />
            <span>3. Follow-Up Dispatch</span>
          </div>
        </div>
      </div>

      {/* 3. AI Personalization Text Stream */}
      <div className="py-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            AI Personalization Output
          </p>
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
          <div className="pl-3.5 border-l-2 border-amber-500/70 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap py-0.5">
            {send.personalizedIntro}
          </div>
        ) : send?.error ? (
          (() => {
            const diagnosis = classifyRunError(send.error);
            return (
              <div className="flex items-start gap-2 text-xs text-rose-500 pl-3.5 border-l-2 border-rose-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">
                    {diagnosis?.title ?? "Execution Error"}
                  </span>
                  <span>
                    {diagnosis?.explanation ??
                      "This didn't go out due to an unexpected error."}
                  </span>
                </div>
              </div>
            );
          })()
        ) : (
          <p className="text-xs italic text-zinc-400 dark:text-zinc-500 pl-3.5 border-l-2 border-zinc-200 dark:border-zinc-800">
            Standard {emailPlatformLabel(run.stack?.email_platform)} sequence used — no AI-personalized intro generated.
          </p>
        )}
      </div>

      {/* 4. Minimal Vertical Channel Dispatch List */}
      <div className="pt-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
          Dispatch Channels
        </p>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 border-t border-b border-zinc-200 dark:border-zinc-800">
          {channelCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveDrawerCard(card)}
                className="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <Icon
                    size={15}
                    className="text-zinc-400 group-hover:text-amber-500 transition-colors shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      {card.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {card.subtitle}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusPill tone={card.tone} className="text-[10px]">
                    {card.badge}
                  </StatusPill>
                  <ChevronRight
                    size={14}
                    className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 transition-colors"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Minimal Configured Stack Summary Footer */}
      <div className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Configured Stack:
        </span>
        <div className="flex items-center gap-1.5">
          <Mail size={12} className="text-zinc-400" />
          <span>{emailPlatformLabel(run.stack?.email_platform)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquare size={12} className="text-zinc-400" />
          <span>
            {run.stack?.sms_platform && run.stack.sms_platform !== "none"
              ? smsPlatformLabel(run.stack.sms_platform)
              : "SMS Disabled"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <BarChart3 size={12} className="text-zinc-400" />
          <span>
            {run.stack?.ad_data_platform && run.stack.ad_data_platform !== "none"
              ? adDataPlatformLabel(run.stack.ad_data_platform)
              : "Ad Sync Disabled"}
          </span>
        </div>
      </div>

      {/* Slide-Over Drawer for Item Inspection */}
      <PileOnDetailDrawer
        card={activeDrawerCard}
        send={send}
        onClose={() => setActiveDrawerCard(null)}
        onCopy={handleCopy}
        copiedKey={copiedKey}
      />
    </div>
  );
}

function PileOnDetailDrawer({
  card,
  send,
  onClose,
  onCopy,
  copiedKey,
}: {
  card: InspectableChannelCard | null;
  send: PileOnDetail["send"];
  onClose: () => void;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
}) {
  return (
    <Sheet open={!!card} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-900 dark:text-zinc-100">
        {card && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-500 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 font-sans">
                    Pile-On Detail
                  </span>
                </div>
                <StatusPill tone={card.tone}>{card.badge}</StatusPill>
              </div>

              <SheetTitle className="mt-2 text-base font-bold font-sans text-zinc-900 dark:text-white">
                {card.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">
                {card.subtitle}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 pt-2 font-sans">
              {card.type === "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="flex justify-between items-center font-sans">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      AI-personalized intro
                    </span>
                    {card.payload.send.personalizedIntro && (
                      <button
                        type="button"
                        onClick={() =>
                          onCopy(
                            card.payload.send.personalizedIntro,
                            "drawer-intro"
                          )
                        }
                        className="flex items-center gap-1 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        {copiedKey === "drawer-intro" ? (
                          <Check size={12} className="text-emerald-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                        <span>
                          {copiedKey === "drawer-intro" ? "Copied" : "Copy"}
                        </span>
                      </button>
                    )}
                  </div>

                  {card.payload.send.personalizedIntro ? (
                    <div className="whitespace-pre-wrap rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans">
                      {card.payload.send.personalizedIntro}
                    </div>
                  ) : (
                    <p className="text-xs italic text-zinc-500 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800 py-1">
                      Standard template used — no personalized intro generated.
                    </p>
                  )}

                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                    <span className="text-zinc-400">Recipient</span>
                    <span>{card.payload.send.prospectEmail}</span>
                  </div>
                </div>
              )}

              {card.type !== "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Connected platform</span>
                      <span>{card.subtitle}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Prospect</span>
                      <span>{send?.prospectEmail ?? "This booking"}</span>
                    </div>
                  </div>

                  {card.type === "sms" && card.payload.messages?.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        Send history ({card.payload.messages.length})
                      </span>
                      {card.payload.messages.map(
                        (m: SequenceMessage, i: number) => (
                          <div
                            key={m.id}
                            className="border-b border-zinc-100 dark:border-zinc-800 pb-2 text-xs space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                Message #{i + 1}
                              </span>
                              <StatusPill
                                tone={m.status === "sent" ? "success" : "danger"}
                              >
                                {m.status === "sent" ? "Sent" : "Failed"}
                              </StatusPill>
                            </div>
                            <p className="text-zinc-400 text-[11px]">
                              {new Date(m.sentAt).toLocaleString()}
                            </p>
                            {m.error && (() => {
                              const diagnosis = classifyRunError(m.error);
                              return (
                                <p className="text-rose-500 text-[11px]">
                                  {diagnosis?.title ?? "Delivery failed."}
                                </p>
                              );
                            })()}
                          </div>
                        )
                      )}
                    </div>
                  ) : card.type === "sms" ? (
                    <p className="text-xs text-zinc-500 italic py-2">
                      No individual messages have sent yet — scheduled messages will appear here upon dispatch.
                    </p>
                  ) : (card.type === "email" || card.type === "ad_data") &&
                    card.payload.step ? (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 py-1 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">Last attempt</span>
                        <StatusPill
                          tone={
                            card.payload.step.status === "success"
                              ? "success"
                              : card.payload.step.status === "failed"
                              ? "danger"
                              : "info"
                          }
                        >
                          {runStatusLabel(card.payload.step.status)}
                        </StatusPill>
                      </div>
                      <p className="text-zinc-400 text-[11px]">
                        {new Date(
                          card.payload.step.completedAt ??
                            card.payload.step.startedAt
                        ).toLocaleString()}
                      </p>
                      {card.payload.step.detail &&
                      card.payload.step.status === "failed" ? (
                        (() => {
                          const diagnosis = classifyRunError(
                            card.payload.step.detail
                          );
                          return (
                            <div className="pt-1">
                              <p className="text-rose-500 font-medium">
                                {diagnosis?.title ?? "Execution error"}
                              </p>
                              <p className="text-zinc-500 text-[11px]">
                                {diagnosis?.explanation ??
                                  card.payload.step.detail}
                              </p>
                            </div>
                          );
                        })()
                      ) : card.payload.step.detail ? (
                        <p className="text-zinc-500 pt-1">
                          {card.payload.step.detail}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic py-2">
                      Nothing has been attempted on this channel for this run yet.
                    </p>
                  )}
                </div>
              )}
            </SheetBody>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}