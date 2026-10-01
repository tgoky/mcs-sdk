import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { executeSkillRun, SKILL_RUNS_PER_CLIENT } from "@/inngest/skill";
import { processSingleProspectBrief } from "@/features/pre-call-read/server/brief-service";
import { skillRunEvent, skillRunLane } from "@/lib/inngest";
import { inngestOptions } from "../helpers/inngest-fn";

describe("skill run lock", () => {
  it("locks per client and lane, caps runs per client, and puts waiting people first", () => {
    const opts = inngestOptions(executeSkillRun) as {
      concurrency: { key: string; limit: number }[];
      priority: { run: string };
      timeouts: { start: string };
    };
    expect(opts.concurrency).toEqual([
      { key: 'event.data.engagementId + ":" + event.data.lane', limit: 1 },
      { key: "event.data.engagementId", limit: SKILL_RUNS_PER_CLIENT },
    ]);
    expect(SKILL_RUNS_PER_CLIENT).toBe(3);
    expect(opts.priority.run).toBe("event.data.interactive == true ? 600 : 0");
    expect(opts.timeouts.start).toBe("1440m");
  });

  it("gives Pin-Down and its chat skills one lane, and every other skill its own", () => {
    for (const s of ["pin-down", "pin-down-voice", "pin-down-scripts", "pin-down-ad-briefs", "pin-down-page-audit", "pin-down-confirmation-page"]) {
      expect(skillRunLane(s)).toBe("pin-down");
    }
    expect(skillRunLane("daily-send")).toBe("daily-send");
    expect(skillRunLane("rep-draft-response")).toBe("rep-draft-response");
  });

  it("stamps every run event with its lane and whether someone is waiting", () => {
    expect(skillRunEvent({ runId: "r", engagementId: "e", skillName: "pin-down-scripts", interactive: true }).data).toMatchObject({ lane: "pin-down", interactive: true });
    expect(skillRunEvent({ runId: "r", engagementId: "e", skillName: "reply-sort", interactive: false }).data).toMatchObject({ lane: "reply-sort", interactive: false });
  });

  it("lets each client brief calls in parallel under an app-wide cap, instead of five slots for everyone", () => {
    const opts = inngestOptions(processSingleProspectBrief) as { concurrency: { key?: string; limit: number }[] };
    expect(opts.concurrency).toEqual([{ key: "event.data.engagementId", limit: 3 }, { limit: 10 }]);
  });
});
