import { inngest, reviewRequestScheduled } from "@/lib/inngest";
import { sendReviewRequest } from "@/features/reputation-manager/server/review-requests";

/**
 * Sends one review request once its delay is up. Everything that decides
 * whether it still goes (turned off, already asked, opted out) is checked
 * in sendReviewRequest at send time, not when it was scheduled.
 */
export const sendScheduledReviewRequest = inngest.createFunction(
  { id: "send-scheduled-review-request", triggers: [reviewRequestScheduled], retries: 2 },
  async ({ event, step }) => {
    const { engagementId, requestId, sendAt } = event.data;
    await step.sleepUntil("wait-until-due", new Date(sendAt));
    return step.run("send", () => sendReviewRequest(engagementId, requestId));
  }
);
