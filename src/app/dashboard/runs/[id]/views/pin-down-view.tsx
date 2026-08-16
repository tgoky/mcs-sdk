"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Copy,
  Check,
  Code2,
  Globe,
  Webhook,
  Palette,
  Film,
  Megaphone,
  AlertCircle,
  MoreHorizontal,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingPlatformLabel, hostingPlatformLabel, SKILLS, SKILL_INFO, type SkillName } from "@/lib/copy";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { EmptyState } from "../_shared/empty-state";
import type { PinDownDetail } from "../_shared/types";

const PILLAR_LABEL: Record<string, string> = {
  common_questions: "Common questions",
  deeper_questions: "Deeper questions",
  success_proof: "Success proof",
  objections: "Objections",
};

const PILLAR_SUBTITLE: Record<string, string> = {
  common_questions: "What are the immediate questions prospects ask before booking?",
  deeper_questions: "What core bottleneck or process problem are they trying to solve?",
  success_proof: "What client outcome or proof point validates this offer?",
  objections: "What misunderstanding or fear holds them back from taking action?",
};

const PILLAR_COLOR: Record<
  string,
  { noteBg: string; border: string; text: string; label: string }
> = {
  common_questions: {
    noteBg: "bg-blue-500/15",
    border: "border-blue-500/30",
    text: "text-blue-400",
    label: "QA",
  },
  deeper_questions: {
    noteBg: "bg-amber-500/15",
    border: "border-amber-500/30",
    text: "text-amber-400",
    label: "DQ",
  },
  success_proof: {
    noteBg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    label: "PROOF",
  },
  objections: {
    noteBg: "bg-rose-500/15",
    border: "border-rose-500/30",
    text: "text-rose-400",
    label: "OBJ",
  },
};

/**
 * Utility to strip double-escaped AI quotes
 */
function cleanString(str?: string | null): string {
  if (!str) return "";
  return str.replace(/^["'\s]+|["'\s]+$/g, "").trim();
}

/**
 * Skill Orbital Ring Showcase Component
 */
function SkillOrbitalRing({
  enabledSkills,
  size = 180,
  className = "",
}: {
  enabledSkills?: SkillName[];
  size?: number;
  className?: string;
}) {
  const radius = size * 0.36;
  const badgeSize = Math.round(size * 0.17);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer Dashed Orbit Track */}
      <div
        className="absolute rounded-full border border-dashed border-zinc-800/80 animate-[spin_60s_linear_infinite]"
        style={{
          width: radius * 2 + badgeSize,
          height: radius * 2 + badgeSize,
        }}
      />

      {/* Inner Radar Ring */}
      <div
        className="absolute rounded-full border border-teal-500/20 bg-teal-500/5"
        style={{
          width: radius * 2,
          height: radius * 2,
        }}
      />

      {/* Center Core Hub */}
      <div className="z-10 flex flex-col items-center justify-center w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 shadow-md">
        <Layers className="w-4 h-4 text-teal-400" />
      </div>

      {/* Orbiting Squishy Skill Badges */}
      {SKILLS.map((skill, index) => {
        const angleRad = (index * 72 - 90) * (Math.PI / 180);
        const x = Math.cos(angleRad) * radius;
        const y = Math.sin(angleRad) * radius;

        const isEnabled = enabledSkills ? enabledSkills.includes(skill) : true;
        const info = SKILL_INFO[skill];

        return (
          <div
            key={skill}
            className="absolute z-20 transition-all duration-300 hover:scale-125 cursor-pointer"
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
            title={`${info.name}: ${isEnabled ? "Enabled" : "Disabled"}`}
          >
            <SquishySkillBadge skill={skill} size={badgeSize} enabled={isEnabled} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Contextual & User-Friendly Status Pill Component
 */
export type StatusPillVariant =
  | "live"
  | "ready"
  | "polling"
  | "action_needed"
  | "pending"
  | "off_track";

function StatusPill({
  variant,
  customLabel,
}: {
  variant: StatusPillVariant;
  customLabel?: string;
}) {
  const config: Record<StatusPillVariant, { label: string; color: string }> = {
    live: {
      label: "Live",
      color: "text-emerald-400 bg-emerald-950/30 border-emerald-800/50",
    },
    ready: {
      label: "Ready",
      color: "text-emerald-400 bg-emerald-950/30 border-emerald-800/50",
    },
    polling: {
      label: "Polling active",
      color: "text-sky-400 bg-sky-950/30 border-sky-800/50",
    },
    action_needed: {
      label: "Action needed",
      color: "text-amber-400 bg-amber-950/30 border-amber-800/50",
    },
    pending: {
      label: "Pending",
      color: "text-amber-400 bg-amber-950/30 border-amber-800/50",
    },
    off_track: {
      label: "Not configured",
      color: "text-rose-400 bg-rose-950/30 border-rose-800/50",
    },
  };

  const item = config[variant] ?? config.off_track;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-sans select-none shrink-0",
        item.color
      )}
    >
      <span className="text-[9px]">●</span>
      <span>{customLabel || item.label}</span>
    </span>
  );
}

export function PinDownView({ detail }: { detail: PinDownDetail }) {
  const { run } = detail;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"briefs" | "scripts" | "code" | "voice">("briefs");

  const deployment = run.confirmationPageDeployment;
  const isLive = deployment?.mode === "live";
  const isPasteReady = deployment?.mode === "paste_ready";

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const briefs = run.adCreativeBriefs?.briefs ?? [];
  const scriptPack = run.pinDownScriptPack;
  const voice = run.brandVoiceProfile;
  const stack = run.stack;

  // Safe lookup for buyer / client name
  const runRecord = run as Record<string, any>;
  const buyerName =
    runRecord.buyerName || runRecord.buyer || runRecord.engagement?.buyer || "Client";

  // Contextual Status checks for rows
  const deploymentVariant: StatusPillVariant = isLive
    ? "live"
    : isPasteReady
    ? "action_needed"
    : "off_track";

  const isWebhook = stack?.webhook_receiver_mode === "webhook";
  const isPolling = stack?.webhook_receiver_mode === "polling";

  const stackVariant: StatusPillVariant = isWebhook
    ? "live"
    : isPolling
    ? "polling"
    : stack?.booking_platform
    ? "action_needed"
    : "off_track";

  const stackLabel = isWebhook
    ? "Direct sync"
    : isPolling
    ? "Polling active"
    : stack?.booking_platform
    ? "Sync needed"
    : "Not connected";

  const voiceVariant: StatusPillVariant = voice ? "ready" : "pending";
  const creativeVariant: StatusPillVariant = briefs.length > 0 ? "ready" : "pending";

  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Human sentence synthesis
  const buildSentenceSummary = () => {
    if (isLive) {
      return `Your automation is live! We've calibrated ${buyerName}'s brand voice (${voice?.tone?.formal_casual?.score ?? 3}/5 posture), synced ${bookingPlatformLabel(stack?.booking_platform)} with ${hostingPlatformLabel(stack?.hosting_platform)}, and deployed your confirmation page VSL alongside ${briefs.length} ad creative briefs.`;
    }

    if (isPasteReady) {
      return `Your setup is complete and ready to go live. Paste-ready code is prepared for ${hostingPlatformLabel(stack?.hosting_platform)}, your brand voice has been learned, and ${briefs.length} ad creative briefs are ready.`;
    }

    if (!stack?.booking_platform) {
      return `Your setup is missing a few connections. Add your booking and hosting platforms below to turn on automatic booking sync and get your page live.`;
    }

    return `Your setup is configured and waiting on review. ${bookingPlatformLabel(stack?.booking_platform)} is connected, your brand voice has been learned, and ${briefs.length} ad briefs are ready.`;
  };

  return (
    <div className="flex flex-col gap-6 font-sans antialiased text-zinc-100 max-w-5xl mx-auto py-2">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA TOP GREETING HEADER WITH ORBITAL RING                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-800/80 bg-transparent">
        <div className="space-y-1 max-w-xl">
          <p className="text-xs font-medium text-zinc-400 font-sans">{formattedDate}</p>
          <h1 className="text-2xl font-bold text-white tracking-tight font-sans">
            Good afternoon, {buyerName}
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed font-sans pt-1">
            Your account setup is underway — check out your live page, ad briefs, and brand voice below.
          </p>

          {isLive && run.confirmationPageUrl && (
            <div className="pt-2">
              <a
                href={run.confirmationPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 text-zinc-950 px-3 py-1.5 text-xs font-bold hover:bg-white transition-colors font-sans"
              >
                <span>View Live Page</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        {/* Interactive Orbital Skill Ring Showcase */}
        <div className="shrink-0 self-center sm:self-auto py-1">
          <SkillOrbitalRing size={160} />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. TRANSPARENT STATUS UPDATES CARD                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800/80 bg-transparent p-6 font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <h2 className="text-base font-bold text-white tracking-tight font-sans">Status updates</h2>
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1 rounded-md"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Conversational Sentence Summary Banner */}
        <div className="py-4 border-b border-zinc-800/80">
          <p className="text-sm text-zinc-300 leading-relaxed font-sans">
            {buildSentenceSummary()}
          </p>
        </div>

        {/* Asana Status Rows with Contextual Pills */}
        <div className="divide-y divide-zinc-800/60 font-sans">
          {/* Row 1: Deployment */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3">
              <Globe size={16} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white font-sans">Confirmation Page VSL Deployment</p>
                <p className="text-[11px] text-zinc-500 font-sans">
                  {isLive
                    ? `Published on ${hostingPlatformLabel(deployment?.deployedVia)}`
                    : isPasteReady
                    ? "Paste-Ready Code Generated (Copy & Paste to publish)"
                    : "Deployment Pending Manual Review"}
                </p>
              </div>
            </div>
            <StatusPill variant={deploymentVariant} />
          </div>

          {/* Row 2: Stack Sync */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3">
              <Webhook size={16} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white font-sans">Platform Stack & Webhook Sync</p>
                <p className="text-[11px] text-zinc-500 font-sans">
                  Booking: {bookingPlatformLabel(stack?.booking_platform)} · Mode: {isPolling ? "Auto-polling (5m window)" : (stack?.webhook_receiver_mode ?? "None")}
                </p>
              </div>
            </div>
            <StatusPill variant={stackVariant} customLabel={stackLabel} />
          </div>

          {/* Row 3: Brand Voice */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3">
              <Palette size={16} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white font-sans">Brand Voice & Positioning Profile</p>
                <p className="text-[11px] text-zinc-500 font-sans">
                  Formal/Casual: {voice?.tone?.formal_casual?.score ?? 3}/5 · Tokens: {voice?.vocabulary?.signature?.slice(0, 3).join(", ") || "None"}
                </p>
              </div>
            </div>
            <StatusPill variant={voiceVariant} />
          </div>

          {/* Row 4: Creative Assets */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3">
              <Megaphone size={16} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white font-sans">Ad Creative Briefs & Video Scripts</p>
                <p className="text-[11px] text-zinc-500 font-sans">
                  {briefs.length} Ad Briefs · 1 Hero VSL + {scriptPack?.breakoutScripts?.length ?? 0} Breakouts
                </p>
              </div>
            </div>
            <StatusPill variant={creativeVariant} />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 3. TRANSPARENT DELIVERABLES PANEL                                 */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800/80 bg-transparent p-6 font-sans">
        <div className="flex items-center gap-3 pb-4 border-b border-zinc-800/80">
          <div className="h-8 w-8 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold text-xs shrink-0">
            {buyerName.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="text-base font-bold text-white tracking-tight font-sans">
            Automation Deliverables
          </h2>
        </div>

        {/* Clean Sub-Tabs */}
        <div className="flex items-center gap-6 border-b border-zinc-800/80 pt-3 text-xs font-medium font-sans">
          <button
            type="button"
            onClick={() => setActiveTab("briefs")}
            className={cn(
              "pb-2.5 transition-colors cursor-pointer border-b-2 font-sans",
              activeTab === "briefs"
                ? "border-white text-white font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Ad Briefs ({briefs.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("scripts")}
            className={cn(
              "pb-2.5 transition-colors cursor-pointer border-b-2 font-sans",
              activeTab === "scripts"
                ? "border-white text-white font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Video Scripts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("code")}
            className={cn(
              "pb-2.5 transition-colors cursor-pointer border-b-2 font-sans",
              activeTab === "code"
                ? "border-white text-white font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Page Code
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("voice")}
            className={cn(
              "pb-2.5 transition-colors cursor-pointer border-b-2 font-sans",
              activeTab === "voice"
                ? "border-white text-white font-bold"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            Brand Voice
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="pt-5 font-sans">
          {/* TAB 1: AD BRIEFS (Separated Canvas Grid Layout) */}
          {activeTab === "briefs" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
              {briefs.map((brief) => {
                const color = PILLAR_COLOR[brief.pillar] ?? PILLAR_COLOR.common_questions;
                const pillarTitle = PILLAR_LABEL[brief.pillar] ?? brief.pillar;
                const subQuestion = PILLAR_SUBTITLE[brief.pillar] ?? "Core angle & positioning strategy";

                return (
                  <div
                    key={brief.id}
                    className="flex flex-col justify-between p-5 rounded-2xl border border-zinc-800/80 bg-transparent hover:border-zinc-700/80 transition-colors font-sans space-y-4"
                  >
                    {/* Header: Sticky Note Icon + Title & Subtitle + Copy */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Sticky Note Badge */}
                          <div
                            className={cn(
                              "w-10 h-10 rounded-xl border flex flex-col items-center justify-center font-mono font-bold text-[9px] shrink-0 shadow-2xs select-none",
                              color.noteBg,
                              color.border,
                              color.text
                            )}
                          >
                            <span>{color.label}</span>
                          </div>

                          <div className="min-w-0">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                              {pillarTitle}
                            </h3>
                            <p className="text-[11px] text-zinc-400 font-sans mt-0.5 leading-snug">
                              {subQuestion}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `Hook: ${cleanString(brief.hook)}\nAngle: ${cleanString(brief.angle)}\nFormat: ${brief.suggestedFormat}\nCTA: ${brief.cta}`,
                              `brief-${brief.id}`
                            )
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
                        >
                          {copiedKey === `brief-${brief.id}` ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>{copiedKey === `brief-${brief.id}` ? "Copied" : "Copy Brief"}</span>
                        </button>
                      </div>

                      {/* Hook & Angle Text Body */}
                      <div className="space-y-2 pt-1 font-sans border-t border-zinc-800/60">
                        <p className="text-xs font-bold text-zinc-100 leading-relaxed font-sans">
                          Hook: &quot;{cleanString(brief.hook)}&quot;
                        </p>
                        <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                          <strong className="text-zinc-300 font-sans">Angle:</strong> {cleanString(brief.angle)}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Metadata: Format & CTA */}
                    <div className="pt-3 border-t border-zinc-800/60 font-sans text-xs text-zinc-400 flex flex-col gap-1">
                      <p>
                        <strong className="text-zinc-300 font-mono text-[11px]">Format:</strong>{" "}
                        <span className="text-zinc-400">{brief.suggestedFormat}</span>
                      </p>
                      <p>
                        <strong className="text-zinc-300 font-mono text-[11px]">CTA:</strong>{" "}
                        <span className="text-zinc-400">{brief.cta}</span>
                      </p>
                    </div>
                  </div>
                );
              })}

              {briefs.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={Megaphone}
                    title="No Ad Briefs Generated"
                    description="Ad creative briefs haven't been generated for this engagement yet."
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIDEO SCRIPTS */}
          {activeTab === "scripts" && (
            <div className="divide-y divide-zinc-800/60 font-sans">
              {scriptPack ? (
                <>
                  {/* Hero Script */}
                  <div className="py-4 first:pt-1 space-y-3 font-sans">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">
                        Hero VSL Script ({scriptPack.heroScript.targetLengthSeconds}s target)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            scriptPack.heroScript.chapters?.map((c) => c.script).join("\n\n") ?? "",
                            "hero-script"
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedKey === "hero-script" ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                        <span>{copiedKey === "hero-script" ? "Copied" : "Copy Hero Script"}</span>
                      </button>
                    </div>

                    <p className="text-xs font-bold text-white">{scriptPack.heroScript.title}</p>
                    <div className="space-y-3 pt-1">
                      {scriptPack.heroScript.chapters?.map((chap, i) => (
                        <div key={i} className="text-xs text-zinc-300 space-y-1">
                          <p className="font-bold text-amber-400 text-[11px] font-mono">
                            {chap.timestampLabel ? `${chap.timestampLabel} · ` : ""}
                            {chap.beat || (chap as any).title || `Chapter ${i + 1}`}
                          </p>
                          <p className="whitespace-pre-wrap leading-relaxed font-sans text-zinc-300">{chap.script}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Breakout Scripts */}
                  {scriptPack.breakoutScripts?.map((breakout) => (
                    <div key={breakout.id} className="py-4 space-y-2 font-sans">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase font-bold text-sky-400">
                          Breakout Script: {breakout.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(breakout.script, `breakout-${breakout.id}`)}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedKey === `breakout-${breakout.id}` ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>{copiedKey === `breakout-${breakout.id}` ? "Copied" : "Copy Script"}</span>
                        </button>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                        {breakout.script}
                      </p>
                    </div>
                  ))}
                </>
              ) : (
                <EmptyState
                  icon={Film}
                  title="No Scripts Generated"
                  description="Video script pack has not been generated for this engagement yet."
                />
              )}
            </div>
          )}

          {/* TAB 3: PAGE CODE */}
          {activeTab === "code" && (
            <div className="space-y-3 font-sans pt-2">
              {run.pasteReadyHtml ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-sans">
                      Generated Confirmation VSL Code
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(run.pasteReadyHtml!, "page-html")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      {copiedKey === "page-html" ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                      <span>{copiedKey === "page-html" ? "Copied Code" : "Copy HTML Code"}</span>
                    </button>
                  </div>

                  <div className="max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-black/60 p-4 font-mono text-[11px] text-zinc-400 leading-relaxed">
                    <pre className="whitespace-pre-wrap break-all">{run.pasteReadyHtml}</pre>
                  </div>

                  {run.pasteReadyInstructions && (
                    <p className="text-xs text-zinc-400 p-3 rounded-xl leading-relaxed border border-zinc-800/80 font-sans">
                      {run.pasteReadyInstructions}
                    </p>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={Code2}
                  title="No HTML Code Recorded"
                  description="No paste-ready HTML code has been generated for this engagement yet."
                />
              )}
            </div>
          )}

          {/* TAB 4: BRAND VOICE */}
          {activeTab === "voice" && (
            <div className="space-y-4 font-sans pt-2">
              {voice ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border border-zinc-800/80">
                      <p className="text-[10px] font-mono uppercase text-zinc-500">Formal ↔ Casual</p>
                      <p className="text-base font-bold text-white mt-0.5">{voice.tone.formal_casual.score}/5</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{voice.tone.formal_casual.note}</p>
                    </div>

                    <div className="p-3 rounded-xl border border-zinc-800/80">
                      <p className="text-[10px] font-mono uppercase text-zinc-500">Technical ↔ Plain</p>
                      <p className="text-base font-bold text-white mt-0.5">{voice.tone.technical_plain.score}/5</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{voice.tone.technical_plain.note}</p>
                    </div>

                    <div className="p-3 rounded-xl border border-zinc-800/80">
                      <p className="text-[10px] font-mono uppercase text-zinc-500">Warm ↔ Neutral</p>
                      <p className="text-base font-bold text-white mt-0.5">{voice.tone.warm_neutral.score}/5</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{voice.tone.warm_neutral.note}</p>
                    </div>
                  </div>

                  {voice.vocabulary.signature.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-zinc-300 mb-2">Signature Words & Phrases</p>
                      <div className="flex flex-wrap gap-1.5">
                        {voice.vocabulary.signature.map((token) => (
                          <span
                            key={token}
                            className="rounded-md bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200 border border-zinc-800"
                          >
                            {token}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {voice.banned_phrases.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-rose-400 mb-2 flex items-center gap-1">
                        <AlertCircle size={12} /> Banned Phrases
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {voice.banned_phrases.map((b) => (
                          <span
                            key={b.phrase}
                            className="rounded-md bg-rose-950/20 px-2 py-1 font-mono text-xs text-rose-300 border border-rose-900/40"
                          >
                            {b.phrase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={Palette}
                  title="Voice Profile Pending"
                  description="Brand voice extraction hasn't run for this engagement yet."
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}