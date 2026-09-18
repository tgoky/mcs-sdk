// src/lib/worker-skill-hierarchy.ts
//
// Maps every real, dispatchable skillRuns.skillName value — a worker's
// own primary id (worker-registry.ts's WORKER_IDS) AND a standalone chat
// sub-skill (chat-skill-manifest.ts's CHAT_SKILL_IDS, e.g. pin-down-voice)
// — to the one worker it logically belongs under and the one
// WorkerCategory (Setup / Monitoring / Outreach & Sequences / Analysis &
// Briefing / Crisis & Recovery) it falls into.
//
// Why this needs to exist at all: chat-skill-manifest.ts's own header
// explains that its 11 pieces deliberately sit OUTSIDE the worker
// enable/disable model (no toggle, no WorkerCategory of their own) — real
// for that file's purpose (they're always-available standalone actions,
// not a subscribed capability), but it leaves nothing mapping
// "pin-down-voice" back to "this is part of Pin-Down" or "this is a Setup
// action" for a UI that wants to group activity by either dimension. This
// is that missing map, built once here rather than every caller
// re-deriving it from name prefixes.
//
// Built for unified-activity-panel.tsx's worker/category rail, but not
// specific to it — any surface that needs "which worker owns this
// skillName" or "which category" can import this instead of re-deriving.

import { WORKER_IDS, WORKER_REGISTRY, type WorkerId, type WorkerCategory } from "@/lib/worker-registry";
import { CHAT_SKILL_IDS, type ChatSkillId } from "@/lib/chat-skill-manifest";

/**
 * A chat sub-skill's parent worker. Most map by obvious name prefix
 * (pin-down-voice -> pin-down); the 2 that don't literally share a name
 * with one worker (rep-crisis-stress-test, rep-draft-response) nest under
 * the worker whose job they most directly serve — rep-crisis-response,
 * since both are about testing/drafting a response to a flagged finding,
 * the same "final mile" reaction rep-crisis-response itself owns.
 */
const CHAT_SKILL_PARENT_WORKER: Record<ChatSkillId, WorkerId> = {
  "pin-down-voice": "pin-down",
  "pin-down-scripts": "pin-down",
  "pin-down-ad-briefs": "pin-down",
  "pin-down-page-audit": "pin-down",
  "pin-down-confirmation-page": "pin-down",
  "rep-engine-adhoc-check": "rep-engine-panel",
  "rep-crisis-stress-test": "rep-crisis-response",
  "rep-draft-response": "rep-crisis-response",
  "rep-twitter-deep-scan": "rep-twitter-watch",
  "rep-trustpilot-deep-scan": "rep-trustpilot-watch",
  "rep-reddit-deep-scan": "rep-reddit-watch",
};

// One deliberate override: pin-down-page-audit reads as an audit/report
// action, not a Setup one, even though its parent worker (pin-down) is
// Setup-classified as a whole. Every other chat sub-skill's purpose
// matches its parent worker's category exactly, so this is the only entry
// needed here.
const CATEGORY_OVERRIDE: Partial<Record<ChatSkillId, WorkerCategory>> = {
  "pin-down-page-audit": "Analysis & Briefing",
};

/** Every real skillName -> the one worker it belongs under. A worker's
 * own id maps to itself. */
export const WORKER_ID_FOR_SKILL: Record<string, WorkerId> = {
  ...(Object.fromEntries(WORKER_IDS.map((id) => [id, id])) as Record<string, WorkerId>),
  ...CHAT_SKILL_PARENT_WORKER,
};

/** Every real skillName -> its WorkerCategory (see CATEGORY_OVERRIDE for
 * the one case that isn't just its parent worker's own category). */
export const CATEGORY_FOR_SKILL: Record<string, WorkerCategory> = Object.fromEntries(
  Object.entries(WORKER_ID_FOR_SKILL).map(([skillName, workerId]) => [
    skillName,
    CATEGORY_OVERRIDE[skillName as ChatSkillId] ?? WORKER_REGISTRY[workerId].category,
  ])
);

/** Reverse index: every worker -> its own id plus any chat sub-skills
 * nested under it, in that order — what a "By Worker" rail's expanded
 * row lists. */
export const SKILLS_BY_WORKER: Record<WorkerId, string[]> = (() => {
  const map = Object.fromEntries(WORKER_IDS.map((id) => [id, [id] as string[]])) as Record<WorkerId, string[]>;
  for (const chatId of CHAT_SKILL_IDS) {
    map[CHAT_SKILL_PARENT_WORKER[chatId]].push(chatId);
  }
  return map;
})();

export function workerIdForSkill(skillName: string | null | undefined): WorkerId | null {
  if (!skillName) return null;
  return WORKER_ID_FOR_SKILL[skillName] ?? null;
}

export function workerCategoryForSkill(skillName: string | null | undefined): WorkerCategory | null {
  if (!skillName) return null;
  return CATEGORY_FOR_SKILL[skillName] ?? null;
}
