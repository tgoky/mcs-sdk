// src/lib/module-overview.ts
//
// Backs /dashboard/modules/[skill] — the page the sidebar's five module
// links (Pin-Down, Pile-On, Pre-Call Read, Win-Back, Leak-Map) point to.
// Those links previously went to a route that didn't exist (404). This is
// the per-client rollup half of that page: for one skill, which clients
// have run it, what happened most recently, and — the part that actually
// matters for support — whose runs are currently failing back-to-back
// with nothing resolving it, the exact situation a misconfigured
// credential during onboarding creates (see the Mudd Ventures / GHL 422
// case this was built for).
//
// Deliberately separate from /api/skill-runs/recent (which is a flat,
// cross-skill, cross-client feed for the dashboard overview) — this needs
// one row per CLIENT, not one row per RUN, with a computed failure streak
// that flat feed has no reason to calculate.

import { db } from "@/lib/db";
import { engagements, engagementSkills, skillRuns } from "@/models/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { SkillId } from "@/lib/skill-manifest";

export type SkillSidebarClient = {
  engagementId: string;
  buyer: string;
};

export type ModuleClientSummary = {
  engagementId: string;
  buyerName: string;
  pausedAt: string | null;
  pausedReason: string | null;
  /** false only if explicitly disabled via the engagement's Skills panel — absence of a row means enabled. */
  skillEnabled: boolean;
  lastStatus: string | null;
  lastRunAt: string | null;
  lastErrorMessage: string | null;
  totalRuns: number;
  /**
   * How many of the most recent runs for this client+skill, counting
   * back from now, were failed/timed_out with nothing else in between.
   * A misconfigured credential shows up here as a number that grows by
   * one every night instead of ever resetting to 0.
   */
  consecutiveFailures: number;
};

const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

/**
 * One row per client that has ever run (or is configured to run) this
 * skill, sorted so the clients that most need a human's attention —
 * longest active failure streak, then most recently active — sort to the
 * top. Clients with zero runs of this skill are included too (status
 * "not_run"), same as the sidebar's own per-module status dot.
 */
export async function getModuleClientSummaries(
  whopUserId: string,
  workspaceId: string,
  skill: SkillId
): Promise<ModuleClientSummary[]> {
  const allEngagements = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      pausedAt: engagements.pausedAt,
      pausedReason: engagements.pausedReason,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    );

  if (allEngagements.length === 0) return [];

  const engagementIds = allEngagements.map((e) => e.engagementId);

  const [runs, skillRows] = await Promise.all([
    db
      .select({
        engagementId: skillRuns.engagementId,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
        errorMessage: skillRuns.errorMessage,
      })
      .from(skillRuns)
      .where(
        and(eq(skillRuns.skillName, skill), inArray(skillRuns.engagementId, engagementIds))
      )
      // Descending so each engagement's run list below is already
      // most-recent-first — the consecutive-failure walk depends on that order.
      .orderBy(desc(skillRuns.startedAt)),
    db
      .select({
        engagementId: engagementSkills.engagementId,
        enabled: engagementSkills.enabled,
      })
      .from(engagementSkills)
      .where(
        and(eq(engagementSkills.skillId, skill), inArray(engagementSkills.engagementId, engagementIds))
      ),
  ]);

  const enabledOverrides = new Map(skillRows.map((r) => [r.engagementId, r.enabled]));

  const runsByEngagement = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = runsByEngagement.get(run.engagementId);
    if (list) {
      list.push(run);
    } else {
      runsByEngagement.set(run.engagementId, [run]);
    }
  }

  const summaries: ModuleClientSummary[] = allEngagements.map((e) => {
    const engagementRuns = runsByEngagement.get(e.engagementId) ?? [];

    let consecutiveFailures = 0;
    for (const run of engagementRuns) {
      if (FAILURE_STATUSES.has(run.status)) consecutiveFailures++;
      else break;
    }

    const last = engagementRuns[0] ?? null;

    return {
      engagementId: e.engagementId,
      buyerName: e.buyer,
      pausedAt: e.pausedAt ? new Date(e.pausedAt).toISOString() : null,
      pausedReason: e.pausedReason ?? null,
      skillEnabled: enabledOverrides.get(e.engagementId) ?? true,
      lastStatus: last?.status ?? null,
      lastRunAt: last?.startedAt ? new Date(last.startedAt).toISOString() : null,
      lastErrorMessage: last?.errorMessage ?? null,
      totalRuns: engagementRuns.length,
      consecutiveFailures,
    };
  });

  // Longest active failure streak first (the whole point of this page),
  // then most recently active, so an idle never-run client sinks to the
  // bottom rather than competing on a tie.
  return summaries.sort((a, b) => {
    if (b.consecutiveFailures !== a.consecutiveFailures) {
      return b.consecutiveFailures - a.consecutiveFailures;
    }
    const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    return bTime - aTime;
  });
}

/**
 * Lean client list for one skill — same "no row means enabled" rule as
 * getModuleClientSummaries above, but without the run-history/failure-streak
 * work that page needs and this one doesn't. Backs the Engagements secondary
 * sidebar's "other clients on this skill" section (see
 * recent-engagements-section.tsx): landing on
 * /dashboard/engagements/[id]/skills/[skill] used to fall back to the
 * generic most-recently-created client list regardless of skill, so jumping
 * from the sidebar could land on a client that doesn't even have this skill
 * active. Only queries the (usually short) list of explicit disables
 * instead of pulling every engagement_skills row.
 */
export async function getSkillActiveClients(
  whopUserId: string,
  workspaceId: string,
  skill: SkillId,
  excludeEngagementId?: string
): Promise<SkillSidebarClient[]> {
  const allEngagements = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      createdAt: engagements.createdAt,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.whopUserId, whopUserId),
        eq(engagements.workspaceId, workspaceId),
        isNull(engagements.deletedAt)
      )
    );

  if (allEngagements.length === 0) return [];

  const engagementIds = allEngagements.map((e) => e.engagementId);

  const disabledRows = await db
    .select({ engagementId: engagementSkills.engagementId })
    .from(engagementSkills)
    .where(
      and(
        eq(engagementSkills.skillId, skill),
        eq(engagementSkills.enabled, false),
        inArray(engagementSkills.engagementId, engagementIds)
      )
    );

  const disabled = new Set(disabledRows.map((r) => r.engagementId));

  return allEngagements
    .filter((e) => !disabled.has(e.engagementId) && e.engagementId !== excludeEngagementId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((e) => ({ engagementId: e.engagementId, buyer: e.buyer }));
}
