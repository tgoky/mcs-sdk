import { db } from "@/lib/db";
import { repRedditRamp } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Move C — 90-day Reddit thread-density ramp (offensive/reddit-ramp.md).
 * Tracking and pure calculators only: this app never posts or comments on
 * Reddit on the operator's behalf, and never will — the template's own
 * banned-moves list (no vote brigading, no karma farming, no same-day
 * cross-posting, no identity preambles) exists precisely because
 * automation-shaped behavior on Reddit gets accounts shadowbanned, which
 * would defeat the entire tactic.
 */

export type SubredditTier = 1 | 2 | 3;

export interface RedditRampSubreddit {
  subreddit: string;
  tier: SubredditTier;
}

export interface RedditRampActivity {
  occurredAt: string;
  type: "comment" | "post";
  subreddit: string;
  note: string | null;
}

export interface RedditRampRow {
  id: string;
  confirmedHandle: string | null;
  startedAt: Date | null;
  subreddits: RedditRampSubreddit[];
  activityLog: RedditRampActivity[];
  createdAt: Date;
  updatedAt: Date;
}

export async function getRedditRamp(engagementId: string): Promise<RedditRampRow | null> {
  const [row] = await db.select().from(repRedditRamp).where(eq(repRedditRamp.engagementId, engagementId)).limit(1);
  return (row as RedditRampRow) ?? null;
}

async function ensureRamp(engagementId: string): Promise<void> {
  await db
    .insert(repRedditRamp)
    .values({ engagementId })
    .onConflictDoNothing({ target: repRedditRamp.engagementId });
}

/**
 * Confirms/locks the handle and (if not already set) starts the 90-day
 * clock. The template is explicit the handle should never be renamed
 * mid-stream since schema sameAs and Wikidata's P4265 end up referencing
 * it — so a second call with a different handle only updates the handle
 * string, it does not reset startedAt.
 */
export async function confirmRedditHandle(engagementId: string, handle: string): Promise<RedditRampRow> {
  if (!handle.trim()) throw new Error("Handle is required.");
  await ensureRamp(engagementId);

  const existing = await getRedditRamp(engagementId);
  const [row] = await db
    .update(repRedditRamp)
    .set({
      confirmedHandle: handle.trim(),
      startedAt: existing?.startedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(repRedditRamp.engagementId, engagementId))
    .returning();

  return row as RedditRampRow;
}

export async function setSubredditMap(engagementId: string, subreddits: RedditRampSubreddit[]): Promise<RedditRampRow> {
  await ensureRamp(engagementId);
  const [row] = await db
    .update(repRedditRamp)
    .set({ subreddits, updatedAt: new Date() })
    .where(eq(repRedditRamp.engagementId, engagementId))
    .returning();
  return row as RedditRampRow;
}

/**
 * Appends via a single atomic UPDATE (Postgres's jsonb `||` concat)
 * rather than read-the-array-then-write-it-back — see
 * pitch-package.ts's logPitchEvent for why the read-modify-write version
 * of this exact pattern is a real lost-update race, not just a style
 * preference.
 */
export async function logRedditActivity(
  engagementId: string,
  entry: { type: "comment" | "post"; subreddit: string; note?: string | null }
): Promise<RedditRampRow> {
  await ensureRamp(engagementId);

  const newEntry: RedditRampActivity = {
    type: entry.type,
    subreddit: entry.subreddit.trim(),
    note: entry.note?.trim() || null,
    occurredAt: new Date().toISOString(),
  };

  const [row] = await db
    .update(repRedditRamp)
    .set({
      activityLog: sql`${repRedditRamp.activityLog} || ${JSON.stringify([newEntry])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(repRedditRamp.engagementId, engagementId))
    .returning();

  if (!row) throw new Error("Reddit ramp not found.");
  return row as RedditRampRow;
}

export type RampPhase =
  | "not_started"
  | "weeks_1_2_foundation"
  | "weeks_3_4_unlock"
  | "weeks_5_12_full_cadence"
  | "complete";

/**
 * Maps elapsed days since startedAt onto the template's four cadence
 * windows. Purely a display/guidance calculator — it doesn't gate
 * anything in this app, since Reddit itself (via account age/karma) is
 * the actual gate; see computeKarmaGateStatus for that half.
 */
export function computeRampPhase(startedAt: Date | null, now: Date = new Date()): RampPhase {
  if (!startedAt) return "not_started";
  const elapsedDays = Math.floor((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (elapsedDays < 14) return "weeks_1_2_foundation";
  if (elapsedDays < 28) return "weeks_3_4_unlock";
  if (elapsedDays < 90) return "weeks_5_12_full_cadence";
  return "complete";
}

export interface KarmaGateStatus {
  visibleToOthers: boolean; // false below 10 karma (shadowfiltered range)
  selfPostsUnlocked: boolean; // 50+ karma AND 14+ days
  linksAllowed: boolean; // 30+ days AND 100+ karma, one link per post
  notes: string[];
}

/**
 * The karma/account-age gate table from the template — a pure calculator
 * over operator-reported karma and account age, not fetched from Reddit's
 * API (this app doesn't hold Reddit account credentials for the
 * operator's personal/brand account, deliberately, since Move C's whole
 * premise is a real human building it by hand).
 */
export function computeKarmaGateStatus(karma: number, accountAgeDays: number): KarmaGateStatus {
  const notes: string[] = [];
  const visibleToOthers = karma >= 10;
  const selfPostsUnlocked = karma >= 50 && accountAgeDays >= 14;
  const linksAllowed = accountAgeDays >= 30 && karma >= 100;

  if (!visibleToOthers) notes.push("Below 10 karma — comments may be shadowfiltered on some subreddits.");
  if (visibleToOthers && !selfPostsUnlocked) notes.push("Comments are visible, but self-posts need 50+ karma and a 14+ day old account.");
  if (accountAgeDays < 30) notes.push("Accounts under 30 days old should not post links.");
  else if (!linksAllowed) notes.push("Links are allowed at one per post once the account has 100+ karma.");

  return { visibleToOthers, selfPostsUnlocked, linksAllowed, notes };
}
