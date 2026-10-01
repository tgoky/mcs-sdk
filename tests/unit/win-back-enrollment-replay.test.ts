// When Inngest replays the booking handler (a later step failed and is
// retried), every step.run returns its first result. The Win-Back claim
// ran outside a step, so the replay ran it again, found the run's own
// enrollment, and stopped the run before any Win-Back message went out.
import { describe, it, expect, vi } from "vitest";

const { enrollOnce, espEnroll } = vi.hoisted(() => ({
  // Like the real claim: the first call enrolls, a repeat finds that row.
  enrollOnce: vi.fn(async (v: { id: string }) => (enrollOnce.mock.calls.length === 1 ? { status: "enrolled", id: v.id } : { status: "already_active", existingId: v.id })),
  // The ESP call fails the first time, so Inngest retries the function.
  espEnroll: vi.fn(async () => {
    if (espEnroll.mock.calls.length === 1) throw new Error("ESP timeout");
  }),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/win-back-enrollment", () => ({ enrollInWinBackOnce: enrollOnce }));
vi.mock("@/lib/worker-blocking-conditions", () => ({ getBlockingReasons: async () => [] }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: async () => "key" }));
vi.mock("@/lib/run-log", () => ({ logStep: vi.fn(), finishRun: vi.fn() }));
vi.mock("@/lib/platforms/email", () => ({ enrollInWinBackSequence: espEnroll, enrollInPreCallSequence: vi.fn(), exitWinBackSequence: vi.fn(), deliverRescheduleLink: vi.fn() }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: vi.fn() }, pileOnSmsSequenceStart: {}, winBackSmsSequenceStart: {}, winBackEmailSmtpSequenceStart: {}, winBackSequenceStop: {} }));

import { handleInboundBookingEvent } from "@/features/pile-on/server/enrollment-service";

describe("Win-Back enrollment on an Inngest replay", () => {
  it("keeps the first claim and finishes the enrollment on the retry", async () => {
    // A step that remembers results by id, as Inngest does across retries.
    const memo = new Map<string, unknown>();
    const step = {
      run: async (id: string, fn: () => Promise<unknown>) => {
        if (memo.has(id)) return memo.get(id);
        const out = JSON.parse(JSON.stringify((await fn()) ?? null));
        memo.set(id, out);
        return out;
      },
    };
    const tenant = { engagementId: "e1", stack: { email_platform: "klaviyo", sms_platform: "none" } };
    const payload = { email: "pat@example.com", name: "Pat", _bookingId: "b1" };

    await expect(handleInboundBookingEvent(payload, tenant, "run1", "cancelled", step as never)).rejects.toThrow("ESP timeout");
    await handleInboundBookingEvent(payload, tenant, "run1", "cancelled", step as never);

    expect(enrollOnce).toHaveBeenCalledTimes(1);
    expect(espEnroll).toHaveBeenCalledTimes(2);
  });
});
