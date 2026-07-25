export type SkillId = "pin-down" | "pile-on" | "pre-call-read" | "win-back" | "leak-map";

export const SKILL_IDS: SkillId[] = ["pin-down", "pile-on", "pre-call-read", "win-back", "leak-map"];

export interface SkillManifestEntry {
  id: SkillId;
  name: string;
  description: string;
  /**
   * True for the one skill that a freshly-saved engagement should launch
   * automatically on its first run — see /api/pin-down/launch, which
   * loops over getSkillsRunOnSetup() (src/lib/skill-registry.ts) instead
   * of hardcoding "pin-down" so a future agent with a different (or no)
   * setup-time skill doesn't mean touching that route.
   */
  runOnSetup: boolean;
}

/**
 * Pure data only — no executor functions. src/lib/skill-registry.ts wraps
 * this with each skill's execute function for server-side dispatch; this
 * file exists separately so client components (e.g. the Skills panel on
 * the engagement detail page) can import names/descriptions without
 * pulling onboarding-service.ts, audit-engine.ts, etc. — and everything
 * those import (db drivers, Node built-ins) — into the browser bundle.
 */
export const SKILL_MANIFEST: Record<SkillId, SkillManifestEntry> = {
  "pin-down": {
    id: "pin-down",
    name: "Pin-Down",
    description:
      "Onboards a new client: learns their brand voice, drafts ad creative briefs, video scripts, and a confirmation page, and wires up their booking webhook.",
    runOnSetup: true,
  },
  "pile-on": {
    id: "pile-on",
    name: "Pile-On",
    description: "Enrolls booked prospects into pre-call and win-back sequences as bookings come in via webhook.",
    runOnSetup: false,
  },
  "pre-call-read": {
    id: "pre-call-read",
    name: "Pre-Call Read",
    description: "Nightly briefing cycle: researches tomorrow's booked calls and delivers a brief before each one.",
    runOnSetup: false,
  },
  "win-back": {
    id: "win-back",
    name: "Win-Back",
    description: "Generates and manages a re-engagement cadence for prospects who went cold.",
    runOnSetup: false,
  },
  "leak-map": {
    id: "leak-map",
    name: "Leak-Map",
    description: "Audits the funnel for drop-off points and produces a report.",
    runOnSetup: false,
  },
};

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as string[]).includes(value);
}
