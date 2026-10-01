import { inngest, atRiskCheckInScheduled } from "@/lib/inngest";
import { sendCheckIn } from "@/features/pile-on/server/at-risk-check-in";

/** Waits until the check-in is due, then sends it if it still should (features/pile-on/server/at-risk-check-in.ts). */
export const sendAtRiskCheckIn = inngest.createFunction(
  {
    id: "send-at-risk-check-in",
    triggers: [atRiskCheckInScheduled],
    retries: 2,
    // Each briefing pass (nightly, dynamic, a manual run, a retry) schedules
    // a check-in for the calls it scores, so one booking could have several
    // waiting; they all woke at the same moment and each texted the
    // prospect. One run per booking (per 24h, Inngest's idempotency window).
    idempotency: 'event.data.engagementId + ":" + event.data.bookingId',
  },
  async ({ event, step }) => {
    const { engagementId, bookingId, sendAt } = event.data;
    await step.sleepUntil("wait-until-due", new Date(sendAt));
    return step.run("send", () => sendCheckIn(engagementId, bookingId));
  }
);
