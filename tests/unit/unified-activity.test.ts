import { describe, it, expect } from "vitest";
import { mergeUnifiedActivity, type UnifiedRunInput } from "@/lib/unified-activity";
import type { QueueItem } from "@/lib/queue";

function queueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    source: "action",
    category: "approve",
    title: "Approve something",
    subtitle: "sub",
    engagementId: "eng_1",
    buyer: "Acme",
    runId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function run(overrides: Partial<UnifiedRunInput> = {}): UnifiedRunInput {
  return {
    id: "run_1",
    skillName: "pre-call-read",
    status: "success",
    phase: null,
    startedAt: "2026-09-01T00:00:00.000Z",
    engagementId: "eng_1",
    buyerName: "Acme",
    engagementPausedAt: null,
    errorMessage: null,
    subjectLabel: "Call brief sent",
    ...overrides,
  };
}

describe("mergeUnifiedActivity", () => {
  it("drops a feed row whose run already has a richer run_failure queue item for the same run", () => {
    const failedRun = run({ id: "run_dup", status: "failed", errorMessage: "boom" });
    const q = queueItem({ id: "run-failure:run_dup", source: "run_failure", category: "action_needed", runId: "run_dup" });

    const { items } = mergeUnifiedActivity([q], [failedRun]);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("queue");
    expect(items[0].runId).toBe("run_dup");
  });

  it("keeps a failed run that has no matching queue item", () => {
    const failedRun = run({ id: "run_solo", status: "failed" });
    const { items } = mergeUnifiedActivity([], [failedRun]);

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("run");
    expect(items[0].status).toBe("needs_action");
  });

  it("sorts needs_action before running before completed, regardless of input order", () => {
    const completedRun = run({ id: "r_done", status: "success", startedAt: "2026-09-03T00:00:00.000Z" });
    const runningRun = run({ id: "r_run", status: "running", startedAt: "2026-09-02T00:00:00.000Z" });
    const actionItem = queueItem({ id: "q_action", category: "action_needed", createdAt: "2026-09-01T00:00:00.000Z" });

    const { items } = mergeUnifiedActivity([actionItem], [completedRun, runningRun]);

    expect(items.map((i) => i.status)).toEqual(["needs_action", "running", "completed"]);
  });

  it("sorts by recency within the same status tier", () => {
    const older = queueItem({ id: "q_old", createdAt: "2026-09-01T00:00:00.000Z" });
    const newer = queueItem({ id: "q_new", createdAt: "2026-09-05T00:00:00.000Z" });

    const { items } = mergeUnifiedActivity([older, newer], []);

    expect(items.map((i) => i.id)).toEqual(["queue:q_new", "queue:q_old"]);
  });

  it("classifies fyi queue items as 'other', not needs_action", () => {
    const fyiItem = queueItem({ id: "q_fyi", category: "fyi" });
    const { items } = mergeUnifiedActivity([fyiItem], []);

    expect(items[0].status).toBe("other");
  });

  it("counts items per product using each item's skillName", () => {
    const showtimeRun = run({ id: "r1", skillName: "pre-call-read", status: "success" });
    const repRun = run({ id: "r2", skillName: "rep-digest", status: "success" });
    const { counts } = mergeUnifiedActivity([], [showtimeRun, repRun]);

    expect(counts.total).toBe(2);
    expect(counts.byProduct.showtime).toBe(1);
    expect(counts.byProduct["reputation-manager"]).toBe(1);
    expect(counts.byProduct["cold-open"]).toBe(0);
    expect(counts.byProduct["whop-agent"]).toBe(0);
  });

  it("computes needsAction/running/completed counts across the combined list", () => {
    const failedItem = queueItem({ id: "q1", category: "action_needed" });
    const runningRun = run({ id: "r1", status: "running" });
    const completedRun = run({ id: "r2", status: "success" });

    const { counts } = mergeUnifiedActivity([failedItem], [runningRun, completedRun]);

    expect(counts.needsAction).toBe(1);
    expect(counts.running).toBe(1);
    expect(counts.completed).toBe(1);
    expect(counts.total).toBe(3);
  });

  it("resolves a worker-owned run's workerId to itself and its category from worker-registry.ts", () => {
    const preCallReadRun = run({ id: "r1", skillName: "pre-call-read" });
    const { items } = mergeUnifiedActivity([], [preCallReadRun]);

    expect(items[0].workerId).toBe("pre-call-read");
    expect(items[0].category).toBe("Analysis & Briefing");
  });

  it("resolves a chat-sub-skill run's workerId to its parent worker, not itself", () => {
    const voiceExtractionRun = run({ id: "r1", skillName: "pin-down-voice" });
    const { items } = mergeUnifiedActivity([], [voiceExtractionRun]);

    expect(items[0].workerId).toBe("pin-down");
    expect(items[0].category).toBe("Setup");
  });

  it("leaves workerId/category null for a queue item with no skillName", () => {
    const q = queueItem({ id: "q1", skillName: undefined });
    const { items } = mergeUnifiedActivity([q], []);

    expect(items[0].workerId).toBeNull();
    expect(items[0].category).toBeNull();
  });

  it("counts items per worker and per category across the combined list", () => {
    const preCallReadRun = run({ id: "r1", skillName: "pre-call-read" });
    const anotherPreCallReadRun = run({ id: "r2", skillName: "pre-call-read" });
    const voiceExtractionRun = run({ id: "r3", skillName: "pin-down-voice" });

    const { counts } = mergeUnifiedActivity([], [preCallReadRun, anotherPreCallReadRun, voiceExtractionRun]);

    expect(counts.byWorker["pre-call-read"]).toBe(2);
    expect(counts.byWorker["pin-down"]).toBe(1);
    expect(counts.byCategory["Analysis & Briefing"]).toBe(2);
    expect(counts.byCategory["Setup"]).toBe(1);
    // Every WorkerId/WorkerCategory is present, zeroed, even with no activity —
    // the rail relies on this to render a worker's row with a real "0" rather
    // than an undefined lookup.
    expect(counts.byWorker["leak-map"]).toBe(0);
    expect(counts.byCategory["Crisis & Recovery"]).toBe(0);
  });
});
