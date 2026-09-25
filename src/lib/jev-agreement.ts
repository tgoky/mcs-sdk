// src/lib/jev-agreement.ts
//
// How often people agree with what was suggested, by fact key and by how
// sure the source was: the evidence for moving a threshold (fact-trust.ts),
// or the pinned Jev version (jev.ts), rather than guessing. Reads
// fact_verdicts (every confirm, edit and reject of a suggestion) and
// jev_readings (every Jev call). Admin-only: it spans every client.

import { db } from "@/lib/db";
import { factVerdicts, jevReadings } from "@/models/schema";
import { and, eq, gte, sql } from "drizzle-orm";

/** Confidence bands, matching the trust tiers (ask < 45 <= likely < 75 <= done). */
export const CONFIDENCE_BUCKETS = [
  { label: "unscored", min: null, max: null },
  { label: "0-44", min: 0, max: 44 },
  { label: "45-74", min: 45, max: 74 },
  { label: "75-89", min: 75, max: 89 },
  { label: "90-100", min: 90, max: 100 },
] as const;

export type ConfidenceBucket = (typeof CONFIDENCE_BUCKETS)[number]["label"];

export function bucketFor(confidence: number | null | undefined): ConfidenceBucket {
  if (confidence === null || confidence === undefined) return "unscored";
  for (const b of CONFIDENCE_BUCKETS) if (b.min !== null && confidence >= b.min && confidence <= b.max) return b.label;
  return confidence > 100 ? "90-100" : "0-44";
}

export interface AgreementRow {
  key: string;
  bucket: ConfidenceBucket;
  confirmed: number;
  edited: number;
  rejected: number;
  total: number;
  /** confirmed / total: how often the suggestion was right as given. */
  agreement: number;
}

/** Folds raw verdict counts into rows per key and bucket, most-seen first. */
export function summarizeVerdicts(rows: { key: string; confidence: number | null; verdict: string; n: number }[]): AgreementRow[] {
  const map = new Map<string, AgreementRow>();
  for (const r of rows) {
    const bucket = bucketFor(r.confidence);
    const id = `${r.key}|${bucket}`;
    const row = map.get(id) ?? { key: r.key, bucket, confirmed: 0, edited: 0, rejected: 0, total: 0, agreement: 0 };
    if (r.verdict === "confirmed") row.confirmed += r.n;
    else if (r.verdict === "edited") row.edited += r.n;
    else if (r.verdict === "rejected") row.rejected += r.n;
    else continue;
    row.total += r.n;
    map.set(id, row);
  }
  const order = CONFIDENCE_BUCKETS.map((b) => b.label as string);
  return [...map.values()]
    .map((r) => ({ ...r, agreement: r.total ? Math.round((r.confirmed / r.total) * 1000) / 1000 : 0 }))
    .sort((a, b) => a.key.localeCompare(b.key) || order.indexOf(a.bucket) - order.indexOf(b.bucket));
}

export async function agreementReport(opts: { source?: string; sinceDays?: number } = {}): Promise<AgreementRow[]> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 90) * 24 * 60 * 60 * 1000);
  const where = opts.source ? and(gte(factVerdicts.createdAt, since), eq(factVerdicts.suggestedSource, opts.source)) : gte(factVerdicts.createdAt, since);
  const rows = await db
    .select({ key: factVerdicts.key, confidence: factVerdicts.suggestedConfidence, verdict: factVerdicts.verdict, n: sql<number>`count(*)::int` })
    .from(factVerdicts)
    .where(where)
    .groupBy(factVerdicts.key, factVerdicts.suggestedConfidence, factVerdicts.verdict);
  return summarizeVerdicts(rows);
}

export interface ReadingSummaryRow {
  purpose: string;
  modelServed: string | null;
  calls: number;
  failed: number;
  avgLatencyMs: number;
  costInCents: number;
}

/** Jev calls by purpose and the version that answered: volume, failures, speed and cost. */
export async function readingSummary(opts: { sinceDays?: number } = {}): Promise<ReadingSummaryRow[]> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 30) * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      purpose: jevReadings.purpose,
      modelServed: jevReadings.modelServed,
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${jevReadings.error} is not null)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${jevReadings.latencyMs}), 0)::int`,
      costInCents: sql<number>`coalesce(sum(${jevReadings.costInCents}), 0)::float8`,
    })
    .from(jevReadings)
    .where(gte(jevReadings.createdAt, since))
    .groupBy(jevReadings.purpose, jevReadings.modelServed);
  return rows.sort((a, b) => b.calls - a.calls);
}
