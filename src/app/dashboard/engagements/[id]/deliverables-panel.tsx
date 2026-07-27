// src/app/dashboard/engagements/[id]/deliverables-panel.tsx
//
// Pin-Down generates real deliverables during onboarding — ad creative
// briefs, a video script pack, a brand voice profile, and a record of what
// its crawler found on the buyer's site — and saves every one of them to
// Postgres (engagements.adCreativeBriefs, .pinDownScriptPack,
// .brandVoiceProfile, .voiceScrapeArtifacts, .discoveryPrefill,
// .pinDownPageAudit). Until now nothing in the UI rendered any of it: the
// run detail page only ever showed the 5-field summary and the step
// timeline, so the only way to see a generated brief was to query the
// database directly. This panel is that missing surface, rendered
// server-side straight from the same `engagement` row the rest of this
// page already fetches — no new API route needed.
//
// Every field here is optional and possibly malformed (voice extraction
// falls back to `{ source_path: "default" }` on a parse failure — see
// extractVoiceProfile in onboarding-service.ts), so this renders
// defensively throughout rather than assuming the shape is complete.

const PILLAR_LABELS: Record<string, string> = {
  common_questions: "Common Questions",
  deeper_questions: "Deeper Questions",
  success_proof: "Success Proof",
  objections: "Objections",
};

// Each tone key from onboarding-service.ts (e.g. "formal_casual") encodes a
// spectrum's two poles. Was previously rendered as `key.replace(/_/g, " → ")`
// — literal db-key stringification, e.g. "warm → neutral" — with no real
// design behind it. This is the human-readable version of the same three
// axes onboarding-service.ts's extractVoiceProfile always produces.
const TONE_AXIS_LABELS: Record<string, { left: string; right: string }> = {
  formal_casual: { left: "Formal", right: "Casual" },
  technical_plain: { left: "Technical", right: "Plain-spoken" },
  warm_neutral: { left: "Warm", right: "Neutral" },
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  marketing_site: "Marketing site",
  sales_page: "Sales page",
  pricing_page: "Pricing page",
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
    <h3 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
      {title}
      {typeof count === "number" && (
        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-800/40">
          {count}
        </span>
      )}
    </h3>
  );
}

function ToneSpectrum({ axisKey, score, note }: { axisKey: string; score: number; note: string }) {
  const clamped = Math.max(1, Math.min(5, score));
  const pct = ((clamped - 1) / 4) * 100; // 1 → 0%, 5 → 100%
  const axis = TONE_AXIS_LABELS[axisKey];
  const leaning = clamped < 2.5 ? "left" : clamped > 3.5 ? "right" : "center";

  if (!axis) {
    // Unknown axis key from a future prompt version — fall back gracefully
    // rather than rendering nothing or a raw db key.
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 capitalize">{axisKey.replace(/_/g, " / ")}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono">{note}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold w-24 text-right shrink-0 ${leaning === "left" ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-600"}`}>
          {axis.left}
        </span>
        <div className="relative flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 min-w-[64px]">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gold border-2 border-white dark:border-zinc-950 shadow-sm"
            style={{ left: `calc(${pct}% - 5px)` }}
          />
        </div>
        <span className={`text-[11px] font-semibold w-24 shrink-0 ${leaning === "right" ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-600"}`}>
          {axis.right}
        </span>
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono text-center">{note}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/60 px-2 py-0.5 rounded">
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
        <div className="h-24 border border-dashed border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-transparent rounded-lg flex items-center justify-center">
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
            Nothing generated yet — run Pin-Down to produce these.
          </p>
        </div>
      </div>
    );
  }

  const tone = brandVoiceProfile?.tone ?? {};
  const toneEntries = Object.entries(tone);
  const isAiExtracted = brandVoiceProfile?.source_path === "ai_extracted";

  return (
    <div className="space-y-5">
      <SectionHeader title="Deliverables & Assets" />

      {/* Website discovery + voice crawl — "what got extracted from the website" */}
      {(discoveryPrefill || voiceScrapeArtifacts) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-3 shadow-sm">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Site &amp; voice crawl</p>

          {discoveryPrefill && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                Crawled {discoveryPrefill.domain} on{" "}
                {new Date(discoveryPrefill.crawledAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
              <div className="flex flex-wrap gap-2">
                {discoveryPrefill.suggestedBuyerName && <Chip>Name: {discoveryPrefill.suggestedBuyerName}</Chip>}
                {discoveryPrefill.suggestedOfferName && <Chip>Offer: {discoveryPrefill.suggestedOfferName}</Chip>}
                {discoveryPrefill.suggestedIcp && <Chip>ICP: {discoveryPrefill.suggestedIcp}</Chip>}
                {discoveryPrefill.detectedBookingPlatform && <Chip>Booking: {discoveryPrefill.detectedBookingPlatform}</Chip>}
              </div>
              {discoveryPrefill.notes.length > 0 && (
                <ul className="space-y-0.5 pt-1">
                  {discoveryPrefill.notes.map((note, i) => (
                    <li key={i} className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono leading-relaxed">
                      · {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {voiceScrapeArtifacts && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900/50 space-y-1.5">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                {voiceScrapeArtifacts.totalWordCount.toLocaleString()} words pulled from {voiceScrapeArtifacts.sources.length} source
                {voiceScrapeArtifacts.sources.length === 1 ? "" : "s"} for voice extraction
              </p>
              <div className="space-y-1">
                {voiceScrapeArtifacts.sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[70%]" title={s.url}>
                      {SOURCE_KIND_LABELS[s.kind] ?? s.kind}{s.url ? ` — ${s.url}` : ""}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-600">{s.wordCount.toLocaleString()}w</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brand voice profile */}
      {brandVoiceProfile && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Brand voice profile</p>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${isAiExtracted ? "text-gold-hover dark:text-gold bg-gold/10 border-gold/30" : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800/40"}`}>
              {isAiExtracted ? "AI-extracted from corpus" : "Neutral default tone"}
            </span>
          </div>

          {toneEntries.length > 0 && (
            <div className="space-y-3">
              {toneEntries.map(([key, val]) => (
                <ToneSpectrum key={key} axisKey={key} score={val.score} note={val.note} />
              ))}
            </div>
          )}

          {(brandVoiceProfile.vocabulary?.signature?.length || brandVoiceProfile.vocabulary?.brand_terms?.length) ? (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900/50 space-y-1.5">
              {!!brandVoiceProfile.vocabulary?.signature?.length && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">Signature words:</span>
                  {brandVoiceProfile.vocabulary!.signature!.map((w, i) => <Chip key={i}>{w}</Chip>)}
                </div>
              )}
              {!!brandVoiceProfile.vocabulary?.brand_terms?.length && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">Brand terms:</span>
                  {brandVoiceProfile.vocabulary!.brand_terms!.map((w, i) => <Chip key={i}>{w}</Chip>)}
                </div>
              )}
            </div>
          ) : null}

          {!!brandVoiceProfile.banned_phrases?.length && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900/50">
              <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 block mb-1">Avoid using:</span>
              <div className="flex flex-wrap gap-1.5">
                {brandVoiceProfile.banned_phrases.map((b, i) => (
                  <span key={i} className="text-[11px] font-mono text-rose-600 dark:text-rose-400/80 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-2 py-0.5 rounded line-through">
                    {b.phrase}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ad creative briefs */}
      {(adCreativeBriefs?.briefs?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 px-0.5">
            Ad creative briefs <span className="text-zinc-400 dark:text-zinc-600 font-mono font-normal">({adCreativeBriefs!.briefs.length} pillars)</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {adCreativeBriefs!.briefs.map((b) => (
              <div key={b.id} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                    {PILLAR_LABELS[b.pillar] ?? b.pillar}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 bg-zinc-100 dark:bg-zinc-900/40 px-1.5 py-0.5 rounded">
                    {b.suggestedFormat}
                  </span>
                </div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-snug">{b.hook}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">{b.angle}</p>
                {b.talkingPoints.length > 0 && (
                  <ul className="space-y-0.5 pt-1">
                    {b.talkingPoints.map((tp, i) => (
                      <li key={i} className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono leading-relaxed">· {tp}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] font-mono font-semibold text-gold-hover dark:text-gold pt-1 border-t border-zinc-100 dark:border-zinc-900/40">
                  CTA: {b.cta}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video script pack */}
      {pinDownScriptPack && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 px-0.5">Video script pack</p>

          {pinDownScriptPack.heroScript && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{pinDownScriptPack.heroScript.title}</span>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                  ~{Math.round(pinDownScriptPack.heroScript.targetLengthSeconds / 60)} min
                </span>
              </div>
              <div className="space-y-2 pt-1">
                {pinDownScriptPack.heroScript.chapters.map((c, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0 w-14">{c.timestampLabel}</span>
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-mono font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wide">{c.beat}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{c.script}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono pt-2 border-t border-zinc-100 dark:border-zinc-900/40 leading-relaxed">
                {pinDownScriptPack.heroScript.recordingPrompt}
              </p>
            </div>
          )}

          {!!pinDownScriptPack.breakoutScripts?.length && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pinDownScriptPack.breakoutScripts.map((s) => (
                <div key={s.id} className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{s.title}</span>
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                      ~{s.targetLengthSeconds}s
                    </span>
                  </div>
                  {s.sourceQuestion && (
                    <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 italic">From: &quot;{s.sourceQuestion}&quot;</p>
                  )}
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{s.script}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-600 font-mono pt-1 border-t border-zinc-100 dark:border-zinc-900/40">
                    {s.recordingPrompt}
                  </p>
                </div>
              ))}
            </div>
          )}

          {pinDownScriptPack.recordingChecklist && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-sm">
              {[
                { label: "Equipment", items: pinDownScriptPack.recordingChecklist.equipment },
                { label: "Environment", items: pinDownScriptPack.recordingChecklist.environment },
                { label: "Wardrobe & framing", items: pinDownScriptPack.recordingChecklist.wardrobeAndFraming },
              ].map(({ label, items }) => (
                <div key={label} className="space-y-1">
                  <p className="text-[11px] font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{label}</p>
                  <ul className="space-y-0.5">
                    {items.map((it, i) => (
                      <li key={i} className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono leading-relaxed">· {it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing confirmation page audit, when discovery found one already live */}
      {pinDownPageAudit && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-900 bg-white/40 dark:bg-zinc-950/20 p-4 space-y-2 shadow-sm">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Existing page audit <span className="text-zinc-400 dark:text-zinc-600 font-mono font-normal">— {pinDownPageAudit.auditedUrl}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {[
              { label: "Strengths", items: pinDownPageAudit.existingPageStrengths, tone: "text-gold-hover dark:text-gold" },
              { label: "Weaknesses", items: pinDownPageAudit.existingPageWeaknesses, tone: "text-rose-600 dark:text-rose-400" },
              { label: "v1 improvements", items: pinDownPageAudit.v1Improvements, tone: "text-zinc-500 dark:text-zinc-400" },
            ].map(({ label, items, tone }) => (
              <div key={label} className="space-y-1">
                <p className={`text-[11px] font-mono font-bold uppercase tracking-wide ${tone}`}>{label}</p>
                <ul className="space-y-0.5">
                  {items.map((it, i) => (
                    <li key={i} className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono leading-relaxed">· {it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
