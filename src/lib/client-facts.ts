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
import { clientFacts } from "@/models/schema";
import { and, eq } from "drizzle-orm";

export type ClientFactSource = "website" | "account" | "jev" | "user" | "default";
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
 * Writes (or replaces) one fact for one engagement. Never overwrites a
 * `status: "confirmed"` row unless the caller explicitly asks to
 * (`allowOverwriteConfirmed`) — a human's confirmed answer shouldn't get
 * silently clobbered by a fresh crawl or a re-run harvest just because it
 * happened to run again. Callers that only ever write "suggested" facts
 * (discover-client.ts, an account harvest) should leave this false.
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
    .select({ id: clientFacts.id, status: clientFacts.status })
    .from(clientFacts)
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)))
    .limit(1);

  if (existing && existing.status === "confirmed" && !opts.allowOverwriteConfirmed) {
    return;
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

/** Marks a fact confirmed as-is — the "use this" half of a confirm chip. */
export async function confirmClientFact(engagementId: string, key: string): Promise<void> {
  await db
    .update(clientFacts)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(and(eq(clientFacts.engagementId, engagementId), eq(clientFacts.key, key)));
}

/** Records a human edit over a suggestion — the "override" half of a confirm chip. */
export async function editClientFact(engagementId: string, key: string, value: unknown): Promise<void> {
  await upsertClientFact(engagementId, key, value, { source: "user", status: "edited", allowOverwriteConfirmed: true });
}
