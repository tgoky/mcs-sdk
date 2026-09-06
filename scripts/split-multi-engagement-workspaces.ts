// scripts/split-multi-engagement-workspaces.ts
//
// Enforces "one workspace = one client" by splitting every workspace that
// currently holds more than one live engagement into N single-engagement
// workspaces. This is the actual Phase 1 migration from the architecture
// discussion — see scripts/audit-multi-engagement-workspaces.ts first,
// always, before running this for real.
//
// What this does NOT do: merge the `workspaces` and `engagements` tables.
// Almost everything that makes a client a client (skillRuns,
// credentialsRefs, repIdentityGraphs, engagementSkills, projectEngagements)
// is already keyed off engagementId, not workspaceId — none of that moves.
// Only two things are keyed off workspaceId directly, and both are handled
// explicitly below:
//   1. workspacePackages ("is product X installed for this workspace") —
//      re-derived per split-off engagement from real evidence (a non-null
//      `stack` for showtime, an existing repIdentityGraphs row for
//      reputation-manager), NOT blindly copied. An engagement that never
//      touched a product doesn't inherit "installed" just because a
//      sibling engagement in the old workspace had it on.
//   2. credentialVault rows a moved engagement actually links to (via
//      credentialsRefs.vaultId) — duplicated into the engagement's new
//      workspace so nothing breaks, and the engagement's own
//      credentialsRefs row is repointed at the duplicate. Any OTHER
//      engagement that shared that same vault row is untouched.
//
// Per-workspace rule for which engagement keeps the existing workspaceId:
// the oldest live engagement (by createdAt) stays put; every other live
// engagement in that workspace gets promoted to a brand-new workspace.
// Review scripts/audit-multi-engagement-workspaces.ts's output first if
// that default isn't what you want for a given workspace — override with
// --primary <engagementId> when scoping to a single workspace via --only.
//
// SAFETY: dry-run by default. Nothing is written unless --execute is
// passed. Strongly recommended: run with --only <workspaceId> the first
// few times rather than every multi-engagement workspace at once.
//
// Usage:
//   npx tsx scripts/split-multi-engagement-workspaces.ts                        # dry run, every workspace
//   npx tsx scripts/split-multi-engagement-workspaces.ts --only ws_abc123       # dry run, one workspace
//   npx tsx scripts/split-multi-engagement-workspaces.ts --only ws_abc123 --primary eng_foo --execute
//   npx tsx scripts/split-multi-engagement-workspaces.ts --execute             # applies to every workspace found
//
// Requires DIRECT_URL (or DATABASE_URL as a fallback) in .env.

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, inArray } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  workspaces,
  engagements,
  workspacePackages,
  credentialsRefs,
  credentialVault,
  repIdentityGraphs,
} from "../src/models/schema";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: neither DIRECT_URL nor DATABASE_URL is set in your .env file.");
  process.exit(1);
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const onlyIndex = args.indexOf("--only");
const ONLY_WORKSPACE_ID = onlyIndex !== -1 ? args[onlyIndex + 1] : null;
const primaryIndex = args.indexOf("--primary");
const OVERRIDE_PRIMARY_ENGAGEMENT_ID = primaryIndex !== -1 ? args[primaryIndex + 1] : null;

if (OVERRIDE_PRIMARY_ENGAGEMENT_ID && !ONLY_WORKSPACE_ID) {
  console.error("--primary requires --only <workspaceId> — it doesn't make sense across multiple workspaces at once.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

/** Turns "eng_mudd_ventures_msg8wc5y" into "ws_mudd_ventures_msg8wc5y" —
 * deterministic and human-recognizable, and collision-free since
 * engagementId is already globally unique. */
function newWorkspaceIdFor(engagementId: string): string {
  return `ws_${engagementId.replace(/^eng_/, "")}`;
}

interface MutationLogEntry {
  engagementId: string;
  buyer: string;
  oldWorkspaceId: string;
  newWorkspaceId: string;
  reDerivedPackageIds: string[];
  duplicatedVaultRows: { oldVaultId: string; newVaultId: string; provider: string; label: string }[];
}

async function planAndMaybeExecuteForWorkspace(workspaceId: string): Promise<MutationLogEntry[]> {
  const liveEngagements = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)));

  if (liveEngagements.length <= 1) {
    console.log(`Workspace ${workspaceId}: ${liveEngagements.length} live engagement(s) — nothing to split.`);
    return [];
  }

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.workspaceId, workspaceId)).limit(1);
  if (!ws) {
    console.warn(`Workspace ${workspaceId} not found — skipping.`);
    return [];
  }

  const sorted = liveEngagements.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const primaryEngagementId = OVERRIDE_PRIMARY_ENGAGEMENT_ID ?? sorted[0].engagementId;
  if (!sorted.some((e) => e.engagementId === primaryEngagementId)) {
    throw new Error(`--primary ${primaryEngagementId} is not a live engagement in workspace ${workspaceId}.`);
  }

  const toMove = sorted.filter((e) => e.engagementId !== primaryEngagementId);

  console.log(`\nWorkspace ${ws.name} (${workspaceId}) — ${sorted.length} live engagements:`);
  console.log(`  keeping ${primaryEngagementId} in this workspace`);
  console.log(`  splitting off: ${toMove.map((e) => e.engagementId).join(", ")}`);

  const engagementIds = toMove.map((e) => e.engagementId);
  const [repGraphRows, vaultLinkRows] = engagementIds.length
    ? await Promise.all([
        db.select({ engagementId: repIdentityGraphs.engagementId }).from(repIdentityGraphs).where(inArray(repIdentityGraphs.engagementId, engagementIds)),
        db
          .select({
            engagementId: credentialsRefs.engagementId,
            vaultId: credentialVault.id,
            provider: credentialVault.provider,
            label: credentialVault.label,
            refKey: credentialVault.refKey,
            encryptedValue: credentialVault.encryptedValue,
            iv: credentialVault.iv,
            keyVersion: credentialVault.keyVersion,
          })
          .from(credentialsRefs)
          .innerJoin(credentialVault, eq(credentialsRefs.vaultId, credentialVault.id))
          .where(inArray(credentialsRefs.engagementId, engagementIds)),
      ])
    : [[], []];

  const repEnrolled = new Set(repGraphRows.map((r) => r.engagementId));
  const vaultLinksByEngagement = new Map<string, typeof vaultLinkRows>();
  for (const row of vaultLinkRows) {
    const list = vaultLinksByEngagement.get(row.engagementId) ?? [];
    list.push(row);
    vaultLinksByEngagement.set(row.engagementId, list);
  }

  const logEntries: MutationLogEntry[] = [];

  for (const engagement of toMove) {
    const newWorkspaceId = newWorkspaceIdFor(engagement.engagementId);
    const activePackageIds: string[] = [];
    if (engagement.stack) activePackageIds.push("showtime");
    if (repEnrolled.has(engagement.engagementId)) activePackageIds.push("reputation-manager");

    const vaultLinks = vaultLinksByEngagement.get(engagement.engagementId) ?? [];

    console.log(`\n  -> ${engagement.buyer} (${engagement.engagementId})`);
    console.log(`     new workspace: ${newWorkspaceId}`);
    console.log(`     re-derived installed packages: ${activePackageIds.join(", ") || "(none)"}`);
    if (vaultLinks.length > 0) {
      console.log(`     will duplicate ${vaultLinks.length} shared credential(s): ${vaultLinks.map((v) => `${v.provider} (${v.label})`).join(", ")}`);
    }

    const entry: MutationLogEntry = {
      engagementId: engagement.engagementId,
      buyer: engagement.buyer,
      oldWorkspaceId: workspaceId,
      newWorkspaceId,
      reDerivedPackageIds: activePackageIds,
      duplicatedVaultRows: [],
    };

    if (EXECUTE) {
      await db.transaction(async (tx) => {
        await tx.insert(workspaces).values({
          workspaceId: newWorkspaceId,
          whopUserId: ws.whopUserId,
          name: engagement.buyer,
          isLegacy: false,
          timezone: ws.timezone,
          locale: ws.locale,
        });

        for (const packageId of activePackageIds) {
          await tx.insert(workspacePackages).values({ workspaceId: newWorkspaceId, packageId });
        }

        for (const vaultRow of vaultLinks) {
          const [duplicated] = await tx
            .insert(credentialVault)
            .values({
              whopUserId: ws.whopUserId,
              workspaceId: newWorkspaceId,
              provider: vaultRow.provider,
              label: vaultRow.label,
              refKey: vaultRow.refKey,
              encryptedValue: vaultRow.encryptedValue,
              iv: vaultRow.iv,
              keyVersion: vaultRow.keyVersion,
            })
            .returning({ id: credentialVault.id });

          await tx
            .update(credentialsRefs)
            .set({ vaultId: duplicated.id, updatedAt: new Date() })
            .where(and(eq(credentialsRefs.engagementId, engagement.engagementId), eq(credentialsRefs.vaultId, vaultRow.vaultId)));

          entry.duplicatedVaultRows.push({
            oldVaultId: vaultRow.vaultId,
            newVaultId: duplicated.id,
            provider: vaultRow.provider,
            label: vaultRow.label,
          });
        }

        await tx
          .update(engagements)
          .set({ workspaceId: newWorkspaceId, updatedAt: new Date() })
          .where(eq(engagements.engagementId, engagement.engagementId));
      });
    }

    logEntries.push(entry);
  }

  return logEntries;
}

async function main() {
  try {
    let targetWorkspaceIds: string[];

    if (ONLY_WORKSPACE_ID) {
      targetWorkspaceIds = [ONLY_WORKSPACE_ID];
    } else {
      const liveEngagements = await db
        .select({ workspaceId: engagements.workspaceId })
        .from(engagements)
        .where(isNull(engagements.deletedAt));

      const counts = new Map<string, number>();
      for (const row of liveEngagements) {
        if (!row.workspaceId) continue;
        counts.set(row.workspaceId, (counts.get(row.workspaceId) ?? 0) + 1);
      }
      targetWorkspaceIds = [...counts.entries()].filter(([, count]) => count > 1).map(([workspaceId]) => workspaceId);
    }

    if (targetWorkspaceIds.length === 0) {
      console.log("No matching multi-engagement workspaces found. Nothing to do.");
      return;
    }

    console.log(EXECUTE ? "EXECUTING — this will write to the database.\n" : "DRY RUN — nothing will be written. Pass --execute to apply.\n");

    const allLogEntries: MutationLogEntry[] = [];
    for (const workspaceId of targetWorkspaceIds) {
      const entries = await planAndMaybeExecuteForWorkspace(workspaceId);
      allLogEntries.push(...entries);
    }

    if (EXECUTE && allLogEntries.length > 0) {
      const logDir = path.join(process.cwd(), "scripts", ".split-migration-logs");
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, `split-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      fs.writeFileSync(logPath, JSON.stringify(allLogEntries, null, 2));
      console.log(`\nWrote rollback/audit log to ${logPath} — keep this until you've verified every moved client works correctly.`);
    } else if (!EXECUTE) {
      console.log("\nDry run complete. Re-run with --execute once you've reviewed the plan above.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Split migration failed:", error);
  process.exit(1);
});
