import type { EngagementStack } from "@/models/schema";

export interface BrandVoiceProfile {
  source_path: "ai_extracted" | "default";
  fallback_reason?: string;
  corpus_word_count: number;
  extracted_at?: string;
  tone: {
    formal_casual: { score: number; note: string };
    technical_plain: { score: number; note: string };
    warm_neutral: { score: number; note: string };
  };
  vocabulary: { signature: string[]; brand_terms: string[] };
  sentence_length: { short_pct: number; medium_pct: number; long_pct: number };
  banned_phrases: Array<{ phrase: string; confidence: number }>;
}


export interface RunDetailBase {
  id: string;
  skillName: string;
  status: string;
  engagementId: string;
  buyer: string;
  stack: EngagementStack | null;
  offerDetails: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
    hybrid_mode_enabled: boolean;
    vertical?: string;
  } | null;
  brandVoiceProfile: BrandVoiceProfile | null;
  confirmationPageUrl: string | null;
  confirmationPageDeployment: {
    mode: "live" | "paste_ready" | "not_deployed" | "pending_review";
    deployedVia?: string;
    reason?: string;
    pendingActionId?: string;
    lastAttemptedAt: string;
  } | null;
  pasteReadyHtml: string | null;
  pasteReadyInstructions: string | null;
  adCreativeBriefs: {
    generatedAt: string;
    objectionsLastRegeneratedAt?: string;
    briefs: Array<{
      id: string;
      pillar: "common_questions" | "deeper_questions" | "success_proof" | "objections";
      hook: string;
      angle: string;
      talkingPoints: string[];
      suggestedFormat: string;
      cta: string;
    }>;
  } | null;
  pinDownScriptPack: {
    generatedAt: string;
    heroScript: {
      title: string;
      targetLengthSeconds: number;
      chapters: Array<{ timestampLabel: string; beat: string; script: string }>;
      recordingPrompt: string;
    };
    breakoutScripts: Array<{
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
    };
  } | null;
  pinDownPageAudit: {
    auditedUrl: string;
    existingPageStrengths: string[];
    existingPageWeaknesses: string[];
    v1Improvements: string[];
  } | null;
  winBackSequenceAssetMap: {
    windowDays: number;
    generatedAt: string;
    emails: Array<{ id: string; offsetDays: number; subject?: string; body: string }>;
    sms: Array<{ id: string; offsetDays: number; body: string }>;
  } | null;
  winBackCounts: { recovery_count: number; lost_count: number } | null;
}

export interface BriefedCall {
  id: string;
  engagementId: string;
  callId: string;
  runId: string | null;
  callTime: string;
  prospectName: string | null;
  briefDeliveredAt: string | null;
  destinationDelivered: string | null;
  personMatchScore: number | null;
  briefText: string | null;
  researchStatus: string | null;
  aiSynthesisStatus: string | null;
  createdAt: string;
    outcome?: "showed" | "no_show" | "rescheduled" | null;
}

export interface PileOnSend {
  id: string;
  engagementId: string;
  bookingId: string;
  prospectEmail: string;
  runId: string | null;
  sentVia: string;
  personalizedIntro: string | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

// One row per actual send attempt from the durable multi-message sequence
// functions (win-back-sms.ts, win-back-email-smtp.ts, pile-on-sms.ts) —
// previously nothing was recorded for any message past the first, so a
// run's UI had no way to know whether a later message in the sequence
// actually sent.
export interface SequenceMessage {
  id: string;
  engagementId: string;
  runId: string | null;
  sequenceType: "win_back_sms" | "win_back_email_smtp" | "pile_on_sms";
  enrollmentId: string | null;
  bookingId: string | null;
  messageId: string;
  channel: "sms" | "email";
  prospectEmail: string | null;
  prospectPhone: string | null;
  status: "sent" | "failed";
  error: string | null;
  sentAt: string;
  createdAt: string;
}

export interface WinBackEnrollment {
  id: string;
  engagementId: string;
  prospectEmail: string;
  prospectName: string | null;
  runId: string | null;
  enrolledAt: string;
  recoveryWindowDays: number;
  // Real status set, verified against every `.set({ status: ... })` write
  // site: enrollment-service.ts (rebooked), lost-deal-sweep.ts (lost),
  // win-back-reply.ts (reply_exited), stop/route.ts (manual_override),
  // outcome-resolution.ts (corrected). This type previously only listed 4
  // of the 6 — manual_override and corrected were missing, which meant
  // ENROLLMENT_META[enrollment.status] in win-back-view.tsx had no entry
  // for either and would throw reading .label/.tone off undefined the
  // first time either status was opened.
  status: "active" | "rebooked" | "lost" | "reply_exited" | "manual_override" | "corrected";
  lostAt: string | null;
  freshRescheduleLink: string | null;
  exitReason: string | null;
  exitedAt: string | null;
  createdAt: string;
}

export interface WinBackSendLogRow {
  id: string;
  engagementId: string;
  enrollmentId: string;
  prospectEmail: string;
  sentVia: string;
  personalizedOpening: string | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface TopIssue {
  name: string;
  current: number;
  prior: number;
  delta: number;
  severity: "high" | "medium" | "low" | "none";
  /** True when this metric's sample was below the statistical floor —
   * severity is forced to "none" in that case too, so this is the only
   * way to tell "confirmed healthy" apart from "not enough data to know
   * yet." See MetricResult in audit-engine.ts, the source of truth this
   * is persisted from. Optional because audit runs recorded before this
   * field existed won't have it — treated as false (today's behavior)
   * rather than breaking on old rows.
   */
  insufficientData?: boolean;
}

export interface AuditRow {
  id: string;
  engagementId: string;
  runType: string;
  runId: string | null;
  topIssues: TopIssue[] | null;
  alertsFired: string[] | null;
  gaps: string[] | null;
  reportMarkdown: string | null;
  createdAt: string;
}

export type PreCallReadDetail = { run: RunDetailBase; calls: BriefedCall[] };
export type PileOnDetail = { run: RunDetailBase; send: PileOnSend | null; smsMessages: SequenceMessage[] };
export type WinBackDetail = { run: RunDetailBase; enrollment: WinBackEnrollment | null; sendLog: WinBackSendLogRow[] };
export type LeakMapDetail = { run: RunDetailBase; audit: AuditRow | null };
export type PinDownDetail = { run: RunDetailBase };

// ── Reputation Manager run-detail shapes ────────────────────────────────
// Same RunDetailBase `run` field every Showtime detail type above uses —
// the API route's initial select always pulls the full engagement row
// regardless of skill, so there's nothing RM-specific about that half.
// Only the second field (what this particular skill produced) differs
// per skill, same as Showtime's own PreCallReadDetail/PileOnDetail/etc.

export interface RepEntityLite {
  name: string;
  aliases: string[];
  type: "company" | "brand" | "product" | "service" | "publication";
  domainsOwned: string[];
  highPriority: boolean;
}

export interface RepIdentityGraphRow {
  id: string;
  operatorName: string;
  operatorAliases: string[];
  soleAuthorityName: string;
  entities: RepEntityLite[];
  offerings: { name: string; parentEntityName: string }[];
  competitors: { name: string; highPriority: boolean }[];
  collisions: { name: string; whoTheyAre: string; disambiguationNote: string; source: "buyer" | "collision_check" }[];
  seedPanelPrompts: string[];
  crisisThresholdOverride: number | null;
  collisionCheckRunAt: string | null;
}

export interface RepEngineFindingRow {
  id: string;
  engineId: string;
  promptText: string;
  responseText: string;
  sentiment: "positive" | "neutral" | "negative";
  flagged: boolean;
  flagReason: string | null;
  runAt: string;
}

export interface RepTrustpilotReviewRow {
  id: string;
  externalReviewId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string;
  publishedAt: string | null;
  sentiment: "positive" | "neutral" | "negative";
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
}

export interface RepRedditMentionRow {
  id: string;
  subreddit: string;
  author: string | null;
  permalink: string;
  mentionText: string;
  publishedAt: string | null;
  sentiment: "positive" | "neutral" | "negative";
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
}

export interface RepTwitterMentionRow {
  id: string;
  author: string | null;
  permalink: string;
  mentionText: string;
  publishedAt: string | null;
  sentiment: "positive" | "neutral" | "negative";
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
}

export interface RepIncidentContributingFinding {
  source: "engine_panel" | "trustpilot" | "reddit" | "twitter" | "anomaly";
  excerpt: string;
  flagReason: string | null;
  reach?: number;
  sentiment?: number;
  permanence?: number;
  compositeScore?: number;
  signalClass?: string | null;
}

export interface RepIncidentRow {
  id: string;
  severityScore: number;
  summary: string;
  contributingFindings: RepIncidentContributingFinding[];
  signalClass: string | null;
  status: string;
  declaredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export type RepOnboardingDetail = { run: RunDetailBase; identityGraph: RepIdentityGraphRow | null };
export type RepEnginePanelDetail = { run: RunDetailBase; findings: RepEngineFindingRow[] };
export type RepTrustpilotWatchDetail = { run: RunDetailBase; reviews: RepTrustpilotReviewRow[] };
export type RepRedditWatchDetail = { run: RunDetailBase; mentions: RepRedditMentionRow[] };
export type RepTwitterWatchDetail = { run: RunDetailBase; mentions: RepTwitterMentionRow[] };
export type RepCrisisResponseDetail = { run: RunDetailBase; incident: RepIncidentRow | null };

export type RunDetailPayload =
  | PreCallReadDetail
  | PileOnDetail
  | WinBackDetail
  | LeakMapDetail
  | PinDownDetail
  | RepOnboardingDetail
  | RepEnginePanelDetail
  | RepTrustpilotWatchDetail
  | RepRedditWatchDetail
  | RepTwitterWatchDetail
  | RepCrisisResponseDetail;
