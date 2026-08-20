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
  AlertCircle,
  Maximize2,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emailPlatformLabel, smsPlatformLabel, adDataPlatformLabel, sentViaLabel, runStatusLabel } from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import { StatusPill } from "../_shared/status-pill";
import { EmptyState } from "../_shared/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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

// Updated FilledStatusPill with filled badges
function FilledStatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const styles = {
    success: "bg-emerald-500 text-white dark:text-zinc-950 font-bold",
    warning: "bg-amber-400 text-white dark:text-zinc-950 font-bold",
    danger: "bg-rose-500 text-white dark:text-zinc-950 font-bold",
    info: "bg-sky-500 text-white dark:text-zinc-950 font-bold",
    neutral: "bg-zinc-400 text-white dark:text-zinc-950 font-bold",
  }[tone];

  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-sans tracking-wide select-none shrink-0", styles)}>
      {children}
    </span>
  );
}

export function PileOnView({ detail, steps }: { detail: PileOnDetail; steps: RunStep[] }) {
  const { run, send, smsMessages } = detail;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeDrawerCard, setActiveDrawerCard] = useState<InspectableChannelCard | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Most recent step for a given phase — a phase can appear twice
  // (running, then success/failed), so this reads the resolved outcome
  // rather than an early "running" entry.
  const latestStepFor = (phase: string): RunStep | undefined => {
    const matches = steps.filter((s) => s.phase === phase);
    return matches[matches.length - 1];
  };

  const emailStep = latestStepFor("pile_on_enrollment");
  const adDataStep = latestStepFor("ad_data_cohort");
  const smsDispatchStep = latestStepFor("sms_enrollment");

  const smsSentCount = smsMessages.filter((m) => m.status === "sent").length;
  const smsFailedCount = smsMessages.filter((m) => m.status === "failed").length;

  // ── GRACEFUL FALLBACKS WHEN `send` (AI PERSONALIZATION LOG) IS NULL ──
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

  const channels = useMemo(() => {
    const cards: InspectableChannelCard[] = [];

    if (send) {
      cards.push({
        id: "ai-intro",
        type: "ai_intro",
        title: "AI Personalization",
        subtitle: send.personalizedIntro ?? (send.error ? `Didn't go out — ${classifyRunError(send.error)?.title ?? "hit an unexpected error"}` : "Standard template intro delivered"),
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
        subtitle: emailPlatformLabel(run.stack?.email_platform),
        badge: emailStep?.status === "success" ? "Enrolled" : emailStep?.status === "failed" ? "Failed" : "Pending",
        tone: emailStep?.status === "success" ? "success" : emailStep?.status === "failed" ? "danger" : "info",
        icon: Mail,
        payload: { platform: emailPlatformLabel(run.stack?.email_platform), raw: run.stack?.email_platform, step: emailStep },
      },
      {
        id: "sms-channel",
        type: "sms",
        title: "SMS Sequence",
        subtitle: !run.stack?.sms_platform || run.stack.sms_platform === "none" ? "Not configured" : smsPlatformLabel(run.stack.sms_platform),
        badge: !run.stack?.sms_platform || run.stack.sms_platform === "none" ? "Disabled" : smsSentCount > 0 ? `${smsSentCount} Sent` : "Scheduled",
        tone: !run.stack?.sms_platform || run.stack.sms_platform === "none" ? "neutral" : smsSentCount > 0 ? "success" : "info",
        icon: MessageSquare,
        payload: { platform: smsPlatformLabel(run.stack?.sms_platform), raw: run.stack?.sms_platform, messages: smsMessages, dispatchStep: smsDispatchStep },
      },
      {
        id: "ad-data-channel",
        type: "ad_data",
        title: "Ad Audience",
        subtitle: !run.stack?.ad_data_platform || run.stack.ad_data_platform === "none" ? "Not configured" : adDataPlatformLabel(run.stack?.ad_data_platform),
        badge: adDataStep?.status === "success" ? "Synced" : adDataStep?.status === "failed" ? "Failed" : "Pending",
        tone: adDataStep?.status === "success" ? "success" : adDataStep?.status === "failed" ? "danger" : "info",
        icon: BarChart3,
        payload: { platform: adDataPlatformLabel(run.stack?.ad_data_platform), raw: run.stack?.ad_data_platform, step: adDataStep },
      }
    );

    return cards;
  }, [send, run.stack, emailStep, adDataStep, smsDispatchStep, smsMessages, smsSentCount, smsFailedCount]);

  return (
    <div className="flex flex-col gap-4 font-sans antialiased">
      {/* Integrated Header - Prospect Info + Status */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold font-mono text-sm">
            {prospectEmail.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{prospectEmail}</h2>
              <button
                type="button"
                onClick={() => handleCopy(prospectEmail, "email")}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                title="Copy prospect email"
              >
                {copiedKey === "email" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
            <p className="text-xs text-zinc-500 font-mono">Booking {bookingId}</p>
          </div>
        </div>
        <FilledStatusPill tone={outcomeTone}>{outcomeLabel}</FilledStatusPill>
      </div>

      {/* Execution Flow - Horizontal Timeline */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
          Execution Flow
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500 flex items-center justify-center mb-1.5">
              <Zap size={16} className="text-white" />
            </div>
            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">Booking</p>
            <p className="text-[9px] text-zinc-500">Received</p>
          </div>
          <ChevronRight size={18} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
          <div className="flex-1 text-center">
            <div className={cn(
              "w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1.5",
              send?.sentVia === "hybrid" ? "bg-amber-400" : "bg-zinc-300 dark:bg-zinc-700"
            )}>
              <Sparkles size={16} className={send?.sentVia === "hybrid" ? "text-white" : "text-zinc-500 dark:text-zinc-400"} />
            </div>
            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">AI Personalization</p>
            <p className="text-[9px] text-zinc-500">{send?.sentVia === "hybrid" ? "Custom intro" : "Template"}</p>
          </div>
          <ChevronRight size={18} className="text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
          <div className="flex-1 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-sky-500 flex items-center justify-center mb-1.5">
              <ShieldCheck size={16} className="text-white" />
            </div>
            <p className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">Sequences</p>
            <p className="text-[9px] text-zinc-500">Email · SMS · Ads</p>
          </div>
        </div>
      </div>

      {/* AI Content - Clean Document Style */}
      {send?.personalizedIntro && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">AI Personalization Content</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(send.personalizedIntro!, "intro")}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              {copiedKey === "intro" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copiedKey === "intro" ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <div className="p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {send.personalizedIntro}
            </p>
          </div>
        </div>
      )}

      {/* Channels - Clean List */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ListChecks size={13} className="text-zinc-500" />
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Dispatch Channels</span>
          </div>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {channels.filter(c => c.type !== "ai_intro").map((channel) => {
            const Icon = channel.icon;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => setActiveDrawerCard(channel)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} className="text-zinc-400 group-hover:text-amber-400 transition-colors" />
                  <div>
                    <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{channel.title}</p>
                    <p className="text-[10px] text-zinc-500">{channel.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FilledStatusPill tone={channel.tone}>{channel.badge}</FilledStatusPill>
                  <ChevronRight size={14} className="text-zinc-400" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Note */}
      <p className="text-[10px] text-zinc-500 dark:text-zinc-500 px-1">
        Per-channel enrollment outcomes are logged as steps — see the Steps panel for exact success/failure details.
      </p>

      {/* Drawer */}
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

// ---------------------------------------------------------------------------
// ASANA TASK DETAIL DRAWER (STRICT FONT PERSISTENCE ON PORTAL ROOT)
// ---------------------------------------------------------------------------
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
      {/* Enforce font-sans antialiased text-zinc-900 dark:text-zinc-100 on portal root to fix font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-900 dark:text-zinc-100">
        {card && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-sans">
                    Pile-On
                  </span>
                </div>
                <FilledStatusPill tone={card.tone}>{card.badge}</FilledStatusPill>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold font-sans text-zinc-900 dark:text-white">{card.title}</SheetTitle>
              <SheetDescription className="text-xs text-zinc-600 dark:text-zinc-400 font-sans">{card.subtitle}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 pt-2 font-sans">
              {/* AI Intro Drawer Body */}
              {card.type === "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="flex justify-between items-center font-sans">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      AI-personalized intro
                    </span>
                    {card.payload.send.personalizedIntro && (
                      <button
                        type="button"
                        onClick={() => onCopy(card.payload.send.personalizedIntro, "drawer-intro")}
                        className="flex items-center gap-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer font-sans"
                      >
                        {copiedKey === "drawer-intro" ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                        <span className="font-sans">{copiedKey === "drawer-intro" ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>

                  {card.payload.send.personalizedIntro ? (
                    <div className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans">
                      {card.payload.send.personalizedIntro}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500 dark:text-zinc-500 font-sans">
                      This one went out with the standard template — a personalized intro wasn&apos;t generated for this send.
                    </p>
                  )}

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-3 text-xs text-zinc-700 dark:text-zinc-300 font-sans space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 dark:text-zinc-500">Recipient</span>
                      <span>{card.payload.send.prospectEmail}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Email / SMS / Ad Data Drawer Body */}
              {card.type !== "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 p-3.5 text-xs text-zinc-700 dark:text-zinc-300 font-sans space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500 dark:text-zinc-500">Connected platform</span>
                      <span>{card.subtitle}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-zinc-500 dark:text-zinc-500">Prospect</span>
                      <span>{send?.prospectEmail ?? "This booking"}</span>
                    </div>
                  </div>

                  {/* Detailed SMS Message History */}
                  {card.type === "sms" && card.payload.messages?.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        Send history ({card.payload.messages.length})
                      </span>
                      {card.payload.messages.map((m: SequenceMessage, i: number) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3 text-xs space-y-1 font-sans"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-700 dark:text-zinc-300 font-semibold">Text message {i + 1}</span>
                            <FilledStatusPill tone={m.status === "sent" ? "success" : "danger"}>
                              {m.status === "sent" ? "Sent" : "Failed"}
                            </FilledStatusPill>
                          </div>
                          <p className="text-zinc-500 dark:text-zinc-500">{new Date(m.sentAt).toLocaleString()}</p>
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
                  ) : card.type === "sms" ? (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans bg-white/40 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
                      No individual messages have sent yet — they go out on the schedule set for this booking, each logged here the moment it sends.
                    </p>
                  ) : (card.type === "email" || card.type === "ad_data") && card.payload.step ? (
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/40 p-3.5 text-xs text-zinc-700 dark:text-zinc-300 space-y-1.5 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 dark:text-zinc-500">Last attempt</span>
                        <FilledStatusPill
                          tone={card.payload.step.status === "success" ? "success" : card.payload.step.status === "failed" ? "danger" : "info"}
                        >
                          {runStatusLabel(card.payload.step.status)}
                        </FilledStatusPill>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-500">{new Date(card.payload.step.completedAt ?? card.payload.step.startedAt).toLocaleString()}</p>
                      {card.payload.step.detail && card.payload.step.status === "failed" ? (() => {
                        const diagnosis = classifyRunError(card.payload.step.detail);
                        return diagnosis ? (
                          <div className="pt-1">
                            <p className="text-zinc-700 dark:text-zinc-300 font-semibold">{diagnosis.title}</p>
                            <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">{diagnosis.explanation}</p>
                          </div>
                        ) : (
                          <p className="text-zinc-600 dark:text-zinc-400 pt-1">This didn&apos;t go out — it hit an unexpected error.</p>
                        );
                      })() : card.payload.step.detail ? (
                        <p className="text-zinc-600 dark:text-zinc-400 pt-1">{card.payload.step.detail}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans bg-white/40 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl">
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