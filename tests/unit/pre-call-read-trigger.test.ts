import { describe, it, expect, vi } from "vitest";

const cycle = vi.fn(async () => 0);
vi.mock("@/features/pre-call-read/server/brief-service", () => ({ executeNightlyBriefingCycle: (...a: unknown[]) => cycle(...(a as [])) }));
vi.mock("@/features/pin-down/server/onboarding-service", () => ({ runPinDownOnboarding: vi.fn() }));
vi.mock("@/features/leak-map/server/audit-engine", () => ({ AuditEngine: vi.fn() }));
vi.mock("@/features/win-back/server/recovery-service", () => ({ generateRecoveryCadence: vi.fn() }));

import { SKILL_REGISTRY } from "@/lib/skill-registry";

describe("pre-call-read executor", () => {
  it("briefs the dynamic window when the run was sent by the dynamic cron, nightly otherwise", async () => {
    await SKILL_REGISTRY["pre-call-read"].execute!({ engagementId: "e1" }, "run-1", undefined, { briefTrigger: "dynamic_webhook" });
    await SKILL_REGISTRY["pre-call-read"].execute!({ engagementId: "e1" }, "run-2", undefined, {});
    expect(cycle.mock.calls.map((c) => (c as unknown[])[3])).toEqual(["dynamic_webhook", "nightly"]);
  });
});
