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
  status: "active" | "rebooked" | "lost" | "reply_exited";
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

export type RunDetailPayload = PreCallReadDetail | PileOnDetail | WinBackDetail | LeakMapDetail | PinDownDetail;
