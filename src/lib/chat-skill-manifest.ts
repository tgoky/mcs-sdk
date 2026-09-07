// Teammates chat's own skill catalog — the third registry the existing
// two (skill-manifest.ts for Showtime's 5, rep-skill-manifest.ts for
// Reputation Manager's 2) explicitly anticipated: rep-skill-manifest.ts's
// own header comment names "a real third product" as the trigger to
// generalize the isSkillId/isRepSkillId lookup chain further, rather than
// widening either existing union. This is that third case — not a guess.
//
// Deliberately NOT folded into SkillId/SKILL_MANIFEST/SKILL_IDS, same
// reasoning rep-skill-manifest.ts gives for its own separation: those are
// consumed by every Showtime-facing surface (Skills panel, setup wizard,
// nav) assuming SKILL_IDS names exactly the 5 real, subscribable skills.
// These aren't skills a client subscribes to or toggles on/off at all —
// they're one-shot utility actions Teammates chat can run for a client
// that's already past Pin-Down setup, individually, without re-running
// the whole onboarding wizard. No engagementSkills toggle row makes sense
// for "extract brand voice from a URL" the way it does for "Call Brief,
// on or off" — so these skip the enable/disable gate entirely (see
// chat-skill-trigger.ts) rather than being force-fit into that model.

export type ChatSkillId =
  | "pin-down-voice"
  | "pin-down-scripts"
  | "pin-down-ad-briefs"
  | "pin-down-page-audit"
  | "rep-engine-adhoc-check"
  | "rep-crisis-stress-test"
  | "rep-draft-response"
  | "rep-twitter-deep-scan"
  | "rep-trustpilot-deep-scan"
  | "rep-reddit-deep-scan";

export const CHAT_SKILL_IDS: ChatSkillId[] = [
  "pin-down-voice",
  "pin-down-scripts",
  "pin-down-ad-briefs",
  "pin-down-page-audit",
  "rep-engine-adhoc-check",
  "rep-crisis-stress-test",
  "rep-draft-response",
  "rep-twitter-deep-scan",
  "rep-trustpilot-deep-scan",
  "rep-reddit-deep-scan",
];

export interface ChatSkillManifestEntry {
  id: ChatSkillId;
  name: string;
  description: string;
}

export const CHAT_SKILL_MANIFEST: Record<ChatSkillId, ChatSkillManifestEntry> = {
  "pin-down-voice": {
    id: "pin-down-voice",
    name: "Brand Voice Extraction",
    description: "Crawls a client's website and distills a brand voice profile from it — the same extraction Show Rate Setup runs, on its own, from just a URL.",
  },
  "pin-down-scripts": {
    id: "pin-down-scripts",
    name: "Hero + Breakout Video Scripts",
    description: "Writes a hero confirmation-page video script plus breakout scripts for each top call question — the same script pack Show Rate Setup generates, standalone.",
  },
  "pin-down-ad-briefs": {
    id: "pin-down-ad-briefs",
    name: "Ad Creative Briefs",
    description: "Generates ad creative briefs across all 4 content pillars — the same output Show Rate Setup generates, standalone.",
  },
  "pin-down-page-audit": {
    id: "pin-down-page-audit",
    name: "Confirmation Page Audit",
    description: "Audits an existing confirmation page URL against what a well-built one should include, and notes concrete gaps — the same audit Show Rate Setup runs when a client already has a page, standalone. Does not build or deploy a new page — that's a bigger, separate action not wired up here.",
  },
  "rep-engine-adhoc-check": {
    id: "rep-engine-adhoc-check",
    name: "AI Engine Spot-Check",
    description:
      "Asks the client's configured AI engines a live, one-off question right now — about the client themselves, or about a named competitor already tracked in their identity graph. A live snapshot, not part of the scheduled AI Engine Watch panel — nothing gets written to the client's monitoring history.",
  },
  "rep-crisis-stress-test": {
    id: "rep-crisis-stress-test",
    name: "Crisis Threshold Stress-Test",
    description:
      "Scores a hypothetical finding through the exact same severity model the real Crisis Response skill uses, and reports whether it would cross this client's threshold — without declaring a real incident or notifying anyone. Lets an operator tune a client's threshold before a real crisis, not just react during one.",
  },
  "rep-draft-response": {
    id: "rep-draft-response",
    name: "Draft a Response",
    description:
      "Drafts a suggested public response to a flagged Trustpilot/Reddit/X finding (or an AI-engine answer), in the operator's own brand voice when one's on file. Does not post anywhere — the draft is for a human to review, edit, and post themselves.",
  },
  "rep-twitter-deep-scan": {
    id: "rep-twitter-deep-scan",
    name: "X/Twitter Deep Scan",
    description:
      "Scans X/Twitter back to a specific date, further than the regular daily watch's recent-only window — using X's own since: search operator, not a guess. Real mentions found this way get added to the client's real monitoring history, same as the regular watch.",
  },
  "rep-trustpilot-deep-scan": {
    id: "rep-trustpilot-deep-scan",
    name: "Trustpilot Deep Scan",
    description:
      "Scans Trustpilot back to a specific date using Outscraper's own documented cutoff parameter — a real, exact date-bound fetch, not a guess. Real reviews found this way get added to the client's real monitoring history, same as the regular watch.",
  },
  "rep-reddit-deep-scan": {
    id: "rep-reddit-deep-scan",
    name: "Reddit Deep Scan",
    description:
      "Widens the Reddit search beyond the regular daily watch's recency window, using verified sort=top + t=timeframe combinations Reddit's own search docs recommend for reaching older posts. Coarser than an exact date (timeframe buckets, not a specific day) since Reddit's search has no exact cutoff parameter. Real mentions found this way get added to the client's real monitoring history.",
  },
};

export function isChatSkillId(value: string): value is ChatSkillId {
  return (CHAT_SKILL_IDS as string[]).includes(value);
}
