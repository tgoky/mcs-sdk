import { db } from "@/lib/db";
import { engagements, auditRunsLog, metricsBenchmark } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Leak Map recovery gap 7 — cross-client anonymized benchmarks. Per the
 * transfer analysis: "not a recovery, but the highest-leverage new
 * capability... the single feature category where being multi-tenant is
 * itself the moat."
 *
 * K-ANONYMITY: a bucket is only ever published (written to
 * metricsBenchmark) when at least 20 distinct tenants contributed to it —
 * enforced in computeAndPersistBenchmarks below, not just documented.
 * Below that floor, a percentile is potentially reverse-engineerable to
 * one specific tenant's number (e.g. a bucket of 2 tenants' p50 tells you
 * almost exactly what both of them are doing), which would turn a
 * competitive-intelligence feature into a data leak between competing
 * buyers in the same vertical. This floor is the actual safety mechanism,
 * not a nice-to-have.
 */

const PRICE_BUCKETS: Array<{ max: number; label: string }> = [
  { max: 2000, label: "under_2k" },
  { max: 5000, label: "2k_5k" },
  { max: 10000, label: "5k_10k" },
  { max: 25000, label: "10k_25k" },
  { max: 50000, label: "25k_50k" },
  { max: Infinity, label: "50k_plus" },
];

const PRICE_BUCKET_DISPLAY: Record<string, string> = {
  under_2k: "under $2k",
  "2k_5k": "$2k-5k",
  "5k_10k": "$5k-10k",
  "10k_25k": "$10k-25k",
  "25k_50k": "$25k-50k",
  "50k_plus": "$50k+",
};

/** Parses a free-text price string ("$10,000", "10k", "~$4,500/mo") down to a bucket label. */
function priceToBucket(priceRaw: string | undefined): string | null {
  if (!priceRaw) return null;
  const cleaned = priceRaw.toLowerCase().replace(/[,$]/g, "").trim();
  const kMatch = cleaned.match(/([\d.]+)\s*k/);
  const numMatch = cleaned.match(/[\d.]+/);
  let value: number | null = null;
  if (kMatch) value = parseFloat(kMatch[1]) * 1000;
  else if (numMatch) value = parseFloat(numMatch[0]);
  if (value === null || Number.isNaN(value)) return null;

  for (const bucket of PRICE_BUCKETS) {
    if (value <= bucket.max) return bucket.label;
  }
  return PRICE_BUCKETS[PRICE_BUCKETS.length - 1].label;
}

export function computeBucketKey(offerDetails: { traffic_temperature?: string; price?: string; vertical?: string } | null): string | null {
  if (!offerDetails) return null;
  const priceBucket = priceToBucket(offerDetails.price);
  const temp = offerDetails.traffic_temperature;
  const vertical = offerDetails.vertical?.trim().toLowerCase();
  if (!priceBucket || !temp || !vertical) return null; // Need all three dimensions for a meaningful bucket
  return `${temp}|${priceBucket}|${vertical}`;
}

function bucketToDisplay(bucket: string): string {
  const [temp, priceBucket, vertical] = bucket.split("|");
  return `${temp}-traffic ${vertical} offers in the ${PRICE_BUCKET_DISPLAY[priceBucket] ?? priceBucket} bucket`;
}

/**
 * Looks up a benchmark line per metric for the report synthesis prompt.
 * Every metric without a same-bucket benchmark on file (new bucket, or
 * one that hasn't cleared the k-anonymity floor yet) is silently skipped
 * — no line, not a placeholder saying "no benchmark available," since
 * that would just be noise in the report for anything outside a handful
 * of common buckets in the early days of this feature.
 */
export async function getBenchmarkLines(
  offerDetails: { traffic_temperature?: string; price?: string; vertical?: string } | null,
  metrics: Array<{ name: string; current: number; insufficientData: boolean }>
): Promise<string[]> {
  const bucket = computeBucketKey(offerDetails);
  if (!bucket) return [];

  const metricNames = metrics.filter((m) => !m.insufficientData).map((m) => m.name);
  if (metricNames.length === 0) return [];

  const rows = await db
    .select()
    .from(metricsBenchmark)
    .where(sql`${metricsBenchmark.bucket} = ${bucket} AND ${metricsBenchmark.metricName} IN ${metricNames}`);

  const lines: string[] = [];
  for (const metric of metrics) {
    const row = rows.find((r) => r.metricName === metric.name);
    if (!row) continue;
    lines.push(
      `Your ${metric.name.toLowerCase()} is ${metric.current}; median for ${bucketToDisplay(bucket)} is ${row.p50} (n=${row.sampleSize} engagements, p25=${row.p25}, p75=${row.p75}).`
    );
  }
  return lines;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Nightly aggregation — walks the most recent completed audit run per
 * engagement (one representative "current state" value per tenant, not
 * every historical run, so a tenant that's been audited 50 times doesn't
 * get 50x the weight of one audited twice), buckets by
 * traffic_temperature + price_bucket + vertical, and writes a
 * metricsBenchmark row per (metric, bucket) pair that clears the
 * k-anonymity floor (>= 20 distinct engagements).
 */
export async function computeAndPersistBenchmarks(): Promise<{ bucketsComputed: number; bucketsPublished: number; bucketsSuppressed: number }> {
  const K_ANONYMITY_FLOOR = 20;

  // Latest audit run per engagement via DISTINCT ON, so each tenant
  // contributes exactly one data point per metric regardless of audit
  // history length.
  const latestRuns = await db.execute(sql`
    SELECT DISTINCT ON (engagement_id) engagement_id, top_issues
    FROM ${auditRunsLog}
    ORDER BY engagement_id, created_at DESC
  `);

  const tenantOffers = await db.select({ engagementId: engagements.engagementId, offerDetails: engagements.offerDetails }).from(engagements);
  const offersByEngagement = new Map(tenantOffers.map((t) => [t.engagementId, t.offerDetails]));

  // bucket -> metricName -> values[]
  const buckets = new Map<string, Map<string, number[]>>();

  for (const row of latestRuns as unknown as any[]) {
    const offerDetails = offersByEngagement.get(row.engagement_id) as any;
    const bucketKey = computeBucketKey(offerDetails);
    if (!bucketKey) continue;

    const topIssues: Array<{ name: string; current: number }> = row.top_issues ?? [];
    for (const issue of topIssues) {
      if (typeof issue.current !== "number") continue;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, new Map());
      const metricMap = buckets.get(bucketKey)!;
      if (!metricMap.has(issue.name)) metricMap.set(issue.name, []);
      metricMap.get(issue.name)!.push(issue.current);
    }
  }

  let bucketsComputed = 0;
  let bucketsPublished = 0;
  let bucketsSuppressed = 0;
  const now = new Date();

  for (const [bucketKey, metricMap] of buckets) {
    for (const [metricName, values] of metricMap) {
      bucketsComputed++;
      if (values.length < K_ANONYMITY_FLOOR) {
        bucketsSuppressed++;
        continue;
      }
      const sorted = [...values].sort((a, b) => a - b);
      const p25 = percentile(sorted, 25).toFixed(1);
      const p50 = percentile(sorted, 50).toFixed(1);
      const p75 = percentile(sorted, 75).toFixed(1);
      const p90 = percentile(sorted, 90).toFixed(1);

      const existing = await db
        .select({ id: metricsBenchmark.id })
        .from(metricsBenchmark)
        .where(sql`${metricsBenchmark.metricName} = ${metricName} AND ${metricsBenchmark.bucket} = ${bucketKey}`)
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(metricsBenchmark)
          .set({ sampleSize: values.length, p25, p50, p75, p90, lastComputedAt: now })
          .where(eq(metricsBenchmark.id, existing[0].id));
      } else {
        await db.insert(metricsBenchmark).values({
          metricName,
          bucket: bucketKey,
          sampleSize: values.length,
          p25,
          p50,
          p75,
          p90,
          lastComputedAt: now,
        });
      }
      bucketsPublished++;
    }
  }

  return { bucketsComputed, bucketsPublished, bucketsSuppressed };
}
