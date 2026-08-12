export type SkillId = "pin-down" | "pile-on" | "pre-call-read" | "win-back" | "leak-map";

export const SKILL_IDS: SkillId[] = ["pin-down", "pile-on", "pre-call-read", "win-back", "leak-map"];

export interface SkillManifestEntry {
  id: SkillId;
  name: string;
  description: string;
  /**
   * True for a bridge that has its own dedicated config screen (hinges)
   * it needs filled in before it can mean anything to turn on — no
   * webhook or cron for it to just wait on. Today: Pin-Down alone, via
   * its own POST /api/engagements/[id]/bridges/pin-down endpoint, which
   * saves those inputs and dispatches the run together. The generic
   * per-bridge enable route (POST
   * /api/engagements/[id]/skills/[skillId]) checks this flag and refuses
   * to "enable" a runOnSetup bridge directly, pointing at its own
   * endpoint instead — so a future runOnSetup bridge gets the same
   * protection and UI routing for free, just by setting this flag.
   */
  runOnSetup: boolean;
  /**
   * True for a bridge with a dedicated hinges page at
   * /dashboard/engagements/[id]/bridges/[skillId], whether or not it
   * gates enabling (see runOnSetup) — Pin-Down's gates, Win-Back's is an
   * optional review/edit screen since its fields all have sane defaults.
   * Drives the "configure" affordance on the engagement detail page's
   * Skills panel. False means there's genuinely nothing bridge-specific
   * to configure beyond the shared platform connections already covered
   * by edit-stack-settings.tsx — confirmed by tracing every field this
   * bridge's wizard section touched to its real snake_case stack-key
   * reader, not assumed from the wizard's own (sometimes wrong, see
   * Pin-Down's three courtesy-audit fields) inline comments.
   */
  hasHingesPanel: boolean;
}

/**
 * Pure data only — no executor functions. src/lib/skill-registry.ts wraps
 * this with each skill's execute function for server-side dispatch; this
 * file exists separately so client components (e.g. the Skills panel on
 * the engagement detail page) can import names/descriptions without
 * pulling onboarding-service.ts, audit-engine.ts, etc. — and everything
 * those import (db drivers, Node built-ins) — into the browser bundle.
 */
// Display-layer rename (2026-08-07 handoff, "The 5 skill renames, locked").
// This is the ONLY place these 5 display names are authored — copy.ts's
// SKILL_INFO, queue-panel.tsx, master-roster-calendar.tsx, and
// inbox/page.tsx all derive their labels from this file now instead of
// keeping their own copies (that's what Finding A's naming-source-drift
// bug was: three-plus components independently hardcoding the same name
// and drifting out of sync). Internal ids (SkillId/SKILL_IDS below),
// database skillRuns.skillName values, route segments, Inngest event
// names, and schema JSON keys are all deliberately untouched — this is a
// display rename only, not a data migration. The 7 LLM system prompts
// that separately name these skills (brief-service.ts, cadence-builder.ts,
// both hybrid-personalizer.ts files, audit-engine.ts) and
// export-to-skill-pack.ts (writes flow names into the buyer's own Klaviyo/
// GHL account) are excluded from this pass on purpose — those need their
// own testing pass, not a find-and-replace.
export const SKILL_MANIFEST: Record<SkillId, SkillManifestEntry> = {
  "pin-down": {
    id: "pin-down",
    name: "Show Rate Setup",
    description:
      "Onboards a new client: learns their brand voice, drafts ad creative briefs, video scripts, and a confirmation page, and wires up their booking webhook.",
    runOnSetup: true,
    hasHingesPanel: true,
  },
  "pile-on": {
    id: "pile-on",
    name: "Pre-Call Sequence",
    description: "Enrolls booked prospects into pre-call and win-back sequences as bookings come in via webhook.",
    runOnSetup: false,
    hasHingesPanel: false,
  },
  "pre-call-read": {
    id: "pre-call-read",
    name: "Call Brief",
    description: "Nightly briefing cycle: researches tomorrow's booked calls and delivers a brief before each one.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "win-back": {
    id: "win-back",
    name: "Booking Recovery",
    description: "Generates and manages a re-engagement cadence for prospects who went cold.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
  "leak-map": {
    id: "leak-map",
    name: "Funnel Audit",
    description: "Audits the funnel for drop-off points and produces a report.",
    runOnSetup: false,
    hasHingesPanel: true,
  },
};

export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as string[]).includes(value);
}
