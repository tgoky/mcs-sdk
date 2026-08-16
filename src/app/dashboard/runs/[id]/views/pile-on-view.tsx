"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  Zap,
  Mail,
  MessageSquare,
  BarChart3,
  User,
  ListChecks,
  Copy,
  Check,
  ShieldCheck,
  Search,
  AlertCircle,
  Maximize2,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { emailPlatformLabel, smsPlatformLabel, adDataPlatformLabel, sentViaLabel, runStatusLabel } from "@/lib/copy";
import { classifyRunError } from "@/lib/error-classification";
import { ViewSwitcher, type RunViewMode } from "../_shared/view-switcher";
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

export function PileOnView({ detail, steps }: { detail: PileOnDetail; steps: RunStep[] }) {
  const { run, send, smsMessages } = detail;
  const [mode, setMode] = useState<RunViewMode>("calendar");
  const [filterText, setFilterText] = useState("");
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

  // Unroll individual dispatch channels into inspectable Asana-grade cards
  const boardColumns = useMemo(() => {
    const q = filterText.toLowerCase().trim();

    const cards: InspectableChannelCard[] = [];

    // Only add AI Intro card if AI personalization actually ran
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

    // ALWAYS add Email, SMS, and Ad channels regardless of AI send status
    cards.push(
      {
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
        payload: { platform: emailPlatformLabel(run.stack?.email_platform), raw: run.stack?.email_platform, step: emailStep },
      },
      {
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
        payload: { platform: smsPlatformLabel(run.stack?.sms_platform), raw: run.stack?.sms_platform, messages: smsMessages, dispatchStep: smsDispatchStep },
      },
      {
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
        payload: { platform: adDataPlatformLabel(run.stack?.ad_data_platform), raw: run.stack?.ad_data_platform, step: adDataStep },
      }
    );

    const filterFn = (card: InspectableChannelCard) =>
      !q || card.title.toLowerCase().includes(q) || card.subtitle.toLowerCase().includes(q);

    const filtered = cards.filter(filterFn);

    return [
      { id: "ai", title: "1. AI Personalization", cards: filtered.filter((c) => c.type === "ai_intro") },
      { id: "messaging", title: "2. Messaging Channels", cards: filtered.filter((c) => c.type === "email" || c.type === "sms") },
      { id: "attribution", title: "3. Ad Attribution", cards: filtered.filter((c) => c.type === "ad_data") },
    ];
  }, [send, run.stack, filterText, emailStep, adDataStep, smsDispatchStep, smsMessages, smsSentCount, smsFailedCount]);

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA PERSISTENT TOOLBAR                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-950 p-1.5 border border-zinc-800 font-sans">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-500" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search prospect or channel..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 font-sans placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none"
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-xl font-sans">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 shrink-0 font-bold font-mono text-xs">
                {prospectEmail.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white font-sans">{prospectEmail}</p>
                  <button
                    type="button"
                    onClick={() => handleCopy(prospectEmail, "email")}
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
                  <span>Booking {bookingId}</span>
                  {send && (
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
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 font-sans">
              <StatusPill tone={outcomeTone}>{outcomeLabel}</StatusPill>
            </div>
          </div>

          {/* Speed-to-Lead Execution Flow Pipeline */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans">
            <h3 className="mb-2.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
              Instant Speed-To-Lead Execution Flow
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-sans">
              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <Zap size={14} className="text-emerald-400 shrink-0" />
                <div className="min-w-0 text-xs font-sans">
                  <p className="font-semibold text-zinc-200 font-sans">1. Booking Received</p>
                  <p className="text-[10px] text-zinc-500 font-sans">Confirmed instantly</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <Sparkles
                  size={14}
                  className={cn(
                    "shrink-0",
                    send?.sentVia === "hybrid" ? "text-amber-400" : "text-zinc-500"
                  )}
                />
                <div className="min-w-0 text-xs font-sans">
                  <p className="font-semibold text-zinc-200 font-sans">2. AI Personalization</p>
                  <p className="text-[10px] text-zinc-500 font-sans">
                    {send?.sentVia === "hybrid" ? "Personalized intro written" : "Standard template used"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <ShieldCheck size={14} className="text-sky-400 shrink-0" />
                <div className="min-w-0 text-xs font-sans">
                  <p className="font-semibold text-zinc-200 font-sans">3. Follow-Up Sequences</p>
                  <p className="text-[10px] text-zinc-500 font-sans">Email, text & ad audience updated</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Personalization Preview Block */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans">
            <div className="mb-2 flex items-center justify-between font-sans">
              <div className="flex items-center gap-2 font-sans">
                <Sparkles size={14} className="text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300 font-sans">
                  AI Personalization Content
                </h3>
              </div>
              {send?.personalizedIntro && (
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

            {send?.personalizedIntro ? (
              <p className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-200 font-sans">
                {send.personalizedIntro}
              </p>
            ) : send?.error ? (() => {
              const diagnosis = classifyRunError(send.error);
              return (
                <div className="rounded-xl border border-rose-900/40 bg-rose-950/10 p-3.5 text-xs text-rose-400 flex items-start gap-2 font-sans">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {diagnosis ? (
                    <div>
                      <span className="font-semibold block">{diagnosis.title}</span>
                      <span className="font-sans">{diagnosis.explanation}</span>
                    </div>
                  ) : (
                    <span className="font-sans">This didn&apos;t go out — it hit an unexpected error. If it keeps happening, let your account contact know.</span>
                  )}
                </div>
              );
            })() : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500 font-sans">
                This prospect got your standard {emailPlatformLabel(run.stack?.email_platform)} sequence — no AI-personalized intro was generated for this send.
              </p>
            )}
          </div>
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. DENSE LIST VIEW (INSPECTABLE ROWS)                             */}
      {/* ----------------------------------------------------------------- */}
      {mode === "list" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 font-sans">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-zinc-800/60 text-[10px] uppercase text-zinc-500 bg-zinc-900/50 font-sans">
                <th className="px-4 py-2 font-semibold">Step</th>
                <th className="px-4 py-2 font-semibold">Platform</th>
                <th className="px-4 py-2 font-semibold">Prospect</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {boardColumns.flatMap((col) =>
                col.cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <tr
                      key={card.id}
                      className="border-b border-zinc-900 last:border-b-0 hover:bg-zinc-900/40 font-sans cursor-pointer transition-colors"
                      onClick={() => setActiveDrawerCard(card)}
                    >
                      <td className="px-4 py-2.5 font-medium text-white flex items-center gap-2 font-sans">
                        <Icon size={12} className="text-zinc-400 shrink-0" />
                        {card.title}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-zinc-300 truncate max-w-xs">{card.subtitle}</td>
                      <td className="px-4 py-2.5 text-zinc-400 font-mono">{prospectEmail}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone={card.tone}>{card.badge}</StatusPill>
                      </td>
                      <td className="px-4 py-2.5 text-right font-sans">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDrawerCard(card);
                          }}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 cursor-pointer font-sans"
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. ASANA KANBAN BOARD VIEW (UNROLLED CARDS)                        */}
      {/* ----------------------------------------------------------------- */}
      {mode === "board" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans">
          {boardColumns.map((col) => (
            <div key={col.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 flex flex-col gap-2 font-sans">
              <div className="mb-1 flex items-center justify-between px-1 font-sans">
                <span className="text-xs font-bold text-zinc-300 font-sans">{col.title}</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-md font-bold">
                  {col.cards.length}
                </span>
              </div>

              <div className="space-y-2 font-sans">
                {col.cards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setActiveDrawerCard(card)}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 p-3 transition-all cursor-pointer group shadow-sm flex flex-col gap-2 font-sans"
                    >
                      <div className="flex items-start justify-between gap-2 font-sans">
                        <p className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5 font-sans">
                          <Icon size={12} className="text-amber-400 shrink-0" />
                          <span className="truncate font-sans">{card.title}</span>
                        </p>
                        <Maximize2 size={12} className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                      </div>

                      <p className="text-[11px] text-zinc-400 font-sans line-clamp-2 leading-snug">
                        {card.subtitle}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80 font-sans">
                        <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[120px]">
                          {prospectEmail}
                        </span>
                        <StatusPill tone={card.tone} className="text-[9.5px]">
                          {card.badge}
                        </StatusPill>
                      </div>
                    </button>
                  );
                })}

                {col.cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-900 p-4 text-center text-[10px] text-zinc-600 font-sans">
                    No dispatches in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. CONFIGURED DISPATCH CHANNELS FOOTER                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans">
        <div className="mb-2 flex items-center gap-2 font-sans">
          <ListChecks size={14} className="text-zinc-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-300 font-sans">
            Configured Dispatch Channels
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 font-sans">
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

        <p className="mt-3 text-[10px] text-zinc-500 font-sans">
          Per-channel enrollment outcomes for this specific run (ESP sequence, SMS schedule, ad cohort sync) are logged as steps — see the Steps panel for exact success/failure per channel.
        </p>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 6. SLIDE-OVER CHANNEL DETAIL DRAWER (STRICT FONT PERSISTENCE)     */}
      {/* ----------------------------------------------------------------- */}
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
      {/* Enforce font-sans antialiased text-zinc-100 on portal root to fix font mismatch */}
      <SheetContent widthClassName="w-full sm:max-w-xl font-sans antialiased text-zinc-100">
        {card && (
          <div className="flex flex-col h-full font-sans antialiased">
            <SheetHeader className="font-sans">
              <div className="flex items-center justify-between font-sans">
                <div className="flex items-center gap-2 text-amber-400 font-sans">
                  <SlidersHorizontal size={15} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-sans">
                    Pile-On
                  </span>
                </div>
                <StatusPill tone={card.tone}>{card.badge}</StatusPill>
              </div>

              <SheetTitle className="mt-2 text-lg font-bold font-sans text-white">{card.title}</SheetTitle>
              <SheetDescription className="text-xs text-zinc-400 font-sans">{card.subtitle}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-4 pt-2 font-sans">
              {/* AI Intro Drawer Body */}
              {card.type === "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="flex justify-between items-center font-sans">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      AI-personalized intro
                    </span>
                    {card.payload.send.personalizedIntro && (
                      <button
                        type="button"
                        onClick={() => onCopy(card.payload.send.personalizedIntro, "drawer-intro")}
                        className="flex items-center gap-1 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer font-sans"
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
                    <div className="whitespace-pre-wrap rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 text-xs leading-relaxed text-zinc-200 font-sans">
                      {card.payload.send.personalizedIntro}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs italic text-zinc-500 font-sans">
                      This one went out with the standard template — a personalized intro wasn&apos;t generated for this send.
                    </p>
                  )}

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300 font-sans space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Recipient</span>
                      <span>{card.payload.send.prospectEmail}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Email / SMS / Ad Data Drawer Body */}
              {card.type !== "ai_intro" && (
                <div className="space-y-3 font-sans">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs text-zinc-300 font-sans space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Connected platform</span>
                      <span>{card.subtitle}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-zinc-500">Prospect</span>
                      <span>{send?.prospectEmail ?? "This booking"}</span>
                    </div>
                  </div>

                  {/* Detailed SMS Message History */}
                  {card.type === "sms" && card.payload.messages?.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        Send history ({card.payload.messages.length})
                      </span>
                      {card.payload.messages.map((m: SequenceMessage, i: number) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs space-y-1 font-sans"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-300 font-semibold">Text message {i + 1}</span>
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
                  ) : card.type === "sms" ? (
                    <p className="text-xs text-zinc-400 leading-relaxed font-sans bg-zinc-900/40 border border-zinc-800 p-3 rounded-xl">
                      No individual messages have sent yet — they go out on the schedule set for this booking, each logged here the moment it sends.
                    </p>
                  ) : (card.type === "email" || card.type === "ad_data") && card.payload.step ? (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs text-zinc-300 space-y-1.5 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Last attempt</span>
                        <StatusPill
                          tone={card.payload.step.status === "success" ? "success" : card.payload.step.status === "failed" ? "danger" : "info"}
                        >
                          {runStatusLabel(card.payload.step.status)}
                        </StatusPill>
                      </div>
                      <p className="text-zinc-500">{new Date(card.payload.step.completedAt ?? card.payload.step.startedAt).toLocaleString()}</p>
                      {card.payload.step.detail && card.payload.step.status === "failed" ? (() => {
                        const diagnosis = classifyRunError(card.payload.step.detail);
                        return diagnosis ? (
                          <div className="pt-1">
                            <p className="text-zinc-300 font-semibold">{diagnosis.title}</p>
                            <p className="text-zinc-400 mt-0.5">{diagnosis.explanation}</p>
                          </div>
                        ) : (
                          <p className="text-zinc-400 pt-1">This didn&apos;t go out — it hit an unexpected error.</p>
                        );
                      })() : card.payload.step.detail ? (
                        <p className="text-zinc-400 pt-1">{card.payload.step.detail}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 leading-relaxed font-sans bg-zinc-900/40 border border-zinc-800 p-3 rounded-xl">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 font-sans">
      <p className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-500 font-sans">
        <Icon size={11} /> {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-zinc-200 font-sans">{value}</p>
    </div>
  );
}