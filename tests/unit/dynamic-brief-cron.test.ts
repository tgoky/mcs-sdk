import { describe, it, expect, vi } from "vitest";

const rows = [
  { engagementId: "ready", deletedAt: null, pausedAt: null, stack: { brief_trigger_type: "dynamic_webhook", booking_platform: "calendly", booking_platform_credentials_ref: "secrets://ready/calendly_key" } },
  { engagementId: "incomplete", deletedAt: null, pausedAt: null, stack: { brief_trigger_type: "dynamic_webhook", booking_platform: "calendly", booking_platform_credentials_ref: "secrets://incomplete/calendly_key" } },
  { engagementId: "nightly", deletedAt: null, pausedAt: null, stack: { brief_trigger_type: "nightly", booking_platform: "calendly", booking_platform_credentials_ref: "x" } },
];
// One page of clients, then an empty page.
let pagesServed = 0;
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => (pagesServed++ === 0 ? rows : []) }) }) }) }) },
}));
vi.mock("@/lib/engagement-skills", () => ({ getDisabledEngagementIdsForSkill: async () => new Set<string>(), isSkillEnabledForEngagement: async () => true }));
vi.mock("@/lib/worker-config-completeness", () => ({
  getMissingRequiredFields: async (_skill: string, id: string) => (id === "incomplete" ? [{ label: "Brief destination", reason: "not set" }] : []),
}));
const startRun = vi.fn(async () => undefined);
vi.mock("@/lib/run-log", () => ({ startRuns: (...a: unknown[]) => startRun(...(a as [])), startRun: vi.fn(), closeStaleRun: vi.fn(), notifyRunOutcome: vi.fn(), failRun: vi.fn(), findStaleRunIds: vi.fn(), markRunExecuting: vi.fn(), logStep: vi.fn(), finishRun: vi.fn(), QUEUED_RUN_CEILING_MINUTES: 1440 }));

import { dynamicBriefCron } from "@/inngest/crons";
import { fakeStep, runInngestHandler } from "../helpers/inngest-fn";

describe("dynamic-brief cron", () => {
  it("sends dynamic clients through the shared pre-call-read dispatcher, skipping incomplete setups", async () => {
    const step = fakeStep();
    const result = await runInngestHandler(dynamicBriefCron, { step });

    expect(result).toEqual({ dispatched: 1 });
    // One bulk insert for the page, holding the one due client.
    expect(startRun).toHaveBeenCalledTimes(1);
    expect((startRun.mock.calls[0] as unknown as [Array<{ engagementId: string }>])[0].map((r) => r.engagementId)).toEqual(["ready"]);
    const sent = (step.sendEvent.mock.calls[0] as unknown as [string, Array<{ name: string; data: Record<string, unknown> }>])[1];
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("skill/run.execute");
    expect(sent[0].data).toMatchObject({ engagementId: "ready", skillName: "pre-call-read", briefTrigger: "dynamic_webhook", lane: "pre-call-read" });
    expect(typeof sent[0].data.notBefore).toBe("string");
  });
});
