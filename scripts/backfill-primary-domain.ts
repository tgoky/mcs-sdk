// scripts/backfill-primary-domain.ts
//
// One-time backfill for engagements.primaryDomain (Phase 4, shared
// client profile — see src/lib/client-profile.ts). getPrimaryDomainForEngagement
// already re-derives this on every read for engagements that predate the
// column, so this script isn't required for correctness — it's purely so
// the shared column becomes authoritative going forward instead of every
// caller re-deriving it from stack/repIdentityGraphs indefinitely.
//
// Dry-run by default, same convention as the other scripts in this
// directory. Never overwrites an engagement that already has
// primaryDomain set.
//
// Usage:
//   npx tsx scripts/backfill-primary-domain.ts
//   npx tsx scripts/backfill-primary-domain.ts --yes
//
// Requires DIRECT_URL (or DATABASE_URL as a fallback) in .env.

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull, inArray } from "drizzle-orm";
import { engagements, repIdentityGraphs, type EngagementStack } from "../src/models/schema";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: neither DIRECT_URL nor DATABASE_URL is set in your .env file.");
  process.exit(1);
}

const CONFIRM = process.argv.includes("--yes");

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

async function main() {
  try {
    const candidates = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, stack: engagements.stack })
      .from(engagements)
      .where(isNull(engagements.primaryDomain));

    if (candidates.length === 0) {
      console.log("Every engagement already has primaryDomain set (or there are no engagements). Nothing to backfill.");
      return;
    }

    const engagementIds = candidates.map((c) => c.engagementId);
    const repGraphRows = await db
      .select({ engagementId: repIdentityGraphs.engagementId, operatorDomains: repIdentityGraphs.operatorDomains })
      .from(repIdentityGraphs)
      .where(inArray(repIdentityGraphs.engagementId, engagementIds));
    const repDomainsByEngagement = new Map(repGraphRows.map((r) => [r.engagementId, r.operatorDomains]));

    const plan: { engagementId: string; buyer: string; domain: string; source: "stack" | "rep" }[] = [];
    for (const c of candidates) {
      const stack = c.stack as Partial<EngagementStack> | null;
      if (stack?.buyer_domain) {
        plan.push({ engagementId: c.engagementId, buyer: c.buyer, domain: stack.buyer_domain, source: "stack" });
        continue;
      }
      const repDomain = repDomainsByEngagement.get(c.engagementId)?.[0];
      if (repDomain) {
        plan.push({ engagementId: c.engagementId, buyer: c.buyer, domain: repDomain, source: "rep" });
      }
    }

    if (plan.length === 0) {
      console.log(`${candidates.length} engagement(s) have no primaryDomain, but none have a stack or identity-graph domain to backfill from either.`);
      return;
    }

    console.log(CONFIRM ? "\nBackfilling:" : "\nDRY RUN — would backfill (pass --yes to actually do it):");
    for (const row of plan) {
      console.log(`  - ${row.buyer} (${row.engagementId}): ${row.domain}  [from ${row.source === "stack" ? "Showtime stack" : "Reputation Manager identity graph"}]`);
    }
    console.log(`\n${candidates.length - plan.length} engagement(s) had neither source and are left untouched.`);

    if (!CONFIRM) {
      console.log("\nNothing has been changed. Re-run with --yes once this list looks right.");
      return;
    }

    for (const row of plan) {
      await db
        .update(engagements)
        .set({ primaryDomain: row.domain, updatedAt: new Date() })
        .where(eq(engagements.engagementId, row.engagementId));
    }

    console.log(`\nBackfilled ${plan.length} engagement(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
