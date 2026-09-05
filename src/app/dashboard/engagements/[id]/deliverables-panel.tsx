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
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Camera,
  Shirt
} from "lucide-react";

const PILLAR_LABELS: Record<string, string> = {
  common_questions: "Common Questions Brief",
  deeper_questions: "Deeper Questions Brief",
  success_proof: "Success Proof Brief",
  objections: "Objections Brief",
};

const PILLAR_CONFIGS: Record<string, { icon: React.ElementType; squircleClass: string }> = {
  common_questions: {
    icon: MessageSquare,
    squircleClass: "bg-teal-200 text-teal-950 dark:bg-teal-900/60 dark:text-teal-200",
  },
  deeper_questions: {
    icon: HelpCircle,
    squircleClass: "bg-indigo-200 text-indigo-950 dark:bg-indigo-900/60 dark:text-indigo-200",
  },
  success_proof: {
    icon: Award,
    squircleClass: "bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-200",
  },
  objections: {
    icon: ShieldAlert,
    squircleClass: "bg-rose-200 text-rose-950 dark:bg-rose-900/60 dark:text-rose-200",
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
  recordingChecklist?: {
    castingChoice: "founder_on_camera" | "coach_on_camera" | "animation" | "other";
    equipment: string[];
    environment: string[];
    wardrobeAndFraming: string[];
    perScriptReminders: Array<{ scriptId: string; scriptTitle: string; reminder: string }>;
  };
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

// Small color square + label instead of plain uppercase text — same
// swatch-then-label convention used for module status (status-swatch.tsx)
// and Crisis Response's contributing findings, applied here so every
// field inside a brief (hook, angle, talking points, CTA) reads as one
// consistent list instead of the CTA row's old label-left/value-right
// layout standing apart from the other three.
function SquareLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500">
      <span className={`w-2 h-2 rounded-[2.5px] shrink-0 ${color}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function DeliverableRow({
  id,
  isOpen,
  onToggle,
  icon: Icon,
  squircleClass = "bg-teal-200 text-teal-950 dark:bg-teal-900/60 dark:text-teal-200",
  title,
  subtitle,
  children,
}: {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
  icon: React.ElementType;
  squircleClass?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        isOpen
          ? "bg-white dark:bg-zinc-900/90 text-zinc-900 dark:text-zinc-100 rounded-2xl shadow-md dark:shadow-xl my-3 border border-zinc-200 dark:border-zinc-700/60 transition-all duration-200"
          : "border-b border-zinc-200/80 dark:border-zinc-800/60 last:border-b-0 transition-all duration-200"
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className={
          isOpen
            ? "w-full flex items-center justify-between py-4 px-3.5 text-left cursor-pointer select-none"
            : "w-full flex items-center justify-between py-4 px-3 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/40 rounded-xl transition-all text-left cursor-pointer select-none group"
        }
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${squircleClass}`}>
            <Icon size={20} strokeWidth={2.2} />
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span
                className={
                  isOpen
                    ? "text-sm font-bold text-zinc-900 dark:text-white truncate"
                    : "text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors truncate"
                }
              >
                {title}
              </span>
            </div>
            <p className={isOpen ? "text-xs text-zinc-600 dark:text-zinc-400 truncate font-medium" : "text-xs text-zinc-500 dark:text-zinc-400 truncate"}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className={isOpen ? "text-zinc-700 dark:text-zinc-300 pl-3 shrink-0" : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors pl-3 shrink-0"}>
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {isOpen && (
        <div className="px-3.5 pt-2 pb-6 space-y-4 animate-in fade-in-50 duration-150 border-t border-zinc-200 dark:border-zinc-800 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function DeliverablesPanel({
  engagementId,
  discoveryPrefill,
  voiceScrapeArtifacts,
  brandVoiceProfile,
  adCreativeBriefs,
  pinDownScriptPack,
  pinDownPageAudit,
  conversationIntelligence,
}: {
  engagementId: string;
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

  const defaultOpenId = briefs[0]?.id ?? "brand_voice";
  const [openRowId, setOpenRowId] = useState<string | null>(defaultOpenId);

  const toggleRow = (id: string) => {
    setOpenRowId((prev) => (prev === id ? null : id));
  };

  const scrapedWordCount = voiceScrapeArtifacts?.totalWordCount ?? 0;
  const scrapedSourceCount = voiceScrapeArtifacts?.sources?.length ?? 0;
  const corpusWordCount = brandVoiceProfile?.corpus_word_count ?? scrapedWordCount;

  const fallbackHeadline =
    brandVoiceProfile?.fallback_reason === "extraction_parse_failed"
      ? "The AI extraction ran but didn't return usable output"
      : corpusWordCount > 0
      ? `Only found ${corpusWordCount.toLocaleString()} word${corpusWordCount === 1 ? "" : "s"} of usable content — that's not enough for a real read (need 500+)`
      : "Couldn't pull any usable content from this client's site";

  const fallbackDetail =
    brandVoiceProfile?.fallback_reason === "extraction_parse_failed"
      ? "This corpus was long enough — the model's response just didn't come back as valid JSON that run. Worth trying again."
      : scrapedSourceCount > 0
      ? `Checked ${scrapedSourceCount} page${scrapedSourceCount === 1 ? "" : "s"} on ${discoveryPrefill?.domain ?? "the domain on file"} and came up short.`
      : `No domain-based crawl produced anything, and there's no operator-pasted sample either.`;

  return (
    <div className="w-full space-y-6 font-sans">
      {/* CALL INTELLIGENCE STATUS HEADER */}
      {conversationIntelligence?.enabled ? (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950/60 text-xs">
          <div className="flex items-center gap-3">
            <Radio size={16} className="text-emerald-500 dark:text-emerald-400 animate-pulse shrink-0" />
            <div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200 block">
                Call Intelligence Active
              </span>
              <span className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                {conversationIntelligence.lastProcessedAt
                  ? `Last call synced ${new Date(conversationIntelligence.lastProcessedAt).toLocaleDateString()} — auto-updating objection briefs`
                  : "Listening for upcoming calls — auto-mining new objections"}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-2.5 py-1 rounded-full font-medium shrink-0 hidden sm:inline-block">
            Sync Active
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[#f8f7fa] dark:bg-zinc-950/60 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-800 shrink-0">
              <Radio size={16} />
            </div>
            <div>
              <span className="font-semibold text-zinc-900 dark:text-zinc-200 block">
                Call Intelligence Off
              </span>
              <span className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                Connect your call provider in Stack Settings to automatically update briefs from live prospect calls.
              </span>
            </div>
          </div>
          <a
            href={`/dashboard/engagements/${engagementId}?fixSection=conversation_intelligence`}
            className="text-[11px] font-mono font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-200/80 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-800 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            Connect Provider
          </a>
        </div>
      )}

      {/* MAIN DELIVERABLES CONTAINER */}
      <div className="w-full bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-2 sm:p-4 divide-y divide-zinc-200 dark:divide-zinc-800/60 shadow-lg">
        
        {/* BRAND VOICE & SITE INTELLIGENCE ROW */}
        <DeliverableRow
          id="brand_voice"
          isOpen={openRowId === "brand_voice"}
          onToggle={() => toggleRow("brand_voice")}
          icon={Globe}
          squircleClass="bg-purple-200 text-purple-950 dark:bg-purple-900/60 dark:text-purple-200"
          title="Brand Voice & Site Intelligence"
          subtitle={
            isAiExtracted
              ? `Extracted from ${voiceScrapeArtifacts?.totalWordCount.toLocaleString() ?? 0} words across ${voiceScrapeArtifacts?.sources.length ?? 0} pages`
              : "Neutral default tone profile applied"
          }
        >
          <div className="space-y-4 pt-1 text-xs">
            {!isAiExtracted && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/40 p-3.5 space-y-1.5">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">{fallbackHeadline}</p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">{fallbackDetail}</p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                  To fix: make sure key pages are reachable or paste a writing sample during onboarding, then re-run setup.
                </p>
              </div>
            )}

            {discoveryPrefill && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                  Domain Discovery ({discoveryPrefill.domain})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {discoveryPrefill.suggestedBuyerName && (
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-md">
                      Name: {discoveryPrefill.suggestedBuyerName}
                    </span>
                  )}
                  {discoveryPrefill.suggestedOfferName && (
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-md">
                      Offer: {discoveryPrefill.suggestedOfferName}
                    </span>
                  )}
                  {discoveryPrefill.suggestedIcp && (
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-md">
                      ICP: {discoveryPrefill.suggestedIcp}
                    </span>
                  )}
                  {discoveryPrefill.detectedBookingPlatform && (
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-md">
                      Booking: {discoveryPrefill.detectedBookingPlatform}
                    </span>
                  )}
                </div>

                {discoveryPrefill.notes.length > 0 && (
                  <ul className="space-y-1 pt-1 pl-1">
                    {discoveryPrefill.notes.map((note, i) => (
                      <li key={i} className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px] leading-relaxed flex items-start gap-1.5">
                        <span className="text-zinc-400">•</span>
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isAiExtracted && brandVoiceProfile?.tone && (
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                  Tone Spectrum
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(brandVoiceProfile.tone).map(([key, val]) => {
                    const axis = TONE_AXIS_LABELS[key];
                    const clamped = Math.max(1, Math.min(5, val.score));
                    const pct = ((clamped - 1) / 4) * 100;
                    return (
                      <div key={key} className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="flex justify-between text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                          <span>{axis?.left ?? key}</span>
                          <span className="text-zinc-900 dark:text-zinc-100 font-bold">{val.score}/5</span>
                          <span>{axis?.right ?? ""}</span>
                        </div>
                        <div className="relative h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100 shadow-xs"
                            style={{ left: `calc(${pct}% - 5px)` }}
                          />
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">{val.note}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isAiExtracted && (
              brandVoiceProfile?.vocabulary?.signature?.length || 
              brandVoiceProfile?.vocabulary?.brand_terms?.length || 
              brandVoiceProfile?.banned_phrases?.length
            ) ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                {!!brandVoiceProfile?.vocabulary?.signature?.length && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                      Signature Vocabulary
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {brandVoiceProfile.vocabulary!.signature!.map((w, i) => (
                        <span key={i} className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded-md">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!!brandVoiceProfile?.vocabulary?.brand_terms?.length && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                      Brand Terms
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {brandVoiceProfile.vocabulary!.brand_terms!.map((w, i) => (
                        <span key={i} className="text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded-md">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {!!brandVoiceProfile?.banned_phrases?.length && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                      Banned Phrases
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {brandVoiceProfile.banned_phrases.map((b, i) => (
                        <span key={i} className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-2 py-0.5 rounded-md line-through">
                          {b.phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {voiceScrapeArtifacts?.sources && (
              <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                  Crawled Sources ({voiceScrapeArtifacts.sources.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {voiceScrapeArtifacts.sources.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs">
                      <span className="text-zinc-800 dark:text-zinc-200 truncate max-w-[80%]" title={s.url}>
                        <strong className="font-semibold">{SOURCE_KIND_LABELS[s.kind] ?? s.kind}</strong>
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

        {/* INDIVIDUAL AD BRIEFS */}
        {briefs.map((b) => {
          const cfg = PILLAR_CONFIGS[b.pillar] ?? {
            icon: Sparkles,
            squircleClass: "bg-teal-200 text-teal-950 dark:bg-teal-900/60 dark:text-teal-200",
          };
          const PillarIcon = cfg.icon;

          return (
            <DeliverableRow
              key={b.id}
              id={b.id}
              isOpen={openRowId === b.id}
              onToggle={() => toggleRow(b.id)}
              icon={PillarIcon}
              squircleClass={cfg.squircleClass}
              title={PILLAR_LABELS[b.pillar] ?? b.pillar}
              subtitle={`Hook: "${b.hook}"`}
            >
              <div className="space-y-4 text-xs font-sans pt-1">
                <div className="space-y-1">
                  <SquareLabel color="bg-amber-400">Scroll-Stopper Hook (First 3 Seconds)</SquareLabel>
                  <div className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">
                    &ldquo;{b.hook}&rdquo;
                  </div>
                </div>

                <div className="space-y-1">
                  <SquareLabel color="bg-sky-400">Strategic Angle &amp; Framing</SquareLabel>
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{b.angle}</p>
                </div>

                {b.talkingPoints?.length > 0 && (
                  <div className="space-y-1.5">
                    <SquareLabel color="bg-emerald-400">Script Beats / Talking Points</SquareLabel>
                    <ul className="space-y-1 pl-1">
                      {b.talkingPoints.map((tp, i) => (
                        <li key={i} className="flex items-start gap-2 text-zinc-800 dark:text-zinc-200">
                          <span className="text-zinc-900 dark:text-zinc-100 font-bold">•</span>
                          <span>{tp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {b.cta && (
                  <div className="space-y-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <SquareLabel color="bg-rose-400">Call to Action (CTA)</SquareLabel>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">{b.cta}</p>
                  </div>
                )}
              </div>
            </DeliverableRow>
          );
        })}

        {/* VIDEO SCRIPT PACK ROW */}
        {pinDownScriptPack && (
          <DeliverableRow
            id="script_pack"
            isOpen={openRowId === "script_pack"}
            onToggle={() => toggleRow("script_pack")}
            icon={Video}
            squircleClass="bg-sky-200 text-sky-950 dark:bg-sky-900/60 dark:text-sky-200"
            title="Video Script Pack"
            subtitle={
              pinDownScriptPack.heroScript
                ? `Hero Video (${Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min) + ${pinDownScriptPack.breakoutScripts?.length ?? 0} Breakouts`
                : "Confirmation video scripts ready"
            }
          >
            <div className="space-y-5 pt-2 text-xs">
              {pinDownScriptPack.heroScript && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{pinDownScriptPack.heroScript.title}</span>
                    <span className="text-zinc-500 font-mono text-[11px]">~{Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min</span>
                  </div>
                  <div className="space-y-2">
                    {pinDownScriptPack.heroScript.chapters.map((c, i) => (
                      <div key={i} className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-700 dark:text-zinc-300 font-mono font-bold text-[11px]">{c.timestampLabel}</span>
                          <span className="text-zinc-900 dark:text-zinc-100 font-semibold">{c.beat}</span>
                        </div>
                        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{c.script}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono pt-1">
                    <strong className="text-zinc-900 dark:text-zinc-100">Recording Prompt:</strong> {pinDownScriptPack.heroScript.recordingPrompt}
                  </p>
                </div>
              )}

              {!!pinDownScriptPack.breakoutScripts?.length && (
                <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                    Breakout Q&amp;A Scripts ({pinDownScriptPack.breakoutScripts.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pinDownScriptPack.breakoutScripts.map((s) => (
                      <div key={s.id} className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</span>
                          <span className="text-[11px] font-mono text-zinc-500">~{s.targetLengthSeconds}s</span>
                        </div>
                        {s.sourceQuestion && (
                          <p className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 italic">From: &quot;{s.sourceQuestion}&quot;</p>
                        )}
                        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{s.script}</p>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono pt-1 border-t border-zinc-200/80 dark:border-zinc-800/80">
                          <strong>Prompt:</strong> {s.recordingPrompt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pinDownScriptPack.recordingChecklist && (
                <div className="space-y-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                    Recording Logistics Checklist
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <span className="text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1.5">
                        <Wrench size={13} className="text-zinc-500" /> Equipment
                      </span>
                      <ul className="space-y-1">
                        {pinDownScriptPack.recordingChecklist.equipment.map((it, i) => (
                          <li key={i} className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">· {it}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <span className="text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1.5">
                        <Camera size={13} className="text-zinc-500" /> Environment
                      </span>
                      <ul className="space-y-1">
                        {pinDownScriptPack.recordingChecklist.environment.map((it, i) => (
                          <li key={i} className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">· {it}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <span className="text-zinc-900 dark:text-zinc-100 font-semibold flex items-center gap-1.5">
                        <Shirt size={13} className="text-zinc-500" /> Wardrobe &amp; Framing
                      </span>
                      <ul className="space-y-1">
                        {pinDownScriptPack.recordingChecklist.wardrobeAndFraming.map((it, i) => (
                          <li key={i} className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">· {it}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DeliverableRow>
        )}

        {/* EXISTING PAGE AUDIT ROW */}
        {pinDownPageAudit && (
          <DeliverableRow
            id="page_audit"
            isOpen={openRowId === "page_audit"}
            onToggle={() => toggleRow("page_audit")}
            icon={FileText}
            squircleClass="bg-zinc-300 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-200"
            title="Existing Confirmation Page Audit"
            subtitle={`Audited ${pinDownPageAudit.auditedUrl}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="space-y-1.5 p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase text-[10px] font-mono tracking-wider flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" /> Strengths
                </span>
                <ul className="space-y-1">
                  {pinDownPageAudit.existingPageStrengths.map((s, i) => (
                    <li key={i} className="text-zinc-700 dark:text-zinc-300">✓ {s}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5 p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase text-[10px] font-mono tracking-wider flex items-center gap-1">
                  <AlertCircle size={12} className="text-rose-600 dark:text-rose-400" /> Weaknesses
                </span>
                <ul className="space-y-1">
                  {pinDownPageAudit.existingPageWeaknesses.map((w, i) => (
                    <li key={i} className="text-zinc-700 dark:text-zinc-300">✗ {w}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5 p-3 rounded-lg bg-[#f8f7fa] dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 uppercase text-[10px] font-mono tracking-wider block">
                  v1 Improvements
                </span>
                <ul className="space-y-1">
                  {pinDownPageAudit.v1Improvements.map((imp, i) => (
                    <li key={i} className="text-zinc-700 dark:text-zinc-300">→ {imp}</li>
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