import { isRepSkillId, REP_SKILL_MANIFEST } from "@/lib/rep-skill-manifest";
import { skillName as showtimeSkillName } from "@/lib/copy";

/**
 * Display name for a skillRuns.skillName value from EITHER product's
 * catalog. Showtime and Reputation Manager keep separate skill-id unions
 * (see rep-skill-manifest.ts's file comment for why), but skillRuns is a
 * shared, untyped table — anything that lists runs across both products
 * (the Executions page, the live feed, a run's own detail header) needs a
 * name lookup that checks both catalogs instead of just Showtime's, which
 * is all skillName() (lib/copy.ts) ever did.
 */
export function anySkillDisplayName(raw: string | null | undefined): string {
  if (!raw) return "Unknown module";
  if (isRepSkillId(raw)) return REP_SKILL_MANIFEST[raw].name;
  return showtimeSkillName(raw);
}
