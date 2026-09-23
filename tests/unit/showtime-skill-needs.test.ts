import { describe, it, expect } from "vitest";
import { needsFor, SHOWTIME_SKILLS } from "@/lib/showtime-setup/skills";
import { SKILL_IDS } from "@/lib/skill-manifest";

describe("needsFor", () => {
  it("covers every Showtime skill", () => {
    expect(SHOWTIME_SKILLS.map((s) => s.id).sort()).toEqual([...SKILL_IDS].sort());
  });

  it("asks nothing when no skill is on", () => {
    const n = needsFor([]);
    expect([...n.groups]).toEqual([]);
    expect(n.offer).toBe(false);
    expect(n.website).toBe(false);
  });

  it("asks only for a booking tool (CRM optional) for just the Funnel Audit", () => {
    const n = needsFor(["leak-map"]);
    expect([...n.groups]).toEqual(["booking"]);
    expect([...n.optionalGroups]).toEqual(["email"]);
    expect(n.offer).toBe(false);
    expect(n.website).toBe(false);
  });

  it("adds hosting, the offer and the website only with the confirmation page", () => {
    const n = needsFor(["leak-map", "pin-down"]);
    expect([...n.groups].sort()).toEqual(["booking", "email", "hosting"]);
    expect(n.optionalGroups.size).toBe(0);
    expect(n.offer).toBe(true);
    expect(n.website).toBe(true);
    expect(n.picks.has("webflow_site_id")).toBe(true);
  });
});
