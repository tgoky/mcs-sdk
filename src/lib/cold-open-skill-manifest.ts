// Cold Open's own skill catalog — pure data only, mirrors skill-manifest.ts
// and rep-skill-manifest.ts's own file-split reasoning (client components
// import names/descriptions without pulling server-only code into the
// browser bundle).
//
// Deliberately its own type/registry rather than widening SkillId or
// RepSkillId, same reasoning rep-skill-manifest.ts's header gives for its
// own separation — every Showtime-facing surface iterates SKILL_IDS
// assuming it names exactly Showtime's 5 skills, and Reputation Manager's
// own surfaces assume the same of REP_SKILL_IDS.
//
// These 7 ids mirror the Cold Open skill pack's own 7 Claude Skills
// (icp-lock, voice-capture, source-connect, send-connect, daily-send,
// reply-sort, send-report — see COLD_OPEN_SKILL_PACK_REVIEW.md) one to
// one, hosted here instead of run standalone in the buyer's own Claude
// session — the same "OG Claude Skill Pack -> hosted worker" inversion
// this app already did for pin-down, win-back, and every Reputation
// Manager skill.

export type ColdOpenSkillId =
  | "icp-lock"
  | "voice-capture"
  | "source-connect"
  | "send-connect"
  | "daily-send"
  | "reply-sort"
  | "send-report";

export const COLD_OPEN_SKILL_IDS: ColdOpenSkillId[] = [
  "icp-lock",
  "voice-capture",
  "source-connect",
  "send-connect",
  "daily-send",
  "reply-sort",
  "send-report",
];

export interface ColdOpenSkillManifestEntry {
  id: ColdOpenSkillId;
  name: string;
  description: string;
  /** Same contract as SkillManifestEntry.runOnSetup (skill-manifest.ts):
   * true for a skill with its own dedicated setup endpoint that has to run
   * before the skill means anything. icp-lock is Cold Open's Pin-Down/
   * rep-onboarding equivalent — every other Cold Open skill reads
   * coldOpenConfig, and nothing in this product means anything until the
   * ICPs, sizing bounds, and product identity it captures exist. */
  runOnSetup: boolean;
  /** Same contract as SkillManifestEntry.hasHingesPanel: true for a skill
   * with real config beyond what an earlier Cold Open skill already
   * captured. reply-sort and send-report need nothing beyond send-connect's
   * platform choice and daily-send's own run history — same "needs nothing
   * beyond onboarding" pattern Reputation Manager's 5 watch/response skills
   * already established for this app. */
  hasHingesPanel: boolean;
}

export const COLD_OPEN_SKILL_MANIFEST: Record<ColdOpenSkillId, ColdOpenSkillManifestEntry> = {
  "icp-lock": {
    id: "icp-lock",
    name: "ICP Lock",
    description: "Captures who this client sells to, their sizing sweet-spot and disqualifiers, and their product identity — the config spine every other Cold Open skill reads.",
    runOnSetup: true,
    hasHingesPanel: true,
  },
  "voice-capture": {
    id: "voice-capture",
    name: "Voice Capture",
    description: "Sets the greeting, sign-off, and tone Daily Send writes in — from the client's own site, or templates entered directly.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "source-connect": {
    id: "source-connect",
    name: "Source Connect",
    description: "Connects a lead source (CSV upload today; Apify and Sales Navigator are accepted as a config choice but not yet verified end to end) and runs a small test pull.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "send-connect": {
    id: "send-connect",
    name: "Send Connect",
    description: "Connects the sending platform (Instantly, SmartLead, Reply.io, or Lemlist), maps each ICP to a real campaign, and checks sending-domain DNS.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "daily-send": {
    id: "daily-send",
    name: "Daily Send",
    description: "The recurring pipeline: fetch fresh leads, filter to ICP, write rotated subject/body copy, push to the mapped campaign, and report the batch.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "reply-sort": {
    id: "reply-sort",
    name: "Reply Sort",
    description: "Classifies inbound replies (interested / not-now / not-a-fit / objection / auto-reply / unsubscribe) and routes anything real to the Queue.",
    runOnSetup: false,
    hasHingesPanel: false,
  },
  "send-report": {
    id: "send-report",
    name: "Send Report",
    description: "Rolls up send volume, push outcomes, and reply dispositions into a weekly summary.",
    runOnSetup: false,
    hasHingesPanel: false,
  },
};

export function isColdOpenSkillId(value: string): value is ColdOpenSkillId {
  return (COLD_OPEN_SKILL_IDS as string[]).includes(value);
}
