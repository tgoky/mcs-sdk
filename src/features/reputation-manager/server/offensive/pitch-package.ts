import { db } from "@/lib/db";
import { repPitchTargets } from "@/models/schema";
import { and, desc, eq } from "drizzle-orm";
import { callClaude, MODEL } from "@/lib/llm";

/**
 * Move B — Tier-1 press outreach (offensive/pitch-package.md). Every
 * function here manages the target list and drafts pitch copy; nothing
 * sends anything. The template is explicit that outreach has to come
 * "from your own email" with personalization as the actual point — a
 * one-click send would defeat the tactic, not scale it.
 */

export type PitchHistoryEntry = {
  type: "sent" | "follow_up" | "reply" | "placement" | "declined";
  note: string | null;
  occurredAt: string;
};

export type PitchTargetStatus = "not_contacted" | "sent" | "followed_up" | "replied" | "placed" | "declined";

export interface PitchTargetRow {
  id: string;
  target: string;
  beat: string | null;
  contact: string | null;
  channel: string | null;
  fitNotes: string | null;
  status: PitchTargetStatus;
  history: PitchHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export async function listPitchTargets(engagementId: string): Promise<PitchTargetRow[]> {
  const rows = await db
    .select()
    .from(repPitchTargets)
    .where(eq(repPitchTargets.engagementId, engagementId))
    .orderBy(desc(repPitchTargets.createdAt));
  return rows as PitchTargetRow[];
}

export interface PitchTargetInput {
  target: string;
  beat?: string | null;
  contact?: string | null;
  channel?: string | null;
  fitNotes?: string | null;
}

export async function createPitchTarget(engagementId: string, input: PitchTargetInput): Promise<PitchTargetRow> {
  if (!input.target?.trim()) throw new Error("Target name is required.");
  const [row] = await db
    .insert(repPitchTargets)
    .values({
      engagementId,
      target: input.target.trim(),
      beat: input.beat?.trim() || null,
      contact: input.contact?.trim() || null,
      channel: input.channel?.trim() || null,
      fitNotes: input.fitNotes?.trim() || null,
    })
    .returning();
  return row as PitchTargetRow;
}

export async function deletePitchTarget(engagementId: string, targetId: string): Promise<void> {
  await db.delete(repPitchTargets).where(and(eq(repPitchTargets.id, targetId), eq(repPitchTargets.engagementId, engagementId)));
}

const STATUS_FOR_HISTORY_TYPE: Record<PitchHistoryEntry["type"], PitchTargetStatus> = {
  sent: "sent",
  follow_up: "followed_up",
  reply: "replied",
  placement: "placed",
  declined: "declined",
};

/**
 * Records one outreach event (the operator did this themselves — sent an
 * email, got a reply, etc.) and rolls the target's status forward to
 * match, per the template's own cadence rule: "one follow-up only, a
 * second is noise." This function doesn't enforce that rule mechanically
 * (an operator can still log a second follow-up if they judge it right),
 * it just records what actually happened.
 */
export async function logPitchEvent(
  engagementId: string,
  targetId: string,
  entry: { type: PitchHistoryEntry["type"]; note?: string | null }
): Promise<PitchTargetRow> {
  const [existing] = await db
    .select({ history: repPitchTargets.history })
    .from(repPitchTargets)
    .where(and(eq(repPitchTargets.id, targetId), eq(repPitchTargets.engagementId, engagementId)))
    .limit(1);

  if (!existing) throw new Error("Pitch target not found.");

  const newEntry: PitchHistoryEntry = { type: entry.type, note: entry.note?.trim() || null, occurredAt: new Date().toISOString() };
  const history = [...existing.history, newEntry];

  const [row] = await db
    .update(repPitchTargets)
    .set({ history, status: STATUS_FOR_HISTORY_TYPE[entry.type], updatedAt: new Date() })
    .where(and(eq(repPitchTargets.id, targetId), eq(repPitchTargets.engagementId, engagementId)))
    .returning();

  return row as PitchTargetRow;
}

export type PitchArchetype = "systems" | "contrarian" | "data";

const ARCHETYPE_GUIDANCE: Record<PitchArchetype, string> = {
  systems: "The systems pitch: frame the subject as having built a repeatable system or process worth explaining, not just a result.",
  contrarian: "The contrarian pitch: lead with a belief that cuts against the conventional wisdom in this beat, backed by real experience.",
  data: "The data pitch: lead with one specific, verifiable proof point (a number, a result, a before/after) and let the story follow from it.",
};

/**
 * Drafts pitch copy for one target using the template's own skeleton
 * (Subject / one-line who-you-are / two-sentence angle with a proof point
 * / the ask / soft close) and voice rules ("no em dashes, no exclamation
 * points, send from your own email"). Output is a draft for the operator
 * to personalize and send themselves — never sent by this function.
 */
export async function draftPitch(input: {
  operatorName: string;
  entityName: string | null;
  target: string;
  beat: string | null;
  fitNotes: string | null;
  archetype: PitchArchetype;
}): Promise<{ subject: string; body: string }> {
  const system =
    "You draft cold outreach pitches for press/newsletter/podcast placements, following a strict skeleton and voice. " +
    "Skeleton: Subject line, one line on who the sender is, a two-sentence angle including one concrete proof point, " +
    "a specific ask, a soft close. Voice rules: no em dashes, no exclamation points, no hype language, short " +
    "sentences, written as if the sender will personalize and send it themselves from their own email. " +
    `${ARCHETYPE_GUIDANCE[input.archetype]} ` +
    'Respond with ONLY a JSON object: {"subject": "string", "body": "string"} — no markdown fences, no preamble.';

  const userMessage = [
    `Sender: ${input.operatorName}${input.entityName ? ` (${input.entityName})` : ""}`,
    `Target: ${input.target}${input.beat ? ` — beat: ${input.beat}` : ""}`,
    input.fitNotes ? `Why this target fits: ${input.fitNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callClaude({ model: MODEL.SYNTHESIS, system, userMessage, maxTokens: 600 });

  try {
    const jsonText = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      throw new Error("Response missing subject/body strings.");
    }
    return { subject: parsed.subject, body: parsed.body };
  } catch (err) {
    throw new Error(`Pitch draft could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
