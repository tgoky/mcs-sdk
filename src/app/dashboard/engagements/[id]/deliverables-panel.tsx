// src/app/dashboard/engagements/[id]/deliverables-panel.tsx

const PILLAR_LABELS: Record<string, string> = {
  common_questions: "Common Questions",
  deeper_questions: "Deeper Questions",
  success_proof: "Success Proof",
  objections: "Objections",
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

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="text-xs font-bold text-zinc-400 dark:text-zinc-400 uppercase tracking-widest font-mono flex items-center gap-2">
      {title}
      {typeof count === "number" && (
        <span className="text-[10px] font-mono text-zinc-300 dark:text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full font-bold">
          {count}
        </span>
      )}
    </h3>
  );
}

function ToneSpectrum({ axisKey, score, note }: { axisKey: string; score: number; note: string }) {
  const clamped = Math.max(1, Math.min(5, score));
  const pct = ((clamped - 1) / 4) * 100;
  const axis = TONE_AXIS_LABELS[axisKey];
  const leaning = clamped < 2.5 ? "left" : clamped > 3.5 ? "right" : "center";

  if (!axis) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-mono text-zinc-400 capitalize">{axisKey.replace(/_/g, " / ")}</p>
        <p className="text-xs text-zinc-300">{note}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/80">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className={`w-28 ${leaning === "left" ? "text-amber-400 font-bold" : "text-zinc-400"}`}>
          {axis.left}
        </span>
        <div className="relative flex-1 mx-3 h-2 rounded-full bg-zinc-800 border border-zinc-700">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-zinc-950 shadow-md shadow-amber-500/20"
            style={{ left: `calc(${pct}% - 7px)` }}
          />
        </div>
        <span className={`w-28 text-right ${leaning === "right" ? "text-amber-400 font-bold" : "text-zinc-400"}`}>
          {axis.right}
        </span>
      </div>
      <p className="text-xs text-zinc-300 font-sans leading-relaxed">{note}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-zinc-200 bg-zinc-800/90 border border-zinc-700/80 px-2.5 py-1 rounded-md shadow-sm">
      {children}
    </span>
  );
}

export function DeliverablesPanel({
  discoveryPrefill,
  voiceScrapeArtifacts,
  brandVoiceProfile,
  adCreativeBriefs,
  pinDownScriptPack,
  pinDownPageAudit,
}: {
  discoveryPrefill: DiscoveryPrefill;
  voiceScrapeArtifacts: VoiceScrapeArtifacts;
  brandVoiceProfile: BrandVoiceProfile;
  adCreativeBriefs: AdCreativeBriefs;
  pinDownScriptPack: PinDownScriptPack;
  pinDownPageAudit: PinDownPageAudit;
}) {
  const hasAnything =
    discoveryPrefill ||
    voiceScrapeArtifacts ||
    brandVoiceProfile ||
    (adCreativeBriefs?.briefs?.length ?? 0) > 0 ||
    pinDownScriptPack ||
    pinDownPageAudit;

  if (!hasAnything) {
    return (
      <div className="space-y-2">
        <SectionHeader title="Deliverables & Assets" />
        <div className="h-24 border border-dashed border-zinc-800 bg-zinc-950/40 rounded-xl flex items-center justify-center">
          <p className="text-xs text-zinc-500 font-mono">
            Nothing generated yet — run Pin-Down to produce these.
          </p>
        </div>
      </div>
    );
  }

  const tone = brandVoiceProfile?.tone ?? {};
  const toneEntries = Object.entries(tone);
  const isAiExtracted = brandVoiceProfile?.source_path === "ai_extracted";

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
    <div className="space-y-8 font-sans">
      <SectionHeader title="Deliverables & Assets" />

      {/* Website discovery + voice crawl */}
      {(discoveryPrefill || voiceScrapeArtifacts) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Site &amp; Voice Crawl</p>

          {discoveryPrefill && (
            <div className="space-y-2">
              <p className="text-xs font-mono text-zinc-400">
                Crawled <span className="text-zinc-200 font-bold">{discoveryPrefill.domain}</span> on{" "}
                {new Date(discoveryPrefill.crawledAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <div className="flex flex-wrap gap-2">
                {discoveryPrefill.suggestedBuyerName && <Chip>Name: {discoveryPrefill.suggestedBuyerName}</Chip>}
                {discoveryPrefill.suggestedOfferName && <Chip>Offer: {discoveryPrefill.suggestedOfferName}</Chip>}
                {discoveryPrefill.suggestedIcp && <Chip>ICP: {discoveryPrefill.suggestedIcp}</Chip>}
                {discoveryPrefill.detectedBookingPlatform && <Chip>Booking: {discoveryPrefill.detectedBookingPlatform}</Chip>}
              </div>
            </div>
          )}

          {voiceScrapeArtifacts && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-2">
              <p className="text-xs font-mono text-zinc-400">
                <span className="text-amber-400 font-bold">{voiceScrapeArtifacts.totalWordCount.toLocaleString()}</span> words pulled from {voiceScrapeArtifacts.sources.length} source
                {voiceScrapeArtifacts.sources.length === 1 ? "" : "s"}
              </p>
              <div className="space-y-1.5">
                {voiceScrapeArtifacts.sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800/60">
                    <span className="text-zinc-300 truncate max-w-[75%]" title={s.url}>
                      <strong className="text-zinc-100">{SOURCE_KIND_LABELS[s.kind] ?? s.kind}</strong>{s.url ? ` — ${s.url}` : ""}
                    </span>
                    <span className="text-zinc-400 font-semibold">{s.wordCount.toLocaleString()} words</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brand voice profile */}
      {brandVoiceProfile && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Brand Voice Profile</p>
            <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${isAiExtracted ? "text-amber-400 bg-amber-400/10 border-amber-400/30" : "text-amber-400 bg-amber-950/30 border-amber-900/50"}`}>
              {isAiExtracted ? "AI-Extracted from Corpus" : "Placeholder — Neutral Default"}
            </span>
          </div>

          {!isAiExtracted && (
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 space-y-2">
              <p className="text-sm font-bold text-amber-400">{fallbackHeadline}</p>
              <p className="text-xs text-amber-300/80 leading-relaxed">{fallbackDetail}</p>
            </div>
          )}

          {isAiExtracted && toneEntries.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tone Spectrum</p>
              {toneEntries.map(([key, val]) => (
                <ToneSpectrum key={key} axisKey={key} score={val.score} note={val.note} />
              ))}
            </div>
          )}

          {isAiExtracted && (brandVoiceProfile.vocabulary?.signature?.length || brandVoiceProfile.vocabulary?.brand_terms?.length) ? (
            <div className="pt-3 border-t border-zinc-800/80 space-y-3">
              {!!brandVoiceProfile.vocabulary?.signature?.length && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Signature Words &amp; Vocabulary</span>
                  <div className="flex flex-wrap gap-2">
                    {brandVoiceProfile.vocabulary!.signature!.map((w, i) => <Chip key={i}>{w}</Chip>)}
                  </div>
                </div>
              )}
              {!!brandVoiceProfile.vocabulary?.brand_terms?.length && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Brand-Specific Terms</span>
                  <div className="flex flex-wrap gap-2">
                    {brandVoiceProfile.vocabulary!.brand_terms!.map((w, i) => <Chip key={i}>{w}</Chip>)}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {isAiExtracted && !!brandVoiceProfile.banned_phrases?.length && (
            <div className="pt-3 border-t border-zinc-800/80 space-y-1.5">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Banned Phrases (Avoid)</span>
              <div className="flex flex-wrap gap-2">
                {brandVoiceProfile.banned_phrases.map((b, i) => (
                  <span key={i} className="text-xs font-mono font-medium text-rose-400 bg-rose-950/40 border border-rose-900/60 px-2.5 py-1 rounded-md line-through">
                    {b.phrase}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ad Creative Briefs */}
      {(adCreativeBriefs?.briefs?.length ?? 0) > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
              Ad Creative Briefs
            </p>
            <span className="text-xs font-mono text-zinc-400 font-semibold bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
              {adCreativeBriefs!.briefs.length} Pillars
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {adCreativeBriefs!.briefs.map((b) => (
              <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-4 shadow-md flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Header: Pillar Title & Format Badge */}
                  <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-zinc-800/80">
                    <span className="text-xs font-black font-mono text-amber-400 uppercase tracking-wider">
                      {PILLAR_LABELS[b.pillar] ?? b.pillar}
                    </span>
                    <span className="text-[11px] font-sans font-semibold text-zinc-200 bg-zinc-800 border border-zinc-700/80 px-2.5 py-1 rounded-md">
                      {b.suggestedFormat}
                    </span>
                  </div>

                  {/* Scroll-Stopper Hook */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-wider">
                      Scroll-Stopper Hook (First 3s)
                    </span>
                    <p className="text-sm font-bold text-zinc-100 bg-zinc-900/90 p-3 rounded-lg border border-zinc-800/80 leading-snug">
                      &ldquo;{b.hook}&rdquo;
                    </p>
                  </div>

                  {/* Strategic Angle */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-wider">
                      Strategic Angle &amp; Framing
                    </span>
                    <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                      {b.angle}
                    </p>
                  </div>

                  {/* Script Beats / Talking Points */}
                  {b.talkingPoints.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold font-mono text-zinc-500 uppercase tracking-wider">
                        Script Beats / Talking Points
                      </span>
                      <ul className="space-y-1 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/50">
                        {b.talkingPoints.map((tp, i) => (
                          <li key={i} className="text-xs text-zinc-300 font-sans leading-relaxed flex items-start gap-2">
                            <span className="text-amber-400 font-bold select-none">•</span>
                            <span>{tp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Call to Action */}
                <div className="pt-3 border-t border-zinc-800/80 space-y-1">
                  <span className="text-[10px] font-bold font-mono text-amber-400/90 uppercase tracking-wider block">
                    Call To Action (CTA)
                  </span>
                  <p className="text-xs font-bold text-zinc-100 font-mono bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                    {b.cta}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Script Pack */}
      {pinDownScriptPack && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Video Script Pack</p>

          {pinDownScriptPack.heroScript && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-3 shadow-md">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-sm font-bold text-zinc-100">{pinDownScriptPack.heroScript.title}</span>
                <span className="text-xs font-mono font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md">
                  ~{Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min
                </span>
              </div>
              <div className="space-y-3 pt-1">
                {pinDownScriptPack.heroScript.chapters.map((c, i) => (
                  <div key={i} className="flex gap-3 bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/50">
                    <span className="text-xs font-mono font-bold text-amber-400 shrink-0 w-16">{c.timestampLabel}</span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-zinc-200 uppercase tracking-wide">{c.beat}</p>
                      <p className="text-xs text-zinc-300 leading-relaxed font-sans">{c.script}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-400 font-mono pt-2 border-t border-zinc-800 leading-relaxed">
                <strong className="text-zinc-200">Recording Prompt:</strong> {pinDownScriptPack.heroScript.recordingPrompt}
              </p>
            </div>
          )}

          {!!pinDownScriptPack.breakoutScripts?.length && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pinDownScriptPack.breakoutScripts.map((s) => (
                <div key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 space-y-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-sm font-bold text-zinc-100">{s.title}</span>
                    <span className="text-xs font-mono font-semibold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
                      ~{s.targetLengthSeconds}s
                    </span>
                  </div>
                  {s.sourceQuestion && (
                    <p className="text-xs font-mono text-amber-400/90 italic">From: &quot;{s.sourceQuestion}&quot;</p>
                  )}
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">{s.script}</p>
                  <p className="text-xs text-zinc-400 font-mono pt-2 border-t border-zinc-800">
                    <strong className="text-zinc-200">Prompt:</strong> {s.recordingPrompt}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}