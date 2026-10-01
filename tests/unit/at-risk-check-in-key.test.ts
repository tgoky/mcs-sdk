// One check-in run per booking and call time: repeats of one schedule
// collapse, a rescheduled call gets its own.
import { describe, it, expect } from "vitest";
import { inngestOptions } from "../helpers/inngest-fn";
import { sendAtRiskCheckIn } from "@/inngest/at-risk-check-in";

describe("at-risk check-in run key", () => {
  it("includes the call time", () => {
    const { idempotency } = inngestOptions(sendAtRiskCheckIn) as { idempotency: string };
    expect(idempotency).toBe('event.data.engagementId + ":" + event.data.bookingId + ":" + event.data.callTime');
  });
});
