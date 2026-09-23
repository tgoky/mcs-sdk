import { db } from "@/lib/db";
import { engagements, engagementSkills, repIdentityGraphs, coldOpenConfig, whopAgentConnections, type EngagementStack } from "@/models/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { SKILL_IDS, type SkillId } from "@/lib/skill-manifest";
import { REP_SKILL_IDS, type RepSkillId } from "@/lib/rep-skill-manifest";
import { COLD_OPEN_SKILL_IDS, type ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";
import { WORKER_IDS, type WorkerId } from "@/lib/worker-registry";
import { repIdentityIsComplete } from "@/lib/rep-engagements";

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

/** Same "no row = enabled" query as getEngagementSkillStates, for Cold
 * Open's own Skills panel — same table, same convention, just
 * COLD_OPEN_SKILL_IDS instead of Showtime's SKILL_IDS. */
export async function getColdOpenEngagementSkillStates(engagementId: string): Promise<Record<ColdOpenSkillId, boolean>> {
  const rows = await db
    .select({ skillId: engagementSkills.skillId, enabled: engagementSkills.enabled })
    .from(engagementSkills)
    .where(eq(engagementSkills.engagementId, engagementId));

  const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.skillId));

  return Object.fromEntries(COLD_OPEN_SKILL_IDS.map((id) => [id, !disabled.has(id)])) as Record<ColdOpenSkillId, boolean>;
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
 * Showtime evidence: pin-down actually finished (confirmationPageUrl —
 * isProductOnboarded("showtime")'s own signal), or a legacy client with a
 * connected booking credential. NOT just "stack is non-null": creating a
 * client from Reputation Manager writes { timezone }, and saving a Whop
 * bridge secret writes into stack too. And NOT stack.booking_platform
 * either — field-writeback.ts auto-fills that from a detected fact
 * whenever a setup page is merely opened; the credential ref is only ever
 * written by a real connect.
 */
function hasShowtimeSetup(row: { stack: unknown; confirmationPageUrl: string | null } | undefined): boolean {
  if (!row) return false;
  if (row.confirmationPageUrl) return true;
  const stack = row.stack as Partial<EngagementStack> | null;
  return Boolean(stack?.booking_platform_credentials_ref);
}

/** Cold Open evidence: ICP Lock actually completed — not just a
 * coldOpenConfig row, which saving only the sending tool also creates. */
export const coldOpenIcpLockComplete = sql`${coldOpenConfig.phaseState}->>'icp_lock' = 'complete'`;

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
  const [rows, [engagement], repGraph, coldOpenRow, whopConnectionRow] = await Promise.all([
    db.select({ skillId: engagementSkills.skillId, enabled: engagementSkills.enabled, enabledAt: engagementSkills.enabledAt })
      .from(engagementSkills)
      .where(eq(engagementSkills.engagementId, engagementId)),
    db.select({ stack: engagements.stack, confirmationPageUrl: engagements.confirmationPageUrl }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1),
    db.select({ engagementId: repIdentityGraphs.engagementId }).from(repIdentityGraphs).where(and(eq(repIdentityGraphs.engagementId, engagementId), repIdentityIsComplete)).limit(1),
    db.select({ engagementId: coldOpenConfig.engagementId }).from(coldOpenConfig).where(and(eq(coldOpenConfig.engagementId, engagementId), coldOpenIcpLockComplete)).limit(1),
    db.select({ engagementId: whopAgentConnections.engagementId }).from(whopAgentConnections).where(and(eq(whopAgentConnections.engagementId, engagementId), isNull(whopAgentConnections.disconnectedAt))).limit(1),
  ]);

  const explicitlyEnabled = new Set(rows.filter((r) => r.enabled && r.enabledAt).map((r) => r.skillId));
  const explicitlyDisabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.skillId));

  const hasShowtimeEvidence = hasShowtimeSetup(engagement);
  const hasRepEvidence = repGraph.length > 0;
  const hasColdOpenEvidence = coldOpenRow.length > 0;
  const hasWhopAgentEvidence = whopConnectionRow.length > 0;

  return WORKER_IDS.filter((id) => {
    if (explicitlyDisabled.has(id)) return false;
    if (explicitlyEnabled.has(id)) return true;
    if ((SKILL_IDS as string[]).includes(id)) return hasShowtimeEvidence;
    if ((COLD_OPEN_SKILL_IDS as string[]).includes(id)) return hasColdOpenEvidence;
    if ((WHOP_AGENT_SKILL_IDS as string[]).includes(id)) return hasWhopAgentEvidence;
    return hasRepEvidence;
  });
}

/**
 * getEnabledWorkerIdsForEngagement for many engagements in five queries
 * total instead of five per engagement (the /home cards and the client
 * switcher's counts). Same rule, applied per engagement.
 */
export async function getEnabledWorkerIdsForEngagements(engagementIds: string[]): Promise<Map<string, WorkerId[]>> {
  const out = new Map<string, WorkerId[]>();
  if (engagementIds.length === 0) return out;
  const [rows, engagementRows, repRows, coldOpenRows, whopRows] = await Promise.all([
    db
      .select({ engagementId: engagementSkills.engagementId, skillId: engagementSkills.skillId, enabled: engagementSkills.enabled, enabledAt: engagementSkills.enabledAt })
      .from(engagementSkills)
      .where(inArray(engagementSkills.engagementId, engagementIds)),
    db.select({ engagementId: engagements.engagementId, stack: engagements.stack, confirmationPageUrl: engagements.confirmationPageUrl }).from(engagements).where(inArray(engagements.engagementId, engagementIds)),
    db.select({ engagementId: repIdentityGraphs.engagementId }).from(repIdentityGraphs).where(and(inArray(repIdentityGraphs.engagementId, engagementIds), repIdentityIsComplete)),
    db.select({ engagementId: coldOpenConfig.engagementId }).from(coldOpenConfig).where(and(inArray(coldOpenConfig.engagementId, engagementIds), coldOpenIcpLockComplete)),
    db
      .select({ engagementId: whopAgentConnections.engagementId })
      .from(whopAgentConnections)
      .where(and(inArray(whopAgentConnections.engagementId, engagementIds), isNull(whopAgentConnections.disconnectedAt))),
  ]);
  const withStack = new Set(engagementRows.filter((r) => hasShowtimeSetup(r)).map((r) => r.engagementId));
  const rep = new Set(repRows.map((r) => r.engagementId));
  const coldOpen = new Set(coldOpenRows.map((r) => r.engagementId));
  const whop = new Set(whopRows.map((r) => r.engagementId));
  for (const id of engagementIds) {
    const mine = rows.filter((r) => r.engagementId === id);
    const explicitlyEnabled = new Set(mine.filter((r) => r.enabled && r.enabledAt).map((r) => r.skillId));
    const explicitlyDisabled = new Set(mine.filter((r) => !r.enabled).map((r) => r.skillId));
    out.set(
      id,
      WORKER_IDS.filter((w) => {
        if (explicitlyDisabled.has(w)) return false;
        if (explicitlyEnabled.has(w)) return true;
        if ((SKILL_IDS as string[]).includes(w)) return withStack.has(id);
        if ((COLD_OPEN_SKILL_IDS as string[]).includes(w)) return coldOpen.has(id);
        if ((WHOP_AGENT_SKILL_IDS as string[]).includes(w)) return whop.has(id);
        return rep.has(id);
      })
    );
  }
  return out;
}

/** Same reasoning as getEnabledWorkerIdsForEngagement's evidence fallback,
 * without the extra round trips — for call sites that already have the
 * engagement's stack presence and rep-enrollment on hand (e.g. a roster
 * page rendering many engagements at once) and just need the explicit-
 * disable/enable overlay applied. */
export function resolveEnabledWorkerIds(opts: {
  hasShowtimeEvidence: boolean;
  hasRepEvidence: boolean;
  /** Optional so every existing call site (pre-dating Cold Open) keeps
   * compiling unchanged; omitted means "no evidence", same as not passing
   * hasRepEvidence would for an RM-unaware caller before this field
   * existed. */
  hasColdOpenEvidence?: boolean;
  /** Same optionality reasoning as hasColdOpenEvidence, for Whop Agent. */
  hasWhopAgentEvidence?: boolean;
  explicitRows: { skillId: string; enabled: boolean; enabledAt: Date | null }[];
}): WorkerId[] {
  const explicitlyEnabled = new Set(opts.explicitRows.filter((r) => r.enabled && r.enabledAt).map((r) => r.skillId));
  const explicitlyDisabled = new Set(opts.explicitRows.filter((r) => !r.enabled).map((r) => r.skillId));

  return WORKER_IDS.filter((id) => {
    if (explicitlyDisabled.has(id)) return false;
    if (explicitlyEnabled.has(id)) return true;
    if ((SKILL_IDS as string[]).includes(id)) return opts.hasShowtimeEvidence;
    if ((COLD_OPEN_SKILL_IDS as string[]).includes(id)) return Boolean(opts.hasColdOpenEvidence);
    if ((WHOP_AGENT_SKILL_IDS as string[]).includes(id)) return Boolean(opts.hasWhopAgentEvidence);
    return opts.hasRepEvidence;
  });
}
