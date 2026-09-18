import { describe, it, expect } from "vitest";
import { WORKER_ID_FOR_SKILL, CATEGORY_FOR_SKILL, SKILLS_BY_WORKER, workerIdForSkill, workerCategoryForSkill } from "@/lib/worker-skill-hierarchy";
import { WORKER_IDS, WORKER_REGISTRY } from "@/lib/worker-registry";
import { CHAT_SKILL_IDS } from "@/lib/chat-skill-manifest";

describe("worker-skill-hierarchy", () => {
  it("maps every worker's own id to itself", () => {
    for (const id of WORKER_IDS) {
      expect(workerIdForSkill(id)).toBe(id);
    }
  });

  it("maps every chat sub-skill to a real worker id", () => {
    for (const chatId of CHAT_SKILL_IDS) {
      const worker = workerIdForSkill(chatId);
      expect(worker).not.toBeNull();
      expect(WORKER_IDS).toContain(worker);
    }
  });

  it("nests pin-down's chat sub-skills under the pin-down worker", () => {
    expect(workerIdForSkill("pin-down-voice")).toBe("pin-down");
    expect(workerIdForSkill("pin-down-scripts")).toBe("pin-down");
    expect(workerIdForSkill("pin-down-ad-briefs")).toBe("pin-down");
    expect(workerIdForSkill("pin-down-confirmation-page")).toBe("pin-down");
  });

  it("nests the two crisis-adjacent chat sub-skills under rep-crisis-response", () => {
    expect(workerIdForSkill("rep-crisis-stress-test")).toBe("rep-crisis-response");
    expect(workerIdForSkill("rep-draft-response")).toBe("rep-crisis-response");
  });

  it("nests each deep-scan chat sub-skill under its matching daily-watch worker", () => {
    expect(workerIdForSkill("rep-twitter-deep-scan")).toBe("rep-twitter-watch");
    expect(workerIdForSkill("rep-trustpilot-deep-scan")).toBe("rep-trustpilot-watch");
    expect(workerIdForSkill("rep-reddit-deep-scan")).toBe("rep-reddit-watch");
  });

  it("returns null for an unrecognized skillName rather than a wrong guess", () => {
    expect(workerIdForSkill("not-a-real-skill")).toBeNull();
    expect(workerCategoryForSkill("not-a-real-skill")).toBeNull();
  });

  it("returns null for a null/undefined skillName", () => {
    expect(workerIdForSkill(null)).toBeNull();
    expect(workerIdForSkill(undefined)).toBeNull();
  });

  it("gives every chat sub-skill except pin-down-page-audit its parent worker's exact category", () => {
    for (const chatId of CHAT_SKILL_IDS) {
      if (chatId === "pin-down-page-audit") continue;
      const parent = WORKER_ID_FOR_SKILL[chatId];
      expect(CATEGORY_FOR_SKILL[chatId]).toBe(WORKER_REGISTRY[parent].category);
    }
  });

  it("overrides pin-down-page-audit to Analysis & Briefing even though its parent worker is Setup", () => {
    expect(WORKER_REGISTRY["pin-down"].category).toBe("Setup");
    expect(workerCategoryForSkill("pin-down-page-audit")).toBe("Analysis & Briefing");
  });

  it("lists every worker's own id first in SKILLS_BY_WORKER, followed by its nested chat sub-skills", () => {
    expect(SKILLS_BY_WORKER["pin-down"][0]).toBe("pin-down");
    expect(SKILLS_BY_WORKER["pin-down"]).toEqual(
      expect.arrayContaining(["pin-down-voice", "pin-down-scripts", "pin-down-ad-briefs", "pin-down-page-audit", "pin-down-confirmation-page"])
    );
    expect(SKILLS_BY_WORKER["pin-down"]).toHaveLength(6);
  });

  it("gives a worker with no chat sub-skills a single-entry list (just itself)", () => {
    expect(SKILLS_BY_WORKER["leak-map"]).toEqual(["leak-map"]);
  });

  it("covers every worker id in SKILLS_BY_WORKER, even ones with no nested sub-skills", () => {
    for (const id of WORKER_IDS) {
      expect(SKILLS_BY_WORKER[id]).toBeDefined();
      expect(SKILLS_BY_WORKER[id].length).toBeGreaterThanOrEqual(1);
    }
  });
});
