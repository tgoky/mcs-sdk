import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * Real, automated coverage for checkAndApplyAutoPause / resumeWinBackSends
 * — the Phase 6 auto-pause orchestration — not just "read the code and it
 * looks right." Mocks out this module's collaborators
 * (getRollingDeliveryStats, exitWinBackSequence, resolveCredential,
 * notifyUser) rather than faking deep drizzle query-builder chains for
 * every one of them: this function's own logic (threshold math,
 * already-paused no-op, sample floor, bulk-exit fan-out) is what these
 * tests verify, not each collaborator's own internals, which already have
 * — or in the case of the platform clients, are out of scope for — their
 * own coverage.
 *
 * The engagements table reads/writes ARE faked directly (fakeEngagementsDb
 * below), real mutable in-memory state, same pattern
 * composio-vault-reconnect.test.ts already established for this file set
 * — this function's own control flow (does it re-fetch the right stack,
 * does it write back the right patch) is exactly what's under test.
 */

function fakeEngagementsDb(initial: {
  whopUserId?: string | null;
  workspaceId?: string | null;
  stack: Record<string, unknown>;
  activeEnrollments: { id: string; prospectEmail: string }[];
}) {
  const state = {
    stack: { ...initial.stack },
    activeEnrollments: [...initial.activeEnrollments],
  };
  let selectCall = 0;
  const stackUpdates: Record<string, unknown>[] = [];
  const enrollmentUpdates: Record<string, unknown>[] = [];

  const db = {
    select: vi.fn(() => {
      selectCall += 1;
      const call = selectCall;
      return {
        from: () => ({
          where: () => ({
            limit: async () =>
              call === 1
                ? [{ whopUserId: initial.whopUserId ?? "whop-1", workspaceId: initial.workspaceId ?? "ws-1", stack: state.stack }]
                : [],
            // winBackEnrollments select has no .limit() call in the real
            // code — awaited directly off .where().
            then: (resolve: (v: unknown) => void) => resolve(state.activeEnrollments),
          }),
        }),
      };
    }),
    update: vi.fn((table: unknown) => ({
      set: (patch: Record<string, unknown>) => {
        // Distinguish the two update() calls by shape: the engagements
        // patch always carries `stack`, the enrollments patch never does.
        if ("stack" in patch) {
          stackUpdates.push(patch);
          state.stack = patch.stack as Record<string, unknown>;
        } else {
          enrollmentUpdates.push(patch);
        }
        return { where: async () => {} };
      },
    })),
    __state: state,
    __stackUpdates: stackUpdates,
    __enrollmentUpdates: enrollmentUpdates,
  };
  return db;
}

describe("checkAndApplyAutoPause", () => {
  let checkAndApplyAutoPause: typeof import("@/features/win-back/server/esp-delivery-monitor").checkAndApplyAutoPause;
  let getRollingDeliveryStats: ReturnType<typeof vi.fn>;
  let exitWinBackSequence: ReturnType<typeof vi.fn>;
  let resolveCredential: ReturnType<typeof vi.fn>;
  let notifyUser: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    getRollingDeliveryStats = vi.fn();
    exitWinBackSequence = vi.fn().mockResolvedValue(undefined);
    resolveCredential = vi.fn().mockResolvedValue("fake-api-key");
    notifyUser = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/esp-delivery-events", () => ({ getRollingDeliveryStats }));
    vi.doMock("@/lib/platforms/email", () => ({ exitWinBackSequence }));
    vi.doMock("@/lib/credentials", () => ({ resolveCredential }));
    vi.doMock("@/lib/notify", () => ({ notifyUser }));
  });

  afterAll(() => {
    vi.doUnmock("@/lib/esp-delivery-events");
    vi.doUnmock("@/lib/platforms/email");
    vi.doUnmock("@/lib/credentials");
    vi.doUnmock("@/lib/notify");
    vi.resetModules();
  });

  it("does nothing when already paused — never re-fires or re-sweeps", async () => {
    const db = fakeEngagementsDb({
      stack: { win_back_auto_paused: true, email_platform: "klaviyo" },
      activeEnrollments: [{ id: "e1", prospectEmail: "a@b.com" }],
    });
    vi.doMock("@/lib/db", () => ({ db }));
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(getRollingDeliveryStats).not.toHaveBeenCalled();
    expect(exitWinBackSequence).not.toHaveBeenCalled();
    expect(db.__stackUpdates).toHaveLength(0);
  });

  it("does nothing below the sample-size floor, even with a high raw rate", async () => {
    const db = fakeEngagementsDb({
      stack: { win_back_delivery_sample_minimum: 20, email_platform: "klaviyo" },
      activeEnrollments: [],
    });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 5, complained: 0, enrollments: 6 }); // 83% bounce rate, but n=6 < floor of 20
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(db.__stackUpdates).toHaveLength(0);
    expect(exitWinBackSequence).not.toHaveBeenCalled();
  });

  it("does nothing when both rates stay under threshold", async () => {
    const db = fakeEngagementsDb({ stack: { email_platform: "klaviyo" }, activeEnrollments: [] });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 2, complained: 0, enrollments: 100 }); // 2% bounce, under default 5%
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(db.__stackUpdates).toHaveLength(0);
  });

  it("pauses on bounce rate crossing threshold: sets stack flags, bulk-exits every active enrollment, and alerts", async () => {
    const db = fakeEngagementsDb({
      stack: { email_platform: "klaviyo", recovery_list_id: "list-1" },
      activeEnrollments: [
        { id: "e1", prospectEmail: "a@b.com" },
        { id: "e2", prospectEmail: "c@d.com" },
      ],
    });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 7, complained: 0, enrollments: 100 }); // 7% > default 5%
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(db.__stackUpdates).toHaveLength(1);
    expect(db.__stackUpdates[0].stack).toMatchObject({ win_back_auto_paused: true });
    expect(exitWinBackSequence).toHaveBeenCalledTimes(2);
    expect(exitWinBackSequence).toHaveBeenCalledWith("klaviyo", "fake-api-key", "a@b.com", expect.any(Object), "auto_paused");
    expect(exitWinBackSequence).toHaveBeenCalledWith("klaviyo", "fake-api-key", "c@d.com", expect.any(Object), "auto_paused");
    expect(db.__enrollmentUpdates).toHaveLength(1);
    expect(db.__enrollmentUpdates[0]).toMatchObject({ status: "auto_paused", exitReason: "bounce_complaint_auto_pause" });
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith(expect.objectContaining({ type: "win_back_delivery_auto_paused", severity: "critical" }));
  });

  it("pauses on complaint rate crossing threshold even when bounce rate is fine", async () => {
    const db = fakeEngagementsDb({ stack: { email_platform: "mailchimp" }, activeEnrollments: [] });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 0, complained: 1, enrollments: 500 }); // 0.2% complaint > default 0.1%
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(db.__stackUpdates).toHaveLength(1);
    const stack = db.__stackUpdates[0].stack as Record<string, unknown>;
    expect(stack.win_back_auto_paused_reason).toMatch(/Complaint rate/);
  });

  it("does NOT unenroll for the smtp platform (no ESP-side list to exit)", async () => {
    const db = fakeEngagementsDb({
      stack: { email_platform: "smtp" },
      activeEnrollments: [{ id: "e1", prospectEmail: "a@b.com" }],
    });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 10, complained: 0, enrollments: 100 });
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(exitWinBackSequence).not.toHaveBeenCalled();
    // Enrollment row is still marked auto_paused even though there's no
    // ESP call to make — the SMTP durable sequence checks this same
    // status column before each send.
    expect(db.__enrollmentUpdates).toHaveLength(1);
  });

  it("respects a client-configured threshold override instead of the default", async () => {
    const db = fakeEngagementsDb({ stack: { email_platform: "klaviyo", win_back_bounce_rate_threshold: 0.2 }, activeEnrollments: [] });
    vi.doMock("@/lib/db", () => ({ db }));
    getRollingDeliveryStats.mockResolvedValue({ bounced: 10, complained: 0, enrollments: 100 }); // 10% — under the overridden 20% threshold
    ({ checkAndApplyAutoPause } = await import("@/features/win-back/server/esp-delivery-monitor"));

    await checkAndApplyAutoPause("eng-1");

    expect(db.__stackUpdates).toHaveLength(0);
  });
});

describe("resumeWinBackSends", () => {
  it("clears exactly the 3 pause keys and leaves the rest of the stack untouched", async () => {
    vi.resetModules();
    const db = fakeEngagementsDb({
      stack: {
        email_platform: "klaviyo",
        win_back_auto_paused: true,
        win_back_auto_paused_at: "2026-01-01T00:00:00.000Z",
        win_back_auto_paused_reason: "Bounce rate 7% over last 7 days",
        reschedule_mode: "time_slots",
      },
      activeEnrollments: [],
    });
    vi.doMock("@/lib/db", () => ({ db }));
    const { resumeWinBackSends } = await import("@/features/win-back/server/esp-delivery-monitor");

    await resumeWinBackSends("eng-1");

    expect(db.__stackUpdates).toHaveLength(1);
    const newStack = db.__stackUpdates[0].stack as Record<string, unknown>;
    expect(newStack.win_back_auto_paused).toBeUndefined();
    expect(newStack.win_back_auto_paused_at).toBeUndefined();
    expect(newStack.win_back_auto_paused_reason).toBeUndefined();
    expect(newStack.email_platform).toBe("klaviyo");
    expect(newStack.reschedule_mode).toBe("time_slots");
  });
});
