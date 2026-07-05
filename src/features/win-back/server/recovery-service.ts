import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { logStep, finishRun, failRun } from "@/lib/run-log";
import {
  buildRecoveryCadence,
  enforceDailySendTolerance,
  type RecoveryWindowDays,
} from "./cadence-builder";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

const FIRST_NAME_MERGE: Record<string, string> = {
  klaviyo: "{{ first_name|default:'there' }}",
  hubspot: "{{ contact.firstname }}",
  activecampaign: "%FIRSTNAME%",
  ghl: "{{contact.first_name}}",
};

/**
 * Generates (or regenerates) the win-back recovery cadence for an
 * engagement and stores it as winBackSequenceAssetMap. This is content
 * generation only — the buyer loads these emails/SMS into their own
 * platform's native automation builder (Klaviyo Flow, HubSpot Workflow,
 * ActiveCampaign Automation, GHL Workflow); Win-Back's own responsibility
 * at runtime is enrollment (enrollment-service.ts) and the rebooked-exit
 * signal (exitWinBackSequence in email.ts), not running the send schedule.
 */
export async function generateRecoveryCadence(
  tenant: any,
  runId: string,
  step?: StepTools
): Promise<void> {
  const run = step
    ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn)
    : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const stack = tenant.stack as any;
    const windowDays: RecoveryWindowDays = stack.recovery_window_days ?? 30;
    const emailPlatform: string = stack.email_platform ?? "klaviyo";

    await logStep(runId, { phase: "cadence_generation", status: "running" });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://debate-shindig-hankie.ngrok-free.dev";
    // The reschedule route resolves slots per-engagement, not per-recipient
    // (a calendar's open times don't vary by who's asking), so this is a
    // plain literal URL, not a merge field — one big simplification over
    // trying to thread a per-contact merge token through it.
    const rescheduleUrl = `${appUrl}/reschedule/${tenant.engagementId}`;

    const { emails, sms } = await run("generate-cadence-copy", () =>
      buildRecoveryCadence(
        {
          buyer: tenant.buyer,
          windowDays,
          brandVoiceProfile: tenant.brandVoiceProfile,
          offerDetails: tenant.offerDetails,
          rescheduleUrlMergeField: rescheduleUrl,
          firstNameMergeField: FIRST_NAME_MERGE[emailPlatform] ?? "{{first_name}}",
          prospectMeets: tenant.prospectMeets,
        },
        runId
      )
    );

    const { emails: finalEmails, sms: finalSms, adjustments } = enforceDailySendTolerance(
      emails,
      sms,
      stack.daily_send_tolerance ?? 2
    );

    await run("persist-cadence", () =>
      db
        .update(engagements)
        .set({
          winBackSequenceAssetMap: {
            windowDays,
            generatedAt: new Date().toISOString(),
            emails: finalEmails,
            sms: finalSms,
          },
          updatedAt: new Date(),
        })
        .where(eq(engagements.engagementId, tenant.engagementId))
    );

    await logStep(runId, {
      phase: "cadence_generation",
      status: "success",
      detail: `Generated ${finalEmails.length} emails + ${finalSms.length} SMS for a ${windowDays}-day window.${
        adjustments.length ? " Adjustments: " + adjustments.join(" ") : ""
      }`,
    });

    await finishRun(runId);
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}
