"use client";

import React, { useState } from "react";
import { 
  ChevronDown, 
  ChevronRight, 
  Radio, 
  Globe, 
  Video, 
  FileText, 
  MessageSquare,
  HelpCircle,
  Award,
  ShieldAlert,
  Sparkles
} from "lucide-react";

const PILLAR_LABELS: Record<string, string> = {
  common_questions: "Common Questions Brief",
  deeper_questions: "Deeper Questions Brief",
  success_proof: "Success Proof Brief",
  objections: "Objections Brief",
};

const PILLAR_CONFIGS: Record<string, { icon: React.ElementType; badgeBg: string; badgeText: string; subtitleTone: string }> = {
  common_questions: {
    icon: MessageSquare,
    badgeBg: "bg-emerald-500/15 border-emerald-500/30",
    badgeText: "text-emerald-400",
    subtitleTone: "text-emerald-400/90",
  },
  deeper_questions: {
    icon: HelpCircle,
    badgeBg: "bg-indigo-500/15 border-indigo-500/30",
    badgeText: "text-indigo-400",
    subtitleTone: "text-indigo-400/90",
  },
  success_proof: {
    icon: Award,
    badgeBg: "bg-amber-500/15 border-amber-500/30",
    badgeText: "text-amber-400",
    subtitleTone: "text-amber-400/90",
  },
  objections: {
    icon: ShieldAlert,
    badgeBg: "bg-rose-500/15 border-rose-500/30",
    badgeText: "text-rose-400",
    subtitleTone: "text-rose-400/90",
  },
};

const TONE_AXIS_LABELS: Record<string, { left: string; right: string }> = {
  formal_casual: { left: "Formal", right: "Casual" },
  technical_plain: { left: "Technical", right: "Plain-spoken" },
  warm_neutral: { left: "Warm", right: "Neutral" },
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  marketing_site: "Marketing site",
  about_page: "About / story page",
  sales_page: "Sales page",
  pricing_page: "Pricing page",
  proof_page: "Case studies / proof",
  supporting_page: "Supporting page",
  esp_broadcast: "Email broadcast",
};

type DiscoveryPrefill = {
  domain: string;
  crawledAt: string;
  suggestedBuyerName?: string;
  suggestedOfferName?: string;
  suggestedIcp?: string;
  existingConfirmationPageUrl?: string;
  detectedBookingPlatform?: string;
  notes: string[];
} | null;

type VoiceScrapeArtifacts = {
  scrapedAt: string;
  sources: Array<{ kind: string; url?: string; wordCount: number }>;
  totalWordCount: number;
} | null;

export type BrandVoiceProfile = {
  source_path?: "default" | "ai_extracted" | string;
  fallback_reason?: "corpus_too_short" | "extraction_parse_failed" | string;
  corpus_word_count?: number;
  tone?: Record<string, { score: number; note: string }>;
  vocabulary?: { signature?: string[]; brand_terms?: string[] };
  sentence_length?: { short_pct?: number; medium_pct?: number; long_pct?: number };
  banned_phrases?: Array<{ phrase: string; confidence: number }>;
} | null;

type AdCreativeBriefs = {
  generatedAt: string;
  briefs: Array<{
    id: string;
    pillar: string;
    hook: string;
    angle: string;
    talkingPoints: string[];
    suggestedFormat: string;
    cta: string;
  }>;
} | null;

type PinDownScriptPack = {
  generatedAt: string;
  heroScript?: {
    title: string;
    targetLengthSeconds: number;
    chapters: Array<{ timestampLabel: string; beat: string; script: string }>;
    recordingPrompt: string;
  };
  breakoutScripts?: Array<{
    id: string;
    title: string;
    targetLengthSeconds: number;
    script: string;
    recordingPrompt: string;
    sourceQuestion?: string;
  }>;
} | null;

type PinDownPageAudit = {
  auditedUrl: string;
  existingPageStrengths: string[];
  existingPageWeaknesses: string[];
  v1Improvements: string[];
} | null;

export type ConversationIntelligenceState = {
  enabled: boolean;
  lastProcessedAt?: string;
} | null;

// Reusable Top-Level Item Row (Matches screenshot style)
function DeliverableRow({
  icon: Icon,
  iconBgClass = "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  title,
  subtitle,
  subtitleClass = "text-emerald-400",
  formatBadge,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  iconBgClass?: string;
  title: string;
  subtitle: string;
  subtitleClass?: string;
  formatBadge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-zinc-800/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 px-3 hover:bg-zinc-900/40 rounded-xl transition-all group text-left cursor-pointer"
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Rounded soft-tinted icon badge */}
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-sm ${iconBgClass}`}>
            <Icon size={19} />
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                {title}
              </span>
              {formatBadge && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 shrink-0 hidden sm:inline-block">
                  {formatBadge}
                </span>
              )}
            </div>
            {/* Direct subtitle/preview line */}
            <p className={`text-xs font-medium truncate ${subtitleClass}`}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors pl-3 shrink-0">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {open && (
        <div className="px-3 pt-2 pb-6 space-y-4 animate-in fade-in-50 duration-150 border-t border-zinc-800/40 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function DeliverablesPanel({
  discoveryPrefill,
  voiceScrapeArtifacts,
  brandVoiceProfile,
  adCreativeBriefs,
  pinDownScriptPack,
  pinDownPageAudit,
  conversationIntelligence,
}: {
  discoveryPrefill: DiscoveryPrefill;
  voiceScrapeArtifacts: VoiceScrapeArtifacts;
  brandVoiceProfile: BrandVoiceProfile;
  adCreativeBriefs: AdCreativeBriefs;
  pinDownScriptPack: PinDownScriptPack;
  pinDownPageAudit: PinDownPageAudit;
  conversationIntelligence?: ConversationIntelligenceState;
}) {
  const isAiExtracted = brandVoiceProfile?.source_path === "ai_extracted";
  const briefs = adCreativeBriefs?.briefs ?? [];

  return (
    <div className="space-y-6 font-sans max-w-5xl mx-auto">
      {/* ── DYNAMIC RECALL.AI / CONVERSATION INTELLIGENCE HEADER BAR ── */}
      {conversationIntelligence?.enabled ? (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10 text-xs">
          <div className="flex items-center gap-3">
            <Radio size={16} className="text-emerald-400 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-emerald-300 block">
                Recall.ai Conversation Intelligence Active
              </span>
              <span className="text-zinc-400 text-[11px]">
                {conversationIntelligence.lastProcessedAt
                  ? `Last call synced ${new Date(conversationIntelligence.lastProcessedAt).toLocaleDateString()} — auto-updating objection briefs`
                  : "Listening for upcoming calls — will mine new objections automatically"}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium shrink-0 hidden sm:inline-block">
            Auto-Sync Active
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-amber-500/20 bg-amber-950/10 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <Radio size={16} />
            </div>
            <div>
              <span className="font-semibold text-amber-300 block">
                Conversation Intelligence Unconnected
              </span>
              <span className="text-zinc-400 text-[11px]">
                Connect Recall.ai in Stack Settings to automatically update these ad briefs from live prospect calls.
              </span>
            </div>
          </div>
          <a
            href="#stack-settings"
            className="text-[11px] font-mono font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            Connect Recall
          </a>
        </div>
      )}

      {/* ── MAIN FLAT DELIVERABLES LIST ── */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-2 sm:p-4 divide-y divide-zinc-800/60 shadow-xl">
        
        {/* BRAND VOICE & SITE CRAWL ROW */}
        <DeliverableRow
          icon={Globe}
          iconBgClass="bg-purple-500/15 border-purple-500/30 text-purple-400"
          title="Brand Voice & Site Intelligence"
          subtitle={
            isAiExtracted
              ? `Extracted from ${voiceScrapeArtifacts?.totalWordCount.toLocaleString() ?? 0} words across ${voiceScrapeArtifacts?.sources.length ?? 0} pages`
              : "Neutral default tone profile applied"
          }
          subtitleClass={isAiExtracted ? "text-purple-400/90" : "text-amber-400/90"}
        >
          <div className="space-y-4 pt-2 text-xs text-zinc-300">
            {isAiExtracted && brandVoiceProfile?.tone && (
              <div className="space-y-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                  Tone Spectrum
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(brandVoiceProfile.tone).map(([key, val]) => {
                    const axis = TONE_AXIS_LABELS[key];
                    const clamped = Math.max(1, Math.min(5, val.score));
                    const pct = ((clamped - 1) / 4) * 100;
                    return (
                      <div key={key} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/60 space-y-2">
                        <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
                          <span>{axis?.left ?? key}</span>
                          <span className="text-amber-400">{val.score}/5</span>
                          <span>{axis?.right ?? ""}</span>
                        </div>
                        <div className="relative h-1.5 rounded-full bg-zinc-800">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-400"
                            style={{ left: `calc(${pct}% - 5px)` }}
                          />
                        </div>
                        <p className="text-[11px] text-zinc-400 font-mono leading-tight">{val.note}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {voiceScrapeArtifacts?.sources && (
              <div className="space-y-2 pt-2 border-t border-zinc-800/60">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                  Crawled Sources ({voiceScrapeArtifacts.sources.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {voiceScrapeArtifacts.sources.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/30 border border-zinc-800/40 text-xs">
                      <span className="text-zinc-300 truncate max-w-[80%]" title={s.url}>
                        <strong className="text-zinc-100">{SOURCE_KIND_LABELS[s.kind] ?? s.kind}</strong>
                        {s.url ? ` — ${s.url}` : ""}
                      </span>
                      <span className="text-zinc-500 font-mono text-[11px]">{s.wordCount}w</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DeliverableRow>

        {/* EACH AD BRIEF AS ITS OWN SEPARATE TOP-LEVEL ROW */}
        {briefs.map((b, index) => {
          const cfg = PILLAR_CONFIGS[b.pillar] ?? {
            icon: Sparkles,
            badgeBg: "bg-teal-500/15 border-teal-500/30",
            badgeText: "text-teal-400",
            subtitleTone: "text-teal-400/90",
          };
          const PillarIcon = cfg.icon;

          return (
            <DeliverableRow
              key={b.id}
              icon={PillarIcon}
              iconBgClass={`${cfg.badgeBg} ${cfg.badgeText}`}
              title={PILLAR_LABELS[b.pillar] ?? b.pillar}
              subtitle={`Hook: "${b.hook}"`}
              subtitleClass={cfg.subtitleTone}
              formatBadge={b.suggestedFormat}
              defaultOpen={index === 0} // First brief open by default for immediate preview
            >
              <div className="space-y-3.5 text-xs text-zinc-300 font-sans pt-1">
                {/* Scroll-Stopper Hook */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                    Scroll-Stopper Hook (First 3 Seconds)
                  </span>
                  <p className="text-sm font-semibold text-zinc-100 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80 leading-snug">
                    &ldquo;{b.hook}&rdquo;
                  </p>
                </div>

                {/* Strategic Angle */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                    Strategic Angle &amp; Framing
                  </span>
                  <p className="text-zinc-300 leading-relaxed">{b.angle}</p>
                </div>

                {/* Script Beats */}
                {b.talkingPoints?.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 block">
                      Script Beats / Talking Points
                    </span>
                    <ul className="space-y-1 pl-1">
                      {b.talkingPoints.map((tp, i) => (
                        <li key={i} className="flex items-start gap-2 text-zinc-300">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{tp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Call to Action */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800/60">
                  <span className="text-[11px] font-mono text-zinc-400">Call to Action (CTA):</span>
                  <span className="text-xs font-bold text-amber-400 font-mono bg-amber-400/10 px-2.5 py-1 rounded border border-amber-400/20">
                    {b.cta}
                  </span>
                </div>
              </div>
            </DeliverableRow>
          );
        })}

        {/* VIDEO SCRIPT PACK ROW */}
        {pinDownScriptPack && (
          <DeliverableRow
            icon={Video}
            iconBgClass="bg-blue-500/15 border-blue-500/30 text-blue-400"
            title="Video Script Pack"
            subtitle={
              pinDownScriptPack.heroScript
                ? `Hero Video (${Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min) + Breakouts`
                : "Confirmation video scripts ready"
            }
            subtitleClass="text-blue-400/90"
          >
            <div className="space-y-4 pt-2 text-xs">
              {pinDownScriptPack.heroScript && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-200 text-sm">{pinDownScriptPack.heroScript.title}</span>
                    <span className="text-zinc-400 font-mono">~{Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min</span>
                  </div>
                  <div className="space-y-2">
                    {pinDownScriptPack.heroScript.chapters.map((c, i) => (
                      <div key={i} className="p-3 rounded-lg bg-zinc-900/40 border border-zinc-800/50 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-mono font-bold text-[11px]">{c.timestampLabel}</span>
                          <span className="text-zinc-200 font-semibold">{c.beat}</span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed">{c.script}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DeliverableRow>
        )}

        {/* EXISTING PAGE AUDIT ROW */}
        {pinDownPageAudit && (
          <DeliverableRow
            icon={FileText}
            iconBgClass="bg-zinc-500/15 border-zinc-500/30 text-zinc-300"
            title="Existing Confirmation Page Audit"
            subtitle={`Audited ${pinDownPageAudit.auditedUrl}`}
            subtitleClass="text-zinc-400"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="space-y-1.5 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40">
                <span className="font-bold text-emerald-400 uppercase text-[10px] font-mono tracking-wider block">
                  Strengths
                </span>
                <ul className="space-y-1">
                  {pinDownPageAudit.existingPageStrengths.map((s, i) => (
                    <li key={i} className="text-zinc-300">✓ {s}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-1.5 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/40">
                <span className="font-bold text-rose-400 uppercase text-[10px] font-mono tracking-wider block">
                  Weaknesses Identified
                </span>
                <ul className="space-y-1">
                  {pinDownPageAudit.existingPageWeaknesses.map((w, i) => (
                    <li key={i} className="text-zinc-300">✗ {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </DeliverableRow>
        )}

      </div>
    </div>
  );
}