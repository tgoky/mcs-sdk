import { inngest, atRiskCheckInScheduled } from "@/lib/inngest";
import { sendCheckIn } from "@/features/pile-on/server/at-risk-check-in";

/** Waits until the check-in is due, then sends it if it still should (features/pile-on/server/at-risk-check-in.ts). */
export const sendAtRiskCheckIn = inngest.createFunction(
  { id: "send-at-risk-check-in", triggers: [atRiskCheckInScheduled], retries: 2 },
  async ({ event, step }) => {
    const { engagementId, bookingId, sendAt } = event.data;
    await step.sleepUntil("wait-until-due", new Date(sendAt));
    return step.run("send", () => sendCheckIn(engagementId, bookingId));
  }
);
