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
    { key: "generate_jsonld", label: "Generate the Schema.org JSON-LD graph" },
    { key: "paste_jsonld_all_domains", label: "Paste the JSON-LD into every owned domain's <head>" },
    { key: "verify_rich_results", label: "Verify each domain via Google's Rich Results Test" },
    { key: "resubmit_sitemaps", label: "Resubmit sitemaps in Search Console" },
    { key: "create_wikidata_item", label: "Create the Wikidata item (Label / Description / Aliases)" },
    { key: "add_statements", label: "Add the statements table (instance-of, occupation, official website, socials, founder-of, disambiguation)" },
    { key: "add_references", label: "Attach a reference URL + retrieved-date to every statement" },
  ],
  b: [
    { key: "build_target_list", label: "Build the Tier-1 target list (publication, beat, contact, channel, fit)" },
    { key: "draft_pitches", label: "Draft a pitch per target from one of the three archetypes" },
    { key: "week1_first_batch", label: "Week 1 — send the first batch" },
    { key: "week2_follow_up", label: "Week 2 — one follow-up only per unanswered target" },
    { key: "weeks3_4_next_batch", label: "Weeks 3-4 — send the next batch" },
    { key: "setup_inbound_expert_quote", label: "Set up inbound expert-quote platform profiles" },
  ],
  c: [
    { key: "confirm_handle", label: "Confirm and lock the Reddit handle (never rename mid-stream)" },
    { key: "build_subreddit_map", label: "Build the 3-tier subreddit map" },
    { key: "weeks1_2_foundation", label: "Weeks 1-2 — comment-only foundation, no links or brand mentions, build karma past 50" },
    { key: "weeks3_4_first_posts", label: "Weeks 3-4 — first self-posts unlock" },
    { key: "weeks5_12_full_cadence", label: "Weeks 5-12 — full comment + post cadence" },
    { key: "knock_on_updates", label: "Add the confirmed handle to identity data, schema sameAs, Wikidata P4265, and Trustpilot's social field" },
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
