import { db } from "@/lib/db";
import { engagementSkills } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";

/**
 * No row for (engagementId, skillId) means enabled — this table only ever
 * needs to hold explicit disables, so every engagement that predates the
 * Skill Library concept reads as "all skills on" with zero migration
 * needed on their data.
 */
export async function isSkillEnabledForEngagement(engagementId: string, skillId: SkillId): Promise<boolean> {
  const [row] = await db
    .select({ enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(and(eq(engagementSkills.engagementId, engagementId), eq(engagementSkills.skillId, skillId)))
    .limit(1);

  return row ? row.enabled : true;
}

/**
 * One query for every skill's enabled state, for the engagement detail
 * page's Skills panel — avoids five round trips (one per SKILL_IDS entry)
 * to render the initial toggle states.
 */
export async function getEngagementSkillStates(engagementId: string): Promise<Record<SkillId, boolean>> {
  const rows = await db
    .select({ skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(eq(engagementSkills.engagementId, engagementId));

  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.skillId));

  return Object.fromEntries(SKILL_IDS.map((id) => [id, !disabled.has(id)])) as Record<SkillId, boolean>;
}

/** Upserts the enabled flag for one (engagementId, skillId) pair — see the Skills panel on the engagement detail page. */
export async function setSkillEnabledForEngagement(
  engagementId: string,
  skillId: SkillId,
  enabled: boolean
): Promise<void> {
  await db
    .insert(engagementSkills)
    .values({ engagementId, skillId, enabled })
    .onConflictDoUpdate({
      target: [engagementSkills.engagementId, engagementSkills.skillId],
      set: { enabled, updatedAt: new Date() },
    });
}
