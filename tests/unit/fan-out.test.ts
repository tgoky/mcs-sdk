import { describe, it, expect, vi, beforeEach } from "vitest";

const startRuns = vi.fn(async () => undefined);
const failUndispatchedRuns = vi.fn(async () => undefined);
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/run-log", () => ({ startRuns: (...a: unknown[]) => startRuns(...(a as [])), failUndispatchedRuns: (...a: unknown[]) => failUndispatchedRuns(...(a as [])) }));

import { dispatchScheduledSkillRuns, staggerOffsetMs, staggeredNotBefore, waitForStagger, sendEventsInBatches } from "@/inngest/fan-out";
import { fakeStep } from "../helpers/inngest-fn";

const stepWithSleep = () => ({ ...fakeStep(), sleepUntil: vi.fn(async () => undefined) });

describe("stagger offsets", () => {
  it("are stable per key and stay inside the window", () => {
    const window = 45 * 60_000;
    expect(staggerOffsetMs("daily-send:e1", window)).toBe(staggerOffsetMs("daily-send:e1", window));
    const offsets = Array.from({ length: 500 }, (_, i) => staggerOffsetMs(`daily-send:e${i}`, window));
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...offsets)).toBeLessThan(window);
    // Spread out, not bunched: 500 clients land in at least 40 different minutes.
    expect(new Set(offsets.map((o) => Math.floor(o / 60_000))).size).toBeGreaterThan(40);
  });

  it("sleeps only when the start time is still ahead", async () => {
    const step = stepWithSleep();
    await waitForStagger(step as never, undefined);
    await waitForStagger(step as never, new Date(Date.now() - 1000).toISOString());
    expect(step.sleepUntil).not.toHaveBeenCalled();
    await waitForStagger(step as never, new Date(Date.now() + 60_000).toISOString());
    expect(step.sleepUntil).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchScheduledSkillRuns", () => {
  beforeEach(() => startRuns.mockClear());

  it("pages through every client, bulk-creates runs per page and staggers them across the window", async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `eng_${String(i).padStart(5, "0")}`);
    const loadPage = vi.fn(async (after: string | null, limit: number) => ids.filter((id) => !after || id > after).slice(0, limit).map((engagementId) => ({ engagementId })));
    const step = fakeStep();

    const dispatched = await dispatchScheduledSkillRuns(step as never, {
      id: "test",
      skillName: "daily-send",
      phase: "fetch",
      spreadMinutes: 45,
      loadPage,
      // Every other client is due.
      select: (rows) => rows.filter((_, i) => i % 2 === 0).map((r) => ({ engagementId: r.engagementId })),
    });

    expect(loadPage).toHaveBeenCalledTimes(3);
    expect(startRuns).toHaveBeenCalledTimes(3);
    // 500, 500 and 201 rows per page; every other row in each page is due.
    expect(dispatched).toBe(250 + 250 + 101);
    const events = step.sendEvent.mock.calls.flatMap((c) => (c as unknown as [string, Array<{ data: Record<string, string> }>])[1]);
    expect(events).toHaveLength(dispatched);
    const now = Date.now();
    for (const e of events) {
      expect(e.data.skillName).toBe("daily-send");
      expect(e.data.lane).toBe("daily-send");
      const at = new Date(e.data.notBefore).getTime();
      expect(at).toBeGreaterThanOrEqual(now - 5_000);
      expect(at).toBeLessThan(now + 45 * 60_000);
    }
  });

  it("sends large fan-outs in batches of 500", async () => {
    const step = fakeStep();
    await sendEventsInBatches(step as never, "x", Array.from({ length: 1250 }, (_, i) => ({ i })));
    expect(step.sendEvent.mock.calls.map((c) => (c as unknown as [string, unknown[]])[1].length)).toEqual([500, 500, 250]);
  });

  it("keeps a client's snapshot and review in order: same key, same window, same offset", () => {
    const from = "2026-09-28T00:05:00.000Z";
    const later = "2026-09-28T00:15:00.000Z";
    const snapshot = new Date(staggeredNotBefore("weekly:e1", 45, from)).getTime();
    const review = new Date(staggeredNotBefore("weekly:e1", 45, later)).getTime();
    expect(review - snapshot).toBe(10 * 60_000);
  });
});

describe("a page whose events can't be sent", () => {
  it("closes that page's runs instead of leaving them queued, and still fails the cron", async () => {
    const step = fakeStep();
    step.sendEvent.mockRejectedValueOnce(new Error("Inngest unavailable"));
    await expect(
      dispatchScheduledSkillRuns(step as never, {
        id: "t",
        skillName: "leak-map",
        phase: "p",
        spreadMinutes: 10,
        loadPage: async (after) => (after ? [] : [{ engagementId: "e1" }, { engagementId: "e2" }]),
        select: (rows) => rows.map((r) => ({ engagementId: r.engagementId })),
      })
    ).rejects.toThrow("Inngest unavailable");
    const [ids] = failUndispatchedRuns.mock.calls[0] as unknown as [string[]];
    expect(ids).toHaveLength(2);
  });
});
