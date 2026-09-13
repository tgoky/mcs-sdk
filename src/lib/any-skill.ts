import { isRepSkillId, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import { isColdOpenSkillId, COLD_OPEN_SKILL_MANIFEST } from "@/lib/cold-open-skill-manifest";
import { isWhopAgentSkillId, WHOP_AGENT_SKILL_MANIFEST } from "@/lib/whop-agent-skill-manifest";
import { skillName as showtimeSkillName } from "@/lib/copy";

/**
 * Display name for a skillRuns.skillName value from ANY product's catalog.
 * Each product keeps its own separate skill-id union (see
 * rep-skill-manifest.ts's file comment for why), but skillRuns is a
 * shared, untyped table — anything that lists runs across products (the
 * Executions page, the live feed, a run's own detail header) needs a name
 * lookup that checks every catalog instead of just Showtime's, which is
 * all skillName() (lib/copy.ts) ever did.
 *
 * Extended to check Cold Open and Whop Agent while adding the latter — Cold
 * Open's absence here was a real, pre-existing gap (a Cold Open run's
 * skillName fell through to showtimeSkillName's raw-id fallback), not a
 * hypothetical; fixed alongside rather than left to compound with a third
 * product falling through the same way.
 */
export function anySkillDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Unknown module";
  if (isRepSkillId(raw)) return REP_SKILL_MANIFEST[raw].name;
  if (isColdOpenSkillId(raw)) return COLD_OPEN_SKILL_MANIFEST[raw].name;
  if (isWhopAgentSkillId(raw)) return WHOP_AGENT_SKILL_MANIFEST[raw].name;
  return showtimeSkillName(raw);
}
