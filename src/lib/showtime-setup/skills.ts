// src/lib/showtime-setup/skills.ts
//
// Showtime's five skills as the setup screen offers them, and what each
// one actually needs, so the screen only asks for what the skills this
// client switched on will use. The needs mirror the readiness checks in
// worker-config-completeness.ts (what would stop a run) plus the tools a
// skill reads from at run time. Client-safe.

import type { SkillId } from "@/lib/skill-manifest";
import type { ToolGroupId } from "./catalog";
import type { PickSlot } from "./types";

export interface ShowtimeSkillNeeds {
  /** Tool groups the skill can't run without. */
  groups: ToolGroupId[];
  /** Tool groups it uses when present (Funnel Audit reads a CRM's pipeline). */
  optionalGroups?: ToolGroupId[];
  /** Needs the offer described (name, price, who it's for, industry, lead warmth). */
  offer: boolean;
  /** The website is required, not just helpful. */
  website: boolean;
  picks: PickSlot[];
  choices: ("smsPlatform" | "adDataPlatform" | "briefLandingDestination")[];
}

export interface ShowtimeSkill {
  id: SkillId;
  /** What it does, in a few words, for the switch row. */
  blurb: string;
  needs: ShowtimeSkillNeeds;
}

export const SHOWTIME_SKILLS: ShowtimeSkill[] = [
  {
    id: "pin-down",
    blurb: "A confirmation page in the client's brand after every booking",
    needs: { groups: ["booking", "email", "hosting"], offer: true, website: true, picks: ["webflow_site_id", "vercel_project_name"], choices: [] },
  },
  {
    id: "pile-on",
    blurb: "Warm-up emails and texts between booking and the call",
    needs: { groups: ["booking", "email"], offer: false, website: false, picks: ["target_list_id", "target_workflow_id"], choices: ["smsPlatform", "adDataPlatform"] },
  },
  {
    id: "pre-call-read",
    blurb: "A brief on each prospect before every call",
    needs: { groups: ["booking"], optionalGroups: ["email"], offer: false, website: false, picks: [], choices: ["briefLandingDestination"] },
  },
  {
    id: "win-back",
    blurb: "A rebooking sequence for anyone who no-shows",
    needs: { groups: ["booking", "email"], offer: false, website: false, picks: ["recovery_list_id", "recovery_workflow_id"], choices: [] },
  },
  {
    id: "leak-map",
    blurb: "A weekly report on where booked calls leak out",
    needs: { groups: ["booking"], optionalGroups: ["email"], offer: false, website: false, picks: [], choices: [] },
  },
];

export interface CombinedNeeds {
  groups: Set<ToolGroupId>;
  optionalGroups: Set<ToolGroupId>;
  offer: boolean;
  website: boolean;
  picks: Set<PickSlot>;
  choices: Set<string>;
}

/** Everything the chosen skills need, merged. */
export function needsFor(skills: readonly string[]): CombinedNeeds {
  const out: CombinedNeeds = { groups: new Set(), optionalGroups: new Set(), offer: false, website: false, picks: new Set(), choices: new Set() };
  for (const skill of SHOWTIME_SKILLS) {
    if (!skills.includes(skill.id)) continue;
    skill.needs.groups.forEach((g) => out.groups.add(g));
    skill.needs.optionalGroups?.forEach((g) => out.optionalGroups.add(g));
    skill.needs.picks.forEach((p) => out.picks.add(p));
    skill.needs.choices.forEach((c) => out.choices.add(c));
    out.offer ||= skill.needs.offer;
    out.website ||= skill.needs.website;
  }
  for (const g of out.groups) out.optionalGroups.delete(g);
  return out;
}
