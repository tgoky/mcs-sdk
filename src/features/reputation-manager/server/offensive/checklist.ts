import { db } from "@/lib/db";
import { repOffensiveChecklist } from "@/models/schema";
import { and, eq } from "drizzle-orm";

export type OffensiveMove = "a" | "b" | "c";

/**
 * The fixed checklist items per move, ported from the offensive templates'
 * own step lists (offensive/schema-wikidata.md's A.1/A.2 deploy steps,
 * offensive/pitch-package.md's outreach checklist, offensive/reddit-ramp.md's
 * cadence + knock-on-updates checklist). Stored here as the source of truth
 * for labels/order; repOffensiveChecklist rows only need to carry itemKey +
 * completed, matching engagementSkills' free-text-key convention — a step's
 * wording can change here without a migration.
 */
export const OFFENSIVE_CHECKLIST_ITEMS: Record<OffensiveMove, { key: string; label: string }[]> = {
  a: [
    { key: "generate_jsonld", label: "Generate the website code on this page" },
    { key: "paste_jsonld_all_domains", label: "Add the code to the header of every website you own" },
    { key: "verify_rich_results", label: "Check each site with Google's Rich Results Test (free, paste the URL)" },
    { key: "resubmit_sitemaps", label: "Ask Google to re-read each site (resubmit the sitemap in Search Console)" },
    { key: "create_wikidata_item", label: "Create a Wikidata page: name, one-line description, other names" },
    { key: "add_statements", label: "Add the facts from the table on this page (job, website, social profiles, company)" },
    { key: "add_references", label: "Add a source link and today's date to each fact" },
  ],
  b: [
    { key: "build_target_list", label: "List the top publications and writers to contact" },
    { key: "draft_pitches", label: "Write a short pitch for each one" },
    { key: "week1_first_batch", label: "Week 1: send the first batch" },
    { key: "week2_follow_up", label: "Week 2: send one follow-up to anyone who didn't reply" },
    { key: "weeks3_4_next_batch", label: "Weeks 3-4: send the next batch" },
    { key: "setup_inbound_expert_quote", label: "Sign up on expert-quote sites so reporters can find you" },
  ],
  c: [
    { key: "confirm_handle", label: "Pick one Reddit username and stick with it" },
    { key: "build_subreddit_map", label: "Choose the subreddits to join, from most to least relevant" },
    { key: "weeks1_2_foundation", label: "Weeks 1-2: only comment, no links or self-promotion, until you have 50+ karma" },
    { key: "weeks3_4_first_posts", label: "Weeks 3-4: start making your own posts" },
    { key: "weeks5_12_full_cadence", label: "Weeks 5-12: keep commenting and posting on a steady schedule" },
    { key: "knock_on_updates", label: "Add the Reddit profile to your website code, Wikidata page, and Trustpilot profile" },
  ],
};

export interface ChecklistItemState {
  key: string;
  label: string;
  completed: boolean;
  completedAt: Date | null;
}

/** Every item for one move, merged against whatever's actually been checked off for this engagement. */
export async function getChecklist(engagementId: string, move: OffensiveMove): Promise<ChecklistItemState[]> {
  const rows = await db
    .select({ itemKey: repOffensiveChecklist.itemKey, completed: repOffensiveChecklist.completed, completedAt: repOffensiveChecklist.completedAt })
    .from(repOffensiveChecklist)
    .where(and(eq(repOffensiveChecklist.engagementId, engagementId), eq(repOffensiveChecklist.move, move)));

  const byKey = new Map(rows.map((r) => [r.itemKey, r]));

  return OFFENSIVE_CHECKLIST_ITEMS[move].map((item) => {
    const row = byKey.get(item.key);
    return { key: item.key, label: item.label, completed: row?.completed ?? false, completedAt: row?.completedAt ?? null };
  });
}

export async function setChecklistItem(engagementId: string, move: OffensiveMove, itemKey: string, completed: boolean): Promise<void> {
  const known = OFFENSIVE_CHECKLIST_ITEMS[move].some((item) => item.key === itemKey);
  if (!known) throw new Error(`Unknown checklist item "${itemKey}" for move ${move}.`);

  await db
    .insert(repOffensiveChecklist)
    .values({ engagementId, move, itemKey, completed, completedAt: completed ? new Date() : null })
    .onConflictDoUpdate({
      target: [repOffensiveChecklist.engagementId, repOffensiveChecklist.move, repOffensiveChecklist.itemKey],
      set: { completed, completedAt: completed ? new Date() : null },
    });
}
