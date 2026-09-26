import { inngest } from "@/lib/inngest";
import { reportError } from "@/lib/error-reporting";

/**
 * Inngest sends inngest/function.failed once any job has used up its
 * retries. One listener here means every background job's final failure
 * is reported (lib/error-reporting.ts), not only the ones that write a
 * failed run.
 */
export const reportFailedFunctions = inngest.createFunction(
  { id: "report-failed-functions", triggers: [{ event: "inngest/function.failed" }], retries: 0 },
  async ({ event }) => {
    const data = event.data as { function_id?: string; run_id?: string; error?: { name?: string; message?: string; stack?: string }; event?: { name?: string; data?: Record<string, unknown> } };
    // Don't report our own failures in a loop.
    if (data.function_id?.endsWith("report-failed-functions")) return { reported: false };
    const original = data.event?.data ?? {};
    await reportError(data.error ?? { message: "Unknown failure" }, {
      kind: "job",
      where: data.function_id ?? "unknown job",
      engagementId: typeof original.engagementId === "string" ? original.engagementId : null,
      runId: typeof original.runId === "string" ? original.runId : null,
      extra: { inngestRunId: data.run_id, event: data.event?.name },
    });
    return { reported: true };
  }
);
