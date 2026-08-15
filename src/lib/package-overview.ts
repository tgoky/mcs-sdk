// src/lib/package-overview.ts
//
// Backs /dashboard/library/showtime — the Library's "app store" detail
// page for the Showtime package. Deliberately separate from
// analytics/page.tsx's 30-day financial breakdown (cost, booking-sync
// distribution) and from module-overview.ts's per-CLIENT rollup for one
// skill — this is a per-SKILL rollup across the whole package, scoped to
// a short recent window, answering the app-store question "is this
// actually working, and for how many clients" at a glance.

import { db } from "@/lib/db";
import { engagements, engagementSkills, skillRuns } from "@/models/schema";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { SKILL_IDS, SKILL_MANIFEST, type SkillId } from "@/lib/skill-manifest";

const WINDOW_DAYS = 7;
const FAILURE_STATUSES = new Set(["failed", "timed_out"]);

export interface PackageSkillStat {
  skillId: SkillId;
  name: string;
  description: string;
  /** Clients with at least one run of this skill in the window — a live
   * reach number, the closest honest equivalent to an app-store
   * "install" count this workspace actually has. */
  activeClients: number;
  runsInWindow: number;
  successRate: number | null;
  needsAttention: number;
  /** Clients where this skill is explicitly turned off (an
   * engagement_skills row with enabled=false) — absence of a row means
   * enabled, same "no row = on" contract module-overview.ts uses. */
  disabledClients: number;
}

export interface PackageOverview {
  totalClients: number;
  runsInWindow: number;
  successRate: number | null;
  activeClients: number;
  skills: PackageSkillStat[];
  windowDays: number;
}

/** Kept out of the query function body — react-hooks/purity flags a bare
 * Date.now()/new Date() call inside a component, and this is called from
 * one, so it's isolated here the same way analytics/page.tsx does it. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getPackageOverview(whopUserId: string): Promise<PackageOverview> {
  const since = daysAgo(WINDOW_DAYS);

  const allEngagements = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt)));

  const totalClients = allEngagements.length;
  if (totalClients === 0) {
    return {
      totalClients: 0,
      runsInWindow: 0,
      successRate: null,
      activeClients: 0,
      windowDays: WINDOW_DAYS,
      skills: SKILL_IDS.map((skillId) => ({
        skillId,
        name: SKILL_MANIFEST[skillId].name,
        description: SKILL_MANIFEST[skillId].description,
        activeClients: 0,
        runsInWindow: 0,
        successRate: null,
        needsAttention: 0,
        disabledClients: 0,
      })),
    };
  }

  const engagementIds = allEngagements.map((e) => e.engagementId);

  const [runs, skillOverrides] = await Promise.all([
    db
      .select({
        engagementId: skillRuns.engagementId,
        skillName: skillRuns.skillName,
        status: skillRuns.status,
        startedAt: skillRuns.startedAt,
      })
      .from(skillRuns)
      .where(and(gte(skillRuns.startedAt, since), inArray(skillRuns.engagementId, engagementIds))),
    db
      .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
      .from(engagementSkills)
      .where(inArray(engagementSkills.engagementId, engagementIds)),
  ]);

  // "Needs attention" reuses the same signal module-overview.ts uses for
  // a single skill (a streak of back-to-back failures) — here just
  // counted as "has an active failure streak right now", per skill,
  // across every client, without needing that heavier per-client shape.
  const disabledClientsBySkill = new Map<SkillId, number>();
  for (const id of SKILL_IDS) disabledClientsBySkill.set(id, 0);
  for (const row of skillOverrides) {
    if (row.enabled) continue;
    if (!SKILL_IDS.includes(row.skillId as SkillId)) continue;
    const skillId = row.skillId as SkillId;
    disabledClientsBySkill.set(skillId, (disabledClientsBySkill.get(skillId) ?? 0) + 1);
  }

  const perSkill = new Map<
    SkillId,
    { clients: Set<string>; total: number; success: number; failingClients: Set<string> }
  >();
  for (const id of SKILL_IDS) {
    perSkill.set(id, { clients: new Set(), total: 0, success: 0, failingClients: new Set() });
  }

  // Most-recent-first per (engagement, skill) so a failure streak can be
  // read off the front of each group without a second query.
  const runsByPair = new Map<string, typeof runs>();
  for (const run of runs) {
    if (!SKILL_IDS.includes(run.skillName as SkillId)) continue;
    const key = `${run.engagementId}:${run.skillName}`;
    const list = runsByPair.get(key);
    if (list) list.push(run);
    else runsByPair.set(key, [run]);
  }
  for (const list of runsByPair.values()) {
    list.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  let totalRunsInWindow = 0;
  let totalSuccessInWindow = 0;
  const activeClientIds = new Set<string>();

  for (const [key, list] of runsByPair) {
    const [engagementId, skillName] = key.split(":");
    const skillId = skillName as SkillId;
    const bucket = perSkill.get(skillId);
    if (!bucket) continue;

    bucket.clients.add(engagementId);
    activeClientIds.add(engagementId);
    bucket.total += list.length;
    totalRunsInWindow += list.length;
    for (const run of list) {
      if (run.status === "success") {
        bucket.success++;
        totalSuccessInWindow++;
      }
    }
    // Consecutive failures counting back from the most recent run.
    if (FAILURE_STATUSES.has(list[0].status)) {
      bucket.failingClients.add(engagementId);
    }
  }

  const skills: PackageSkillStat[] = SKILL_IDS.map((skillId) => {
    const bucket = perSkill.get(skillId)!;
    return {
      skillId,
      name: SKILL_MANIFEST[skillId].name,
      description: SKILL_MANIFEST[skillId].description,
      activeClients: bucket.clients.size,
      runsInWindow: bucket.total,
      successRate: bucket.total > 0 ? Math.round((bucket.success / bucket.total) * 100) : null,
      needsAttention: bucket.failingClients.size,
      disabledClients: disabledClientsBySkill.get(skillId) ?? 0,
    };
  });

  return {
    totalClients,
    runsInWindow: totalRunsInWindow,
    successRate: totalRunsInWindow > 0 ? Math.round((totalSuccessInWindow / totalRunsInWindow) * 100) : null,
    activeClients: activeClientIds.size,
    skills,
    windowDays: WINDOW_DAYS,
  };
}
