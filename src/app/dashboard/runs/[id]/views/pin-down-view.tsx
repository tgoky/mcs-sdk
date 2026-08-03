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
  ClipboardCheck,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingPlatformLabel, hostingPlatformLabel } from "@/lib/copy";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "../_shared/empty-state";
import type { PinDownDetail } from "../_shared/types";

const PILLAR_LABEL: Record<string, string> = {
  common_questions: "Common questions",
  deeper_questions: "Deeper questions",
  success_proof: "Success proof",
  objections: "Objections",
};

/**
 * Asana-exact Status Pill Component (Static dot + label)
 */
function AsanaStatusPill({ status }: { status: "on_track" | "at_risk" | "off_track" }) {
  const config = {
    on_track: { label: "On track", color: "text-emerald-400 bg-emerald-950/40 border-emerald-800/60" },
    at_risk: { label: "At risk", color: "text-amber-400 bg-amber-950/40 border-amber-800/60" },
    off_track: { label: "Off track", color: "text-rose-400 bg-rose-950/40 border-rose-800/60" },
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
  const isPending = deployment?.mode === "pending_review";

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
  const buyerName = run.buyerName || "Client";

  // Derive status states for Asana rows
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

  // Date String for Asana Header
  const formattedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Conversational Sentence Constructor
  const buildSentenceSummary = () => {
    if (isLive) {
      return `Your automation is live! We've calibrated ${buyerName}'s brand voice with a balanced analytical posture (${voice?.tone?.formal_casual?.score ?? 3}/5 formal/casual), synced ${bookingPlatformLabel(stack?.booking_platform)} to ${hostingPlatformLabel(stack?.hosting_platform)}, and deployed the confirmation page VSL along with ${briefs.length} ad creative briefs.`;
    }

    if (isPasteReady) {
      return `Your automation configuration is complete and ready for deployment. Paste-ready HTML code has been generated for ${hostingPlatformLabel(stack?.hosting_platform)}, brand voice tokens (${voice?.vocabulary?.signature?.slice(0, 3).join(", ") ?? "default"}) are extracted, and ${briefs.length} ad creative briefs are prepared.`;
    }

    if (!stack?.booking_platform) {
      return `Your automation setup is missing platform API configurations. Please configure your booking platform and hosting stack to enable automated webhook synchronization and live page deployment.`;
    }

    return `Your automation workflow is configured and awaiting review. ${bookingPlatformLabel(stack?.booking_platform)} is linked, brand voice profile is extracted, and ${briefs.length} ad briefs are staged in the queue.`;
  };

  return (
    <div className="flex flex-col gap-6 font-sans antialiased text-zinc-100 max-w-5xl mx-auto py-2">
      {/* ----------------------------------------------------------------- */}
      {/* 1. ASANA TOP GREETING HEADER                                      */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-400 font-sans">{formattedDate}</p>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-0.5 font-sans">
            Good afternoon, {buyerName}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {isLive && run.confirmationPageUrl && (
            <a
              href={run.confirmationPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors font-sans border border-zinc-700"
            >
              <span>Live VSL Page</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. CARD 1: STATUS UPDATES (ASANA HOME EXACT STYLE)                */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl backdrop-blur-xs font-sans">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <h2 className="text-base font-bold text-white tracking-tight font-sans">Status updates</h2>
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1 rounded-md hover:bg-zinc-800"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Conversational Sentence Summary Banner */}
        <div className="py-5 border-b border-zinc-800/80">
          <p className="text-sm text-zinc-300 leading-relaxed font-sans max-w-3xl">
            {buildSentenceSummary()}
          </p>
        </div>

        {/* Asana Status Rows with Right-Aligned Pills */}
        <div className="divide-y divide-zinc-800/60 font-sans">
          {/* Row 1: Confirmation Page Deployment */}
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

          {/* Row 2: Platform Stack & Webhook Sync */}
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

          {/* Row 3: Brand Voice & Positioning */}
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

          {/* Row 4: Ad Creative Briefs & Video Scripts */}
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
      {/* 3. CARD 2: MY TASKS & DELIVERABLES (ASANA TABBED DETAILS)        */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl backdrop-blur-xs font-sans">
        <div className="flex items-center gap-3 pb-4 border-b border-zinc-800/80">
          <div className="h-8 w-8 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-xs shrink-0">
            {buyerName.slice(0, 2).toUpperCase()}
          </div>
          <h2 className="text-base font-bold text-white tracking-tight font-sans">
            Automation Deliverables
          </h2>
        </div>

        {/* Asana Sub-Tabs */}
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
        <div className="pt-4 font-sans">
          {/* TAB 1: AD BRIEFS */}
          {activeTab === "briefs" && (
            <div className="space-y-3">
              {briefs.map((brief) => (
                <div
                  key={brief.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2 font-sans"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase font-bold text-zinc-400">
                      Pillar: {PILLAR_LABEL[brief.pillar] ?? brief.pillar}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `Hook: ${brief.hook}\nAngle: ${brief.angle}\nFormat: ${brief.suggestedFormat}\nCTA: ${brief.cta}`,
                          `brief-${brief.id}`
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedKey === `brief-${brief.id}` ? (
                        <Check size={12} className="text-emerald-400" />
                      ) : (
                        <Copy size={12} />
                      )}
                      <span>{copiedKey === `brief-${brief.id}` ? "Copied" : "Copy Brief"}</span>
                    </button>
                  </div>

                  <p className="text-xs text-white font-bold font-sans">
                    Hook: &quot;{brief.hook}&quot;
                  </p>
                  <p className="text-xs text-zinc-300 font-sans">
                    <strong className="text-zinc-400">Angle:</strong> {brief.angle}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      Format: {brief.suggestedFormat}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      CTA: {brief.cta}
                    </span>
                  </div>
                </div>
              ))}

              {briefs.length === 0 && (
                <EmptyState
                  icon={Megaphone}
                  title="No Ad Briefs Generated"
                  description="Ad creative briefs haven't been generated for this engagement yet."
                />
              )}
            </div>
          )}

          {/* TAB 2: VIDEO SCRIPTS */}
          {activeTab === "scripts" && (
            <div className="space-y-4">
              {scriptPack ? (
                <>
                  {/* Hero Script */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2 font-sans">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">
                        Hero VSL Script ({scriptPack.heroScript.targetLengthSeconds}s)
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
                    <div className="space-y-2 pt-1">
                      {scriptPack.heroScript.chapters?.map((chap, i) => (
                        <div key={i} className="text-xs text-zinc-300 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
                          <p className="font-bold text-amber-400 text-[11px] mb-1">{chap.title}</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{chap.script}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Breakout Scripts */}
                  {scriptPack.breakoutScripts?.map((breakout) => (
                    <div
                      key={breakout.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-2 font-sans"
                    >
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
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
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
            <div className="space-y-3 font-sans">
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
                    <p className="text-xs text-zinc-400 bg-zinc-950/40 border border-zinc-800 p-3 rounded-xl leading-relaxed">
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
            <div className="space-y-4 font-sans">
              {voice ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                      <p className="text-[10px] font-mono uppercase text-zinc-500">Formal ↔ Casual</p>
                      <p className="text-base font-bold text-white mt-0.5">{voice.tone.formal_casual.score}/5</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{voice.tone.formal_casual.note}</p>
                    </div>

                    <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
                      <p className="text-[10px] font-mono uppercase text-zinc-500">Technical ↔ Plain</p>
                      <p className="text-base font-bold text-white mt-0.5">{voice.tone.technical_plain.score}/5</p>
                      <p className="text-[11px] text-zinc-400 mt-1">{voice.tone.technical_plain.note}</p>
                    </div>

                    <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/40">
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
                            className="rounded-md bg-zinc-800/80 px-2 py-1 font-mono text-xs text-zinc-200 border border-zinc-700/60"
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
                            className="rounded-md bg-rose-950/40 px-2 py-1 font-mono text-xs text-rose-300 border border-rose-900/40"
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