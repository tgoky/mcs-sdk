// scripts/audit-multi-engagement-workspaces.ts
//
// Read-only. Reports every workspace that currently holds more than one
// live engagement — the exact condition the "one workspace = one client"
// architecture decision needs eliminated (see the split script,
// scripts/split-multi-engagement-workspaces.ts, for the actual fix).
//
// This script issues SELECT statements only. It never writes anything.
// Run it before ever running the split script, so the actual blast radius
// on real data is visible before anything gets touched.
//
// Usage:
//   npx tsx scripts/audit-multi-engagement-workspaces.ts
//   npx tsx scripts/audit-multi-engagement-workspaces.ts --json report.json
//
// Requires DIRECT_URL (or DATABASE_URL as a fallback) in .env — same
// convention as migrate.ts.

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, inArray } from "drizzle-orm";
import * as fs from "node:fs";
import {
  workspaces,
  engagements,
  workspacePackages,
  engagementSkills,
  credentialsRefs,
  credentialVault,
  repIdentityGraphs,
} from "../src/models/schema";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: neither DIRECT_URL nor DATABASE_URL is set in your .env file.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(client);

interface WorkspaceReport {
  workspaceId: string;
  workspaceName: string;
  whopUserId: string;
  installedPackageIds: string[];
  engagementCount: number;
  engagements: {
    engagementId: string;
    buyer: string;
    label: string | null;
    status: "active" | "paused";
    launchedAt: Date | null;
    createdAt: Date;
    /** Real, evidence-based signal of product usage — not just "installed at the workspace level." */
    activeProducts: string[];
    /** Skills this engagement explicitly turned off (SKILL_REGISTRY convention: absence of a row means enabled). */
    explicitlyDisabledSkillIds: string[];
    /** Credential vault rows (by label) this engagement actually links to — these need duplicating on split. */
    linkedVaultCredentials: string[];
  }[];
  recommendedPrimaryEngagementId: string;
}

async function buildReport(): Promise<WorkspaceReport[]> {
  const liveEngagements = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      label: engagements.label,
      workspaceId: engagements.workspaceId,
      launchedAt: engagements.launchedAt,
      pausedAt: engagements.pausedAt,
      createdAt: engagements.createdAt,
      hasStack: engagements.stack,
    })
    .from(engagements)
    .where(isNull(engagements.deletedAt));

  const byWorkspace = new Map<string, typeof liveEngagements>();
  for (const row of liveEngagements) {
    if (!row.workspaceId) continue; // pre-workspace legacy rows; ensureLegacyWorkspace backfills these on first visit
    const bucket = byWorkspace.get(row.workspaceId) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspaceId, bucket);
  }

  const multiEngagementWorkspaceIds = [...byWorkspace.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([workspaceId]) => workspaceId);

  if (multiEngagementWorkspaceIds.length === 0) return [];

  const [workspaceRows, packageRows, allRelevantEngagementIds] = await Promise.all([
    db.select().from(workspaces).where(inArray(workspaces.workspaceId, multiEngagementWorkspaceIds)),
    db.select().from(workspacePackages).where(inArray(workspacePackages.workspaceId, multiEngagementWorkspaceIds)),
    Promise.resolve(
      multiEngagementWorkspaceIds.flatMap((wsId) => (byWorkspace.get(wsId) ?? []).map((e) => e.engagementId))
    ),
  ]);

  const [skillRows, repGraphRows, vaultLinkRows] = await Promise.all([
    db
      .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
      .from(engagementSkills)
      .where(and(inArray(engagementSkills.engagementId, allRelevantEngagementIds), eq(engagementSkills.enabled, false))),
    db
      .select({ engagementId: repIdentityGraphs.engagementId })
      .from(repIdentityGraphs)
      .where(inArray(repIdentityGraphs.engagementId, allRelevantEngagementIds)),
    db
      .select({
        engagementId: credentialsRefs.engagementId,
        vaultLabel: credentialVault.label,
        vaultProvider: credentialVault.provider,
      })
      .from(credentialsRefs)
      .innerJoin(credentialVault, eq(credentialsRefs.vaultId, credentialVault.id))
      .where(inArray(credentialsRefs.engagementId, allRelevantEngagementIds)),
  ]);

  const disabledByEngagement = new Map<string, string[]>();
  for (const row of skillRows) {
    const list = disabledByEngagement.get(row.engagementId) ?? [];
    list.push(row.skillId);
    disabledByEngagement.set(row.engagementId, list);
  }

  const repEnrolledEngagementIds = new Set(repGraphRows.map((r) => r.engagementId));

  const vaultLinksByEngagement = new Map<string, string[]>();
  for (const row of vaultLinkRows) {
    const list = vaultLinksByEngagement.get(row.engagementId) ?? [];
    list.push(`${row.vaultProvider} (${row.vaultLabel})`);
    vaultLinksByEngagement.set(row.engagementId, list);
  }

  const packagesByWorkspace = new Map<string, string[]>();
  for (const row of packageRows) {
    const list = packagesByWorkspace.get(row.workspaceId) ?? [];
    list.push(row.packageId);
    packagesByWorkspace.set(row.workspaceId, list);
  }

  return workspaceRows.map((ws): WorkspaceReport => {
    const engagementRows = (byWorkspace.get(ws.workspaceId) ?? []).slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const detailedEngagements = engagementRows.map((e) => {
      const activeProducts: string[] = [];
      if (e.hasStack) activeProducts.push("showtime");
      if (repEnrolledEngagementIds.has(e.engagementId)) activeProducts.push("reputation-manager");

      return {
        engagementId: e.engagementId,
        buyer: e.buyer,
        label: e.label,
        status: (e.pausedAt ? "paused" : "active") as "active" | "paused",
        launchedAt: e.launchedAt,
        createdAt: e.createdAt,
        activeProducts,
        explicitlyDisabledSkillIds: disabledByEngagement.get(e.engagementId) ?? [],
        linkedVaultCredentials: vaultLinksByEngagement.get(e.engagementId) ?? [],
      };
    });

    return {
      workspaceId: ws.workspaceId,
      workspaceName: ws.name,
      whopUserId: ws.whopUserId,
      installedPackageIds: packagesByWorkspace.get(ws.workspaceId) ?? [],
      engagementCount: detailedEngagements.length,
      engagements: detailedEngagements,
      // Oldest live engagement keeps the existing workspaceId/record — the
      // rest get promoted to brand-new workspaces by the split script.
      // This is a default, not a mandate: review before running the split.
      recommendedPrimaryEngagementId: detailedEngagements[0]?.engagementId ?? "",
    };
  });
}

function printReport(reports: WorkspaceReport[]): void {
  if (reports.length === 0) {
    console.log("No workspace currently holds more than one live engagement. Nothing to split.");
    return;
  }

  console.log(`\n${reports.length} workspace(s) hold more than one live engagement:\n`);

  for (const ws of reports) {
    console.log("─".repeat(72));
    console.log(`Workspace: ${ws.workspaceName}  (${ws.workspaceId})`);
    console.log(`  whopUserId: ${ws.whopUserId}`);
    console.log(`  workspace-level installed packages: ${ws.installedPackageIds.join(", ") || "(none)"}`);
    console.log(`  ${ws.engagementCount} live engagements:\n`);

    for (const e of ws.engagements) {
      const marker = e.engagementId === ws.recommendedPrimaryEngagementId ? "  [keeps this workspaceId]" : "  [would move to a new workspace]";
      console.log(`  - ${e.buyer}${e.label ? ` (${e.label})` : ""} — ${e.engagementId}${marker}`);
      console.log(`      status: ${e.status}, launched: ${e.launchedAt?.toISOString() ?? "not launched"}`);
      console.log(`      evidence of real product usage: ${e.activeProducts.join(", ") || "(none — likely a stale/test row)"}`);
      if (e.explicitlyDisabledSkillIds.length > 0) {
        console.log(`      explicitly disabled skills: ${e.explicitlyDisabledSkillIds.join(", ")}`);
      }
      if (e.linkedVaultCredentials.length > 0) {
        console.log(`      linked shared credentials (would need duplicating): ${e.linkedVaultCredentials.join(", ")}`);
      }
    }
    console.log("");
  }

  console.log("─".repeat(72));
  console.log(
    `\nNothing has been changed. Review this against your own knowledge of which engagement in each\n` +
      `workspace is the one that should keep its existing workspaceId before running\n` +
      `scripts/split-multi-engagement-workspaces.ts.\n`
  );
}

async function main() {
  const jsonFlagIndex = process.argv.indexOf("--json");
  const jsonOutPath = jsonFlagIndex !== -1 ? process.argv[jsonFlagIndex + 1] : null;

  try {
    const reports = await buildReport();
    printReport(reports);
    if (jsonOutPath) {
      fs.writeFileSync(jsonOutPath, JSON.stringify(reports, null, 2));
      console.log(`Wrote machine-readable report to ${jsonOutPath}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
