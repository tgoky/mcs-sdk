// "Run now" on the Whop reports (dashboard or chat) has a person waiting,
// so the run goes ahead of scheduled work like every other manual run.
import { describe, it, expect, vi } from "vitest";

const { sent } = vi.hoisted(() => ({ sent: [] as { data: Record<string, unknown> }[] }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/run-log", () => ({ startRun: vi.fn(async () => {}), logStep: vi.fn(), finishRun: vi.fn(), failRun: vi.fn(), emptySummary: vi.fn() }));
vi.mock("@/lib/inngest", async (orig) => {
  const real = await orig<typeof import("@/lib/inngest")>();
  return { ...real, inngest: { ...real.inngest, send: vi.fn(async (e: { data: Record<string, unknown> }) => { sent.push(e); }) } };
});

describe("Whop report Run now", () => {
  it("dispatches both reports as interactive", async () => {
    const { dispatchWeeklyOpsReportRun } = await import("@/features/whop-agent/server/weekly-ops-report-service");
    const { dispatchPortfolioRollupRun } = await import("@/features/whop-agent/server/portfolio-rollup-service");
    await dispatchWeeklyOpsReportRun("e1");
    await dispatchPortfolioRollupRun("e1");
    expect(sent.map((e) => [e.data.skillName, e.data.interactive])).toEqual([
      ["whop-weekly-ops-report", true],
      ["whop-portfolio-rollup", true],
    ]);
  });
});
