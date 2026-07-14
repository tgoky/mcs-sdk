import { db } from "@/lib/db";
import { engagements, artifacts } from "@/models/schema";
import { eq, and } from "drizzle-orm"; // ✅ Added 'and' here
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

// Win-Back recovery gap 3. Only meaningful in "fresh_link" mode — in
// "time_slots" mode (the default), the cadence copy embeds a plain
// literal URL instead (see generateRecoveryCadence below), since that
// page resolves live slots per-engagement, not per-recipient, so there's
// nothing for a merge tag to personalize. ActiveCampaign has no entry
// here because deliverRescheduleLink can't set an arbitrary custom
// property for it (see that function's doc comment) — fresh_link mode
// silently behaves like time_slots for ActiveCampaign engagements.
export const RESCHEDULE_LINK_MERGE: Record<string, string> = {
  klaviyo: "{{ event.showtime_reschedule_link }}",
  hubspot: "{{ contact.showtime_reschedule_link }}",
  ghl: "{{contact.showtime_reschedule_link}}",
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
    // "time_slots" mode (default): the reschedule route resolves slots
    // per-engagement, not per-recipient (a calendar's open times don't
    // vary by who's asking), so this is a plain literal URL, not a merge
    // field. "fresh_link" mode (Win-Back recovery gap 3) is genuinely
    // per-prospect — each recipient's actual reschedule link is set as a
    // contact property at enrollment time (see enrollment-service.ts and
    // deliverRescheduleLink in email.ts), so the generated copy needs a
    // real merge tag here instead, which the buyer's ESP resolves per
    // send. Falls back to the literal URL for platforms/engagements where
    // fresh_link isn't supported (see RESCHEDULE_LINK_MERGE's comment).
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

    // ── Artifact ownership (Win-Back recovery gap 7) ────────────────────────
    // This cadence's CONTENT is generated here, on this app's infra —
    // that's what "owner: mudd_ventures" records. The actual SENDING of
    // that content happens on the buyer's own ESP once they load it into
    // a native automation, which isn't a discrete artifact this app
    // creates or tracks (see the module comment above). Surfaced in the
    // dashboard so an operator can see, per engagement, what's generated/
    // executed here vs. what would move to the buyer's infra under a
    // future "provisioned handoff" export (see the gap 1 discussion this
    // recovery doesn't resolve on its own — that's Andrew's call).
    
    // ✅ FIX: Wipe out any existing recovery_cadence artifact records first to avoid runtime row clutter
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

    // ── Reply detection setup (Win-Back recovery gap 6) ──────────────────
    // One-time setup, same lifecycle as the cadence content itself — runs
    // whenever the operator (re)generates the recovery cadence, which is
    // the natural "getting Win-Back ready" moment for this engagement.
    if (stack.inbound_reply_mode === "native") {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
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
      // No external API call needed — this app doesn't run inbound email
      // infrastructure itself, it just needs a URL the operator's own
      // inbound-parse bridge (Postmark/SendGrid/Mailgun) can POST to. The
      // URL is fully deterministic from the engagement ID, so it's
      // computed and stored here rather than asking the operator to
      // invent or configure one.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
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

    await finishRun(runId);
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}