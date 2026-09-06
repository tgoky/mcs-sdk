import { db } from "@/lib/db";
import { engagements, engagementSkills, repIdentityGraphs } from "@/models/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, type RepSkillId } from "@/lib/rep-skill-manifest";
import { WORKER_IDS, type WorkerId } from "@/lib/worker-registry";

/**
 * No row for (engagementId, skillId) means enabled — this table only ever
 * needs to hold explicit disables, so every engagement that predates the
 * Skill Library concept reads as "all skills on" with zero migration
 * needed on their data.
 *
 * skillId widened to string: this is one of the two functions (with
 * setSkillEnabledForEngagement below) the shared dispatcher in
 * src/inngest/skill.ts calls generically for whatever product's skill is
 * running — SkillId would reject Reputation Manager's ids. The query
 * itself was always just an equality check against a free-text column,
 * so this was an accidental over-constraint, not a deliberate design
 * choice; the other three functions in this file return
 * Record<SkillId, boolean> for Showtime's own Skills panel specifically
 * and correctly stay narrow.
 */
export async function isSkillEnabledForEngagement(engagementId: string, skillId: string): Promise<boolean> {
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

/** Same "no row = enabled" query as getEngagementSkillStates, for Reputation Manager's own Skills panel — same table, same convention, just REP_SKILL_IDS instead of Showtime's SKILL_IDS. */
export async function getRepEngagementSkillStates(engagementId: string): Promise<Record<RepSkillId, boolean>> {
  const rows = await db
    .select({ skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(eq(engagementSkills.engagementId, engagementId));

  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.skillId));

  return Object.fromEntries(REP_SKILL_IDS.map((id) => [id, !disabled.has(id)])) as Record<RepSkillId, boolean>;
}

/**
 * One query for every engagement with a given skill explicitly disabled —
 * for cron/poller prepare steps that need to filter N engagements down to
 * "eligible for this skill" without N round trips to
 * isSkillEnabledForEngagement. Same "no row = enabled" contract: this
 * returns only the explicit opt-outs, so callers exclude these ids from
 * their eligible set rather than trying to build an "enabled" list.
 *
 * Ghost-run fix: every cron/poller that creates a visible skillRuns row
 * for a skill must call this (or isSkillEnabledForEngagement) BEFORE
 * creating that row, not after — see nightlyBriefsCron / leakMapScheduleCron
 * in src/inngest/crons.ts and pollBookingPlatforms in booking-poller.ts for
 * the pattern. A disabled skill should never appear to run and then reveal
 * itself as skipped; it should simply not appear.
 */
/** skillId widened to string, same reasoning as isSkillEnabledForEngagement above — needed by rep-engine-panel's cron for the same efficient bulk-disabled-check pattern Showtime's crons already use. */
export async function getDisabledEngagementIdsForSkill(skillId: string): Promise<Set<string>> {
  const rows = await db
    .select({ engagementId: engagementSkills.engagementId })
    .from(engagementSkills)
    .where(and(eq(engagementSkills.skillId, skillId), eq(engagementSkills.enabled, false)));

  return new Set(rows.map((r) => r.engagementId));
}

/**
 * Same "no row = enabled" state getEngagementSkillStates resolves, but for
 * every engagement in one query — for the account-wide Autopilot rail
 * panel, which needs every client's 5 skill states at once and would
 * otherwise be N round trips (one per client) on top of the N a per-skill
 * getEngagementSkillStates loop would already be.
 */
export async function getSkillStatesForEngagements(
  engagementIds: string[]
): Promise<Record<string, Record<SkillId, boolean>>> {
  const allEnabled = Object.fromEntries(SKILL_IDS.map((id) => [id, true])) as Record<SkillId, boolean>;
  if (engagementIds.length === 0) return {};

  const rows = await db
    .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(inArray(engagementSkills.engagementId, engagementIds));

  const disabledByEngagement = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.enabled) continue;
    const set = disabledByEngagement.get(row.engagementId) ?? new Set<string>();
    set.add(row.skillId);
    disabledByEngagement.set(row.engagementId, set);
  }

  return Object.fromEntries(
    engagementIds.map((engagementId) => {
      const disabled = disabledByEngagement.get(engagementId);
      if (!disabled) return [engagementId, allEnabled];
      return [engagementId, Object.fromEntries(SKILL_IDS.map((id) => [id, !disabled.has(id)])) as Record<SkillId, boolean>];
    })
  );
}

/** Same bulk shape as getSkillStatesForEngagements, for Reputation Manager's
 * 6 skills — the Autopilot rail panel used to only ever fetch Showtime's
 * skill states here, so an RM client showed there with 5 Showtime skill
 * chips that never applied to them (and no way to see or toggle any of
 * their actual 6). Callers still need to gate display on whether a given
 * engagement is actually RM-enrolled (getRepEnrolledEngagementIds) — this
 * returns "all enabled" defaults for a non-enrolled id same as
 * getSkillStatesForEngagements does for Showtime, which is meaningless on
 * its own but harmless since it's never rendered without that gate. */
export async function getRepSkillStatesForEngagements(
  engagementIds: string[]
): Promise<Record<string, Record<RepSkillId, boolean>>> {
  const allEnabled = Object.fromEntries(REP_SKILL_IDS.map((id) => [id, true])) as Record<RepSkillId, boolean>;
  if (engagementIds.length === 0) return {};

  const rows = await db
    .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(inArray(engagementSkills.engagementId, engagementIds));

  const disabledByEngagement = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.enabled) continue;
    const set = disabledByEngagement.get(row.engagementId) ?? new Set<string>();
    set.add(row.skillId);
    disabledByEngagement.set(row.engagementId, set);
  }

  return Object.fromEntries(
    engagementIds.map((engagementId) => {
      const disabled = disabledByEngagement.get(engagementId);
      if (!disabled) return [engagementId, allEnabled];
      return [engagementId, Object.fromEntries(REP_SKILL_IDS.map((id) => [id, !disabled.has(id)])) as Record<RepSkillId, boolean>];
    })
  );
}

/** Upserts the enabled flag for one (engagementId, skillId) pair — see the Skills panel on the engagement detail page.
 * skillId widened to string, same reasoning as isSkillEnabledForEngagement above.
 *
 * Also stamps enabledAt the first time a skill is explicitly turned on —
 * COALESCE'd so a later disable/re-enable cycle doesn't reset "when was
 * this first enabled" back to now(). Disabling never touches enabledAt:
 * once a worker has genuinely been turned on, that fact is worth keeping
 * even if it's later switched off. */
export async function setSkillEnabledForEngagement(
  engagementId: string,
  skillId: string,
  enabled: boolean
): Promise<void> {
  await db
    .insert(engagementSkills)
    .values({ engagementId, skillId, enabled, enabledAt: enabled ? new Date() : null })
    .onConflictDoUpdate({
      target: [engagementSkills.engagementId, engagementSkills.skillId],
      set: enabled
        ? { enabled, updatedAt: new Date(), enabledAt: sql`coalesce(${engagementSkills.enabledAt}, now())` }
        : { enabled, updatedAt: new Date() },
    });
}

/**
 * Which workers actually count as "enabled" for the Library's enabled-
 * first sort and per-worker Analytics — reconciling two eras of data
 * without touching either:
 *
 *   1. Explicit: an engagementSkills row with enabled=true and enabledAt
 *      set (someone pressed enable through the Library after this concept
 *      existed).
 *   2. Evidence-based, for clients that predate the Library: real proof
 *      of usage the same way scripts/audit-multi-engagement-workspaces.ts
 *      and getRepEnrolledEngagementIds already establish product
 *      enrollment — a non-null `stack` means every Showtime worker that
 *      isn't explicitly disabled counts as enabled, and an existing
 *      repIdentityGraphs row means every Reputation Manager worker that
 *      isn't explicitly disabled counts as enabled.
 *
 * This intentionally never consults "no row = enabled" on its own for a
 * worker with zero other evidence — that convention answers "is dispatch
 * allowed to run this," a different question from "should this show as
 * enabled in the Library," and conflating them would make every brand-new
 * client look like it already has all 11 workers turned on.
 */
export async function getEnabledWorkerIdsForEngagement(engagementId: string): Promise<WorkerId[]> {
  const [rows, [engagement], repGraph] = await Promise.all([
    db.select({ skillId: engagementSkills.skillId, enabled: engagementSkills.enabled, enabledAt: engagementSkills.enabledAt })
      .from(engagementSkills)
      .where(eq(engagementSkills.engagementId, engagementId)),
    db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1),
    db.select({ engagementId: repIdentityGraphs.engagementId }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1),
  ]);

  const explicitlyEnabled = new Set(rows.filter((r) => r.enabled && r.enabledAt).map((r) => r.skillId));
  const explicitlyDisabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.skillId));

  const hasShowtimeEvidence = Boolean(engagement?.stack);
  const hasRepEvidence = repGraph.length > 0;

  return WORKER_IDS.filter((id) => {
    if (explicitlyDisabled.has(id)) return false;
    if (explicitlyEnabled.has(id)) return true;
    const isShowtimeWorker = (SKILL_IDS as string[]).includes(id);
    if (isShowtimeWorker) return hasShowtimeEvidence;
    return hasRepEvidence;
  });
}

/** Same reasoning as getEnabledWorkerIdsForEngagement's evidence fallback,
 * without the extra round trips — for call sites that already have the
 * engagement's stack presence and rep-enrollment on hand (e.g. a roster
 * page rendering many engagements at once) and just need the explicit-
 * disable/enable overlay applied. */
export function resolveEnabledWorkerIds(opts: {
  hasShowtimeEvidence: boolean;
  hasRepEvidence: boolean;
  explicitRows: { skillId: string; enabled: boolean; enabledAt: Date | null }[];
}): WorkerId[] {
  const explicitlyEnabled = new Set(opts.explicitRows.filter((r) => r.enabled && r.enabledAt).map((r) => r.skillId));
  const explicitlyDisabled = new Set(opts.explicitRows.filter((r) => !r.enabled).map((r) => r.skillId));

  return WORKER_IDS.filter((id) => {
    if (explicitlyDisabled.has(id)) return false;
    if (explicitlyEnabled.has(id)) return true;
    const isShowtimeWorker = (SKILL_IDS as string[]).includes(id);
    return isShowtimeWorker ? opts.hasShowtimeEvidence : opts.hasRepEvidence;
  });
}
