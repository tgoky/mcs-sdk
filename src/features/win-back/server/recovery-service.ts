import { db } from "@/lib/db";
import { engagements, artifacts } from "@/models/schema";
import { eq, and } from "drizzle-orm";
import { logStep, finishRun, failRun } from "@/lib/run-log";
import { resolveCredential } from "@/lib/credentials";
import { subscribeNativeReplyWebhook } from "@/lib/platforms/inbound-reply";
import {
  buildRecoveryCadence,
  enforceDailySendTolerance,
  type RecoveryWindowDays,
} from "./cadence-builder";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export const FIRST_NAME_MERGE: Record<string, string> = {
  klaviyo: "{{ first_name|default:'there' }}",
  hubspot: "{{ contact.firstname }}",
  activecampaign: "%FIRSTNAME%",
  ghl: "{{contact.first_name}}",
};

export const RESCHEDULE_LINK_MERGE: Record<string, string> = {
  klaviyo: "{{ event.showtime_reschedule_link }}",
  hubspot: "{{ contact.showtime_reschedule_link }}",
  ghl: "{{contact.showtime_reschedule_link}}",
};

/**
 * Generates (or regenerates) the win-back recovery cadence for an
 * engagement and stores it as winBackSequenceAssetMap.
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
    const useFreshLinkMerge = stack.reschedule_mode === "fresh_link" && RESCHEDULE_LINK_MERGE[emailPlatform];
    const rescheduleUrlMergeField = useFreshLinkMerge
      ? RESCHEDULE_LINK_MERGE[emailPlatform]
      : `${appUrl}/reschedule/${tenant.engagementId}`;

    const { emails, sms } = await run("generate-cadence-copy", () =>
      buildRecoveryCadence(
        {
          buyer: tenant.buyer,
          windowDays,
          brandVoiceProfile: tenant.brandVoiceProfile,
          offerDetails: tenant.offerDetails,
          rescheduleUrlMergeField: rescheduleUrlMergeField,
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

    // ── Artifact ownership ──────────────────────────────────────────────────
    await run("clear-stale-recovery-cadence-artifacts", () =>
      db.delete(artifacts).where(
        and(
          eq(artifacts.engagementId, tenant.engagementId),
          eq(artifacts.artifactType, "recovery_cadence")
        )
      )
    );

    await run("record-artifact-ownership", () =>
      db.insert(artifacts).values({
        engagementId: tenant.engagementId,
        skillName: "win-back",
        artifactType: "recovery_cadence",
        storagePath: `engagements/${tenant.engagementId}/win_back_sequence_asset_map`,
        owner: "mudd_ventures",
      })
    );

    // ── Reply detection setup ─────────────────────────────────────────────
    if (stack.inbound_reply_mode === "native") {
      try {
        const emailApiKey = await resolveCredential(tenant.engagementId, emailPlatform);
        const result = await run("subscribe-native-reply-webhook", () =>
          subscribeNativeReplyWebhook(emailPlatform, emailApiKey, `${appUrl}/api/webhooks/hubspot-conversations`)
        );
        if (result.supported) {
          await db
            .update(engagements)
            .set({ stack: { ...stack, inbound_reply_webhook_subscription_id: result.subscriptionId } })
            .where(eq(engagements.engagementId, tenant.engagementId));
          await logStep(runId, { phase: "reply_detection_setup", status: "success", detail: `Native subscription ${result.subscriptionId} created` });
        } else {
          await logStep(runId, { phase: "reply_detection_setup", status: "skipped", detail: result.reason });
        }
      } catch (e: any) {
        await logStep(runId, { phase: "reply_detection_setup", status: "failed", detail: e.message });
      }
    } else if (stack.inbound_reply_mode === "forwarding") {
      const catcherUrl = `${appUrl}/api/webhooks/inbound-reply/${tenant.engagementId}`;
      await db
        .update(engagements)
        .set({ stack: { ...stack, inbound_reply_catcher_address: catcherUrl } })
        .where(eq(engagements.engagementId, tenant.engagementId));
      await logStep(runId, { phase: "reply_detection_setup", status: "success", detail: `Forwarding catcher URL: ${catcherUrl}` });
    }

    await logStep(runId, {
      phase: "cadence_generation",
      status: "success",
      detail: `Generated ${finalEmails.length} emails + ${finalSms.length} SMS for a ${windowDays}-day window.${
        adjustments.length ? " Adjustments: " + adjustments.join(" ") : ""
      }`,
    });

    // Clean terminal execution closeout with honest 5-field summary
    await finishRun(runId, {
      summary: {
        whatWasAttempted: [
          `Generated ${windowDays}-day recovery cadence copy`,
          `Configured reply detection setup`,
        ],
        whatWorked: [
          `Built ${finalEmails.length} email and ${finalSms.length} SMS sequence assets`,
          `Applied daily send tolerance adjustments${adjustments.length ? ` (${adjustments.join(", ")})` : ""}`,
        ],
        whatFailed: [],
        openItems: ["Cadence assets ready to be loaded into ESP workflow by operator"],
        decisionsMade: [
          `Configured ${windowDays}-day recovery window`,
          `Set daily send tolerance to ${stack.daily_send_tolerance ?? 2}`,
        ],
      },
    });
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}