// Reputation Manager's own skill catalog — pure data only, mirrors
// skill-manifest.ts's own file-split reasoning (client components can
// import names/descriptions without pulling in server-only code).
//
// Deliberately its OWN type/registry, not folded into Showtime's SkillId /
// SKILL_MANIFEST / SKILL_IDS: those three are consumed by 28 files across
// this app (dashboard nav, the per-engagement Skills panel, the setup
// wizard, the Showtime library page — see primary-nav.ts, skills-nav-
// list.tsx, skills-panel.tsx among others), every one of which iterates
// SKILL_IDS assuming it names exactly Showtime's 5 skills. Widening that
// union to include Reputation Manager's ids would silently leak a "Rep
// Onboarding" entry into every one of those Showtime surfaces for every
// workspace, including ones that never installed Reputation Manager at
// all — a real UI bug, not a hypothetical one (confirmed by reading
// skills-nav-list.tsx and primary-nav.ts, both of which render nav links
// straight off SKILL_IDS.map()).
//
// What IS shared across products: engagementSkills.skillId and
// skillRuns.skillName are free-text DB columns with no enum constraint —
// confirmed against schema.ts — so this catalog's ids live in the exact
// same tables Showtime's skills do, with zero migration. The one place
// that actually needs to know about both catalogs is the generic Inngest
// dispatcher (src/inngest/skill.ts), which checks isSkillId() then
// isRepSkillId() in sequence — see that file's comment for why a simple
// two-registry lookup chain is the right amount of generalization today,
// with a real third product being the trigger to generalize further, not
// a guess made now from a sample size of one.

export type RepSkillId = "rep-onboarding";

export const REP_SKILL_IDS: RepSkillId[] = ["rep-onboarding"];

export interface RepSkillManifestEntry {
  id: RepSkillId;
  name: string;
  description: string;
  /** Same contract as SkillManifestEntry.runOnSetup (skill-manifest.ts):
   * true for a skill with its own dedicated setup endpoint that has to
   * run before the skill means anything, rather than something that just
   * waits on a webhook or cron. rep-onboarding is Reputation Manager's
   * Pin-Down equivalent — every other Reputation Manager skill will read
   * repIdentityGraphs, so nothing else in this product can mean anything
   * until this one has run once per engagement. */
  runOnSetup: boolean;
  /** Same contract as SkillManifestEntry.hasHingesPanel: true if there's a
   * dedicated config screen for this skill beyond generic platform
   * connections. */
  hasHingesPanel: boolean;
}

export const REP_SKILL_MANIFEST: Record<RepSkillId, RepSkillManifestEntry> = {
  "rep-onboarding": {
    id: "rep-onboarding",
    name: "Identity Setup",
    description:
      "Captures the client's identity graph — brand, entities, competitors, same-name collisions, and sole response authority — that every other Reputation Manager skill reads.",
    runOnSetup: true,
    hasHingesPanel: true,
  },
};

export function isRepSkillId(value: string): value is RepSkillId {
  return (REP_SKILL_IDS as string[]).includes(value);
}
