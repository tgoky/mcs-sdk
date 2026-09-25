// src/lib/jev-readings.ts
//
// Writes one jev_readings row per Jev call (see the table's comment in
// schema.ts). Kept apart from jev.ts, which loads it lazily, so the client
// itself stays free of the database for callers and tests that don't log.

import { db } from "@/lib/db";
import { jevReadings } from "@/models/schema";
import type { JevReadingContext } from "@/lib/jev";

export interface JevReadingRow extends JevReadingContext {
  modelRequested: string;
  modelServed: string | null;
  questionCount: number;
  answers: unknown;
  inputTokens: number;
  outputTokens: number;
  costInCents: number;
  latencyMs: number;
  error: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordJevReading(r: JevReadingRow): Promise<void> {
  await db.insert(jevReadings).values({
    engagementId: r.engagementId ?? null,
    // run_id is a uuid column; anything else (a caller's own label) is left out.
    runId: r.runId && UUID.test(r.runId) ? r.runId : null,
    purpose: r.purpose,
    modelRequested: r.modelRequested,
    modelServed: r.modelServed,
    questionCount: r.questionCount,
    answers: r.answers ?? null,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costInCents: r.costInCents,
    latencyMs: r.latencyMs,
    error: r.error ? r.error.slice(0, 1000) : null,
  });
}
