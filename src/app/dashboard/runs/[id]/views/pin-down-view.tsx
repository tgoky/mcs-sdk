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

// ---------------------------------------------------------------------------
// PILLAR CANVAS CONFIGURATION
// ---------------------------------------------------------------------------
interface PillarCanvasConfig {
  key: string;
  title: string;
  prompt: string;
  headerBg: string;
  headerText: string;
  noteBg: string;
  noteBorder: string;
  accentText: string;
}

const PILLARS_CANVAS: PillarCanvasConfig[] = [
  {
    key: "common_questions",
    title: "Common Questions",
    prompt: "What are the immediate questions prospects ask before booking?",
    headerBg: "bg-amber-300",
    headerText: "text-zinc-950",
    noteBg: "bg-amber-500/10",
    noteBorder: "border-amber-500/30",
    accentText: "text-amber-400",
  },
  {
    key: "deeper_questions",
    title: "Deeper Questions",
    prompt: "What core bottleneck or process problem are they trying to solve?",
    headerBg: "bg-orange-400",
    headerText: "text-zinc-950",
    noteBg: "bg-orange-500/10",
    noteBorder: "border-orange-500/30",
    accentText: "text-orange-400",
  },
  {
    key: "success_proof",
    title: "Expected Outcomes & Proof",
    prompt: "What client outcome or proof point validates this offer?",
    headerBg: "bg-teal-300",
    headerText: "text-zinc-950",
    noteBg: "bg-teal-500/10",
    noteBorder: "border-teal-500/30",
    accentText: "text-teal-400",
  },
  {
    key: "objections",
    title: "Challenges & Objections",
    prompt: "What fear or misunderstanding holds them back from taking action?",
    headerBg: "bg-rose-300",
    headerText: "text-zinc-950",
    noteBg: "bg-rose-500/10",
    noteBorder: "border-rose-500/30",
    accentText: "text-rose-400",
  },
];

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
  size = 170,
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
 * Asana Static Status Pill Component
 */
function AsanaStatusPill({ status }: { status: "on_track" | "at_risk" | "off_track" }) {
  const config = {
    on_track: { label: "On track", color: "text-emerald-400 bg-emerald-950/30 border-emerald-800/50" },
    at_risk: { label: "At risk", color: "text-amber-400 bg-amber-950/30 border-amber-800/50" },
    off_track: { label: "Off track", color: "text-rose-400 bg-rose-950/30 border-rose-800/50" },
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-sans select-none shrink-0",
        config.color
      )}
    >
      <span className="text-[9px]">●</span>
      <span>{config.label}</span>
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

  // Status checks for rows
  const deploymentStatus: "on_track" | "at_risk" | "off_track" = isLive
    ? "on_track"
    : isPasteReady
    ? "at_risk"
    : "off_track";

  const stackStatus: "on_track" | "at_risk" | "off_track" =
    stack?.booking_platform && stack?.webhook_receiver_mode === "webhook"
      ? "on_track"
      : stack?.booking_platform
      ? "at_risk"
      : "off_track";

  const voiceStatus: "on_track" | "at_risk" | "off_track" = voice ? "on_track" : "off_track";
  const creativeStatus: "on_track" | "at_risk" | "off_track" = briefs.length > 0 ? "on_track" : "at_risk";

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
      return `Your automation configuration is complete and ready for deployment. Paste-ready HTML code is prepared for ${hostingPlatformLabel(stack?.hosting_platform)}, brand voice tokens are extracted, and ${briefs.length} ad creative briefs are generated.`;
    }

    if (!stack?.booking_platform) {
      return `Your automation setup is missing platform API configurations. Please configure your booking platform and hosting stack to enable automated webhook synchronization and live page deployment.`;
    }

    return `Your automation workflow is configured and awaiting review. ${bookingPlatformLabel(stack?.booking_platform)} is linked, brand voice profile is extracted, and ${briefs.length} ad briefs are staged in the queue.`;
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
            Pin-Down Onboarding Skill Matrix active. Inspect your live VSL deployment, ad briefs, and voice positioning below.
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

        {/* Asana Status Rows */}
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
                    ? "Paste-Ready Code Generated"
                    : "Deployment Pending Manual Review"}
                </p>
              </div>
            </div>
            <AsanaStatusPill status={deploymentStatus} />
          </div>

          {/* Row 2: Stack Sync */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3">
              <Webhook size={16} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white font-sans">Platform Stack & Webhook Sync</p>
                <p className="text-[11px] text-zinc-500 font-sans">
                  Booking: {bookingPlatformLabel(stack?.booking_platform)} · Receiver: {stack?.webhook_receiver_mode ?? "None"}
                </p>
              </div>
            </div>
            <AsanaStatusPill status={stackStatus} />
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
            <AsanaStatusPill status={voiceStatus} />
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
            <AsanaStatusPill status={creativeStatus} />
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
        <div className="pt-6 font-sans">
          {/* TAB 1: AD BRIEFS (Canvas Sticky Note Columns Layout) */}
          {activeTab === "briefs" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
              {PILLARS_CANVAS.map((pillarConfig) => {
                const brief = briefs.find((b) => b.pillar === pillarConfig.key);

                return (
                  <div key={pillarConfig.key} className="flex flex-col gap-3 font-sans">
                    {/* Header Block (Solid Color Header) */}
                    <div
                      className={cn(
                        "px-3.5 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider text-center shadow-xs select-none",
                        pillarConfig.headerBg,
                        pillarConfig.headerText
                      )}
                    >
                      {pillarConfig.title}
                    </div>

                    {/* Outer Container Card (Prompt Question) */}
                    <div className="rounded-2xl border border-zinc-800/80 bg-transparent p-4 flex flex-col gap-3.5 min-h-[340px] font-sans">
                      <p className="text-xs font-semibold text-zinc-300 font-sans leading-relaxed">
                        {pillarConfig.prompt}
                      </p>

                      {/* Sticky Note Answer Area */}
                      {brief ? (
                        <div className="flex flex-col gap-3 flex-1 font-sans">
                          {/* Sticky Note 1: Hook */}
                          <div
                            className={cn(
                              "rounded-xl border p-3.5 space-y-1.5 shadow-2xs font-sans transition-all hover:scale-[1.01]",
                              pillarConfig.noteBg,
                              pillarConfig.noteBorder
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={cn("text-[10px] font-mono font-bold uppercase", pillarConfig.accentText)}
                              >
                                Hook
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    `Hook: ${cleanString(brief.hook)}\nAngle: ${cleanString(brief.angle)}\nFormat: ${brief.suggestedFormat}\nCTA: ${brief.cta}`,
                                    `brief-${brief.id}`
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                              >
                                {copiedKey === `brief-${brief.id}` ? (
                                  <Check size={11} className="text-emerald-400" />
                                ) : (
                                  <Copy size={11} />
                                )}
                                <span>{copiedKey === `brief-${brief.id}` ? "Copied" : "Copy"}</span>
                              </button>
                            </div>
                            <p className="text-xs text-white font-bold font-sans leading-snug">
                              &quot;{cleanString(brief.hook)}&quot;
                            </p>
                          </div>

                          {/* Sticky Note 2: Angle & Details */}
                          <div
                            className={cn(
                              "rounded-xl border p-3.5 space-y-2.5 shadow-2xs font-sans flex-1 flex flex-col justify-between transition-all hover:scale-[1.01]",
                              pillarConfig.noteBg,
                              pillarConfig.noteBorder
                            )}
                          >
                            <div>
                              <span className={cn("text-[10px] font-mono font-bold uppercase block mb-1", pillarConfig.accentText)}>
                                Angle Strategy
                              </span>
                              <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                                {cleanString(brief.angle)}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-zinc-800/40 text-[10.5px] font-mono space-y-1 text-zinc-400">
                              <p>
                                <span className="text-zinc-300 font-bold">Format:</span> {brief.suggestedFormat}
                              </p>
                              <p>
                                <span className="text-zinc-300 font-bold">CTA:</span> {brief.cta}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 p-4 text-center text-xs text-zinc-500 font-sans italic">
                          Awaiting brief generation for this pillar...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
                      <p className="text-xs font-bold text-zinc-300 mb-2">Signature Vocabulary Tokens</p>
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