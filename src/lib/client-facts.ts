// src/lib/client-facts.ts
//
// Read/write access to client_facts (schema.ts) — the shared fact store
// every product's onboarding is meant to check before asking a question a
// different product, a connected account, or the client's own website
// already answered. See schema.ts's own header comment on this table for
// why it's a separate suggestion layer and not a change to any product's
// existing storage.
//
// This module deliberately does NOT decide which source wins when more
// than one has a value for the same key, and does NOT call Jev. Those are
// Phase 1's resolver — this is just the store underneath it, the same
// split client-profile.ts already draws between "get/set a value" and
// "decide which fact backs a config field."

import { db } from "@/lib/db";
import { clientFacts, factVerdicts } from "@/models/schema";
import { and, eq } from "drizzle-orm";

// "website" is a value scraped directly from the page (a script signature,
// a footer link); "llm" is a model's reading of the page copy that hasn't
// been scored yet. field-writeback trusts the first outright and never the
// second — an llm fact only reaches config once Jev has scored it (and it
// is rewritten with source "jev") or a human confirms it.
export type ClientFactSource = "website" | "llm" | "account" | "jev" | "user" | "default";
export type ClientFactStatus = "suggested" | "confirmed" | "edited" | "rejected";

export interface ClientFact {
  key: string;
  value: unknown;
  source: ClientFactSource;
  sourceDetail: string | null;
  status: ClientFactStatus;
  confidence: number | null;
  evidence: string | null;
  updatedAt: Date;
}

function toClientFact(row: typeof clientFacts.$inferSelect): ClientFact {
  return {
    key: row.key,
    value: row.value,
    source: row.source as ClientFactSource,
    sourceDetail: row.sourceDetail,
    status: row.status as ClientFactStatus,
    confidence: row.confidence,
    evidence: row.evidence,
    updatedAt: row.updatedAt,
  };
}

/**
 * Writes (or replaces) one fact for one engagement. A human's decision is
 * never silently undone by a fresh crawl, a re-run harvest, or a resolver:
 *   - a "confirmed" or "edited" row is left alone;
 *   - a "rejected" row is left alone when the new value is the same one
 *     the human rejected — a genuinely different value (they connected a
 *     different platform, the site changed) is suggested again.
 * Only a caller acting on a human's own input passes
 * `allowOverwriteConfirmed` (editClientFact does). Callers that only ever
 * write "suggested" facts (discover-client.ts, harvests, resolvers) leave
 * it false.
 */
export async function upsertClientFact(
  engagementId: string,
  key: string,
  value: unknown,
  opts: {
    source: ClientFactSource;
    sourceDetail?: string;
    status?: ClientFactStatus;
    confidence?: number;
    evidence?: string;
    allowOverwriteConfirmed?: boolean;
  }
): Promise<void> {
  const [existing] = await db
    .select({ id: clientFacts.id, status: clientFacts.status, value: clientFacts.value })
    .from(clientFacts)
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)))
    .limit(1);

  if (existing && !opts.allowOverwriteConfirmed) {
    if (existing.status === "confirmed" || existing.status === "edited") return;
    if (existing.status === "rejected" && sameFactValue(existing.value, value)) return;
  }

  const patch = {
    value: value as any,
    source: opts.source,
    sourceDetail: opts.sourceDetail ?? null,
    status: opts.status ?? "suggested",
    confidence: opts.confidence ?? null,
    evidence: opts.evidence ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(clientFacts).set(patch).where(eq(clientFacts.id, existing.id));
  } else {
    await db.insert(clientFacts).values({ engagementId, key, ...patch });
  }
}

/** Every fact on file for one engagement, keyed by fact key. */
export async function getClientFacts(engagementId: string): Promise<Record<string, ClientFact>> {
  const rows = await db.select().from(clientFacts).where(eq(clientFacts.engagementId, engagementId));
  const out: Record<string, ClientFact> = {};
  for (const row of rows) {
    out[row.key] = toClientFact(row);
  }
  return out;
}

/** One fact by key, or null if nothing's been suggested/confirmed for it yet. */
export async function getClientFact(engagementId: string, key: string): Promise<ClientFact | null> {
  const [row] = await db
    .select()
    .from(clientFacts)
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)))
    .limit(1);
  return row ? toClientFact(row) : null;
}

/**
 * Keeps what was suggested next to what the person did with it (see
 * fact_verdicts in schema.ts), before the fact row changes. Only a
 * suggestion gets a verdict: re-confirming a confirmed fact, or editing
 * one the person already edited, says nothing new about the source.
 * Best-effort: a failed write never blocks the person's action.
 */
async function recordVerdict(engagementId: string, key: string, verdict: "confirmed" | "edited" | "rejected", finalValue?: unknown): Promise<void> {
  try {
    const before = await getClientFact(engagementId, key);
    if (!before || before.status !== "suggested") return;
    await db.insert(factVerdicts).values({
      engagementId,
      key,
      verdict,
      suggestedValue: before.value,
      suggestedSource: before.source,
      suggestedConfidence: before.confidence,
      finalValue: verdict === "edited" ? (finalValue ?? null) : null,
    });
  } catch (err) {
    console.warn(`[client-facts] couldn't record the ${verdict} verdict on ${key} for ${engagementId}:`, err instanceof Error ? err.message : err);
  }
}

/** Marks a fact confirmed as-is — the "use this" half of a confirm chip. */
export async function confirmClientFact(engagementId: string, key: string): Promise<void> {
  await recordVerdict(engagementId, key, "confirmed");
  await db
    .update(clientFacts)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)));
}

/** Records a human edit over a suggestion — the "override" half of a confirm chip. */
export async function editClientFact(engagementId: string, key: string, value: unknown): Promise<void> {
  await recordVerdict(engagementId, key, "edited", value);
  await upsertClientFact(engagementId, key, value, { source: "user", status: "edited", allowOverwriteConfirmed: true });
}

/** Records a human "that's not right" — kept (not deleted) so the same
 * value isn't suggested again; see upsertClientFact. */
export async function rejectClientFact(engagementId: string, key: string): Promise<void> {
  await recordVerdict(engagementId, key, "rejected");
  await db
    .update(clientFacts)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)));
}

/** Order-insensitive for object keys, so {a,b} and {b,a} compare equal. */
export function sameFactValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value.trim());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Called when a dossier saves: for every field that had a suggestion
 * behind it, records what the human did with it, so the store can tell a
 * human-approved value from a guess and stops re-suggesting what they
 * changed. Kept the suggestion -> confirmed. Saved something different ->
 * edited (with the saved value). Left it empty -> untouched (still a
 * suggestion; not a rejection, they may just not have got to it).
 */
export async function recordDossierDecisions(engagementId: string, saved: Record<string, unknown>): Promise<void> {
  const facts = await getClientFacts(engagementId);
  for (const [key, savedValue] of Object.entries(saved)) {
    const fact = facts[key];
    if (!fact || fact.status !== "suggested") continue;
    const empty =
      savedValue === undefined ||
      savedValue === null ||
      (typeof savedValue === "string" && !savedValue.trim()) ||
      (Array.isArray(savedValue) && savedValue.length === 0);
    if (empty) continue;
    if (sameFactValue(fact.value, savedValue)) {
      await confirmClientFact(engagementId, key);
    } else {
      await editClientFact(engagementId, key, savedValue);
    }
  }
}
