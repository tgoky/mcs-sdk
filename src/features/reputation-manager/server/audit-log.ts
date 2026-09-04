import { db } from "@/lib/db";
import { repAuditEvents } from "@/models/schema";
import { desc, eq } from "drizzle-orm";

/**
 * Typed payloads for mcs/cms's eight audit-log event types
 * (audit-log-schema.md, Section 3.7 of the reputation system spec).
 * Field names here are camelCase; the spec's own snake_case field names
 * are noted per type since that's the vocabulary the spec (and anyone
 * cross-referencing it) uses.
 */
export interface DetectionPayload {
  source: string; // e.g. "chatgpt", "trustpilot", "reddit" (spec: source)
  sourceUrl?: string | null; // spec: source_url
  entityMatched: string; // spec: entity_matched
  mentionText: string; // spec: mention_text
  sentimentLabel?: "negative" | "neutral" | "positive" | null; // spec: sentiment_label
  sentimentConfidence?: number | null; // spec: sentiment_confidence, 0-1
  threatCategory?: string | null; // spec: threat_category
  threatScore?: number | null; // spec: threat_score, 0-100
}

export interface DraftPayload {
  draftClass: string;
  templateUsed?: string | null;
  draftPath: string;
  complianceCheck?: "passed" | "failed" | "pending" | null;
  tier?: number | null;
}

export interface ApprovalPayload {
  approver: string;
  decision: "approved" | "approved_with_edits" | "rejected";
  editCount?: number | null;
  originalHash?: string | null;
  finalHash?: string | null;
}

export interface ExternalActionPayload {
  channel: string;
  actionUrl?: string | null;
  status: "sent" | "failed" | "queued";
}

export interface OutcomePayload {
  outcomeType: string;
  outcomeDetail?: string | null;
  outcomeUrl?: string | null;
}

export interface ComplianceBlockPayload {
  blockReason: string;
  blockDetail?: string | null;
  remediation?: string | null;
}

export interface AiEngineNoticePayload {
  vendor: string;
  spuriousOutput: string;
  promptThatProduced?: string | null;
  evidencePackagePath?: string | null;
  noticeSentAt?: string | null;
  noticeReceivedConfirmation?: string | null;
  persistenceCheckDates?: string[];
}

export interface ReflectionPayload {
  reportPath: string;
  period: "daily" | "weekly" | "monthly";
  eventsReviewed?: number | null;
  falseAlarmRateEstimate?: number | null;
  coverageRateEstimate?: number | null;
}

export type RepAuditEvent =
  | { eventType: "detection"; payload: DetectionPayload }
  | { eventType: "draft"; payload: DraftPayload }
  | { eventType: "approval"; payload: ApprovalPayload }
  | { eventType: "external_action"; payload: ExternalActionPayload }
  | { eventType: "outcome"; payload: OutcomePayload }
  | { eventType: "compliance_block"; payload: ComplianceBlockPayload }
  | { eventType: "ai_engine_notice"; payload: AiEngineNoticePayload }
  | { eventType: "reflection"; payload: ReflectionPayload };

/** Writes one audit event, returning its id for whatever later event chains off it (a draft's parentEventId, etc.). */
export async function logAuditEvent(engagementId: string, event: RepAuditEvent, parentEventId?: string | null): Promise<string> {
  const [row] = await db
    .insert(repAuditEvents)
    .values({
      engagementId,
      eventType: event.eventType,
      parentEventId: parentEventId ?? null,
      payload: event.payload as unknown as Record<string, unknown>,
    })
    .returning({ id: repAuditEvents.id });
  return row.id;
}

/** Bulk write, for a skill that scores many mentions in one run
 * (rep-engine-panel can score up to 46 prompts x 5 engines) — one insert
 * instead of N round trips. All events in a batch share no parent by
 * design; a skill that needs per-event chaining should call
 * logAuditEvent individually instead. */
export async function logAuditEventsBatch(engagementId: string, events: RepAuditEvent[]): Promise<void> {
  if (events.length === 0) return;
  await db.insert(repAuditEvents).values(
    events.map((event) => ({
      engagementId,
      eventType: event.eventType,
      parentEventId: null,
      payload: event.payload as unknown as Record<string, unknown>,
    }))
  );
}

export interface RepAuditEventRow {
  id: string;
  eventType: string;
  parentEventId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** Most recent audit events for one engagement, newest first — the
 * per-client trail the engagement detail page's Audit Log section reads. */
export async function getRecentAuditEvents(engagementId: string, limit = 20): Promise<RepAuditEventRow[]> {
  return db
    .select({
      id: repAuditEvents.id,
      eventType: repAuditEvents.eventType,
      parentEventId: repAuditEvents.parentEventId,
      payload: repAuditEvents.payload,
      createdAt: repAuditEvents.createdAt,
    })
    .from(repAuditEvents)
    .where(eq(repAuditEvents.engagementId, engagementId))
    .orderBy(desc(repAuditEvents.createdAt))
    .limit(limit);
}

/**
 * Chain-integrity check per the spec's own description: "a complete,
 * healthy event chain runs detection -> draft -> approval ->
 * external_action -> outcome." Finds events whose parentEventId doesn't
 * resolve to a real row for this engagement — an orphaned link, per the
 * spec's "reflection skill's integrity check walks these references and
 * flags any broken or orphaned chain." Not run on a schedule anywhere yet
 * (there's no reflection skill built) — exposed here for whenever one is.
 *
 * Reads every event for the engagement, not a capped recent window —
 * a truncated fetch could see a child event without also seeing its
 * (older) parent and misreport a real chain as orphaned.
 */
export async function findOrphanedAuditEvents(engagementId: string): Promise<RepAuditEventRow[]> {
  const rows = await db
    .select({
      id: repAuditEvents.id,
      eventType: repAuditEvents.eventType,
      parentEventId: repAuditEvents.parentEventId,
      payload: repAuditEvents.payload,
      createdAt: repAuditEvents.createdAt,
    })
    .from(repAuditEvents)
    .where(eq(repAuditEvents.engagementId, engagementId));

  const idsPresent = new Set(rows.map((r) => r.id));
  return rows.filter((r) => r.parentEventId !== null && !idsPresent.has(r.parentEventId));
}
