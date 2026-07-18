import { serve } from "inngest/next"; 
import { inngest } from "@/lib/inngest";
import { executeSkillRun } from "@/inngest/skill";
import { processSingleProspectBrief } from "@/features/pre-call-read/server/brief-service";
import { processPileOnSmsSequence } from "@/inngest/pile-on-sms";
import { processInboundReply } from "@/inngest/win-back-reply";
import { processWinBackSmsSequence } from "@/inngest/win-back-sms";
import { processWinBackEmailSmtpSequence } from "@/inngest/win-back-email-smtp";
import { processConversationIntelligenceTranscript } from "@/inngest/conversation-intelligence";
import {
  nightlyBriefsCron,
  leakMapScheduleCron,
  leakMapBenchmarksCron,
  canaryWeeklySweep,
  checkSingleCanary,
  alertMonitorCron,
  staleRunReaperCron,
  notifyStaleRunCron,
  credentialHealthCron,
  checkSingleCredentialHealthCron,
  lostDealSweepCron,
  processLostDealEngagementCron,
  weeklyMetricsCron,
  processWeeklyMetricsEngagementCron,
  bookingPollCron,
  processBookingPollEngagementCron,
  docsLinksValidatorCron,
  dynamicBriefCron,
  processDynamicBriefEngagementCron,
} from "@/inngest/crons";

// Explicit duration floor for this route, paired with checkpointing's
// maxRuntime in src/lib/inngest.ts (45s). Vercel's default is
// plan/fluid-compute-dependent (300s with fluid compute on, which is the
// default on most projects — but only 15s/10s if fluid compute is off).
// Setting this explicitly removes that ambiguity entirely rather than
// relying on a setting that lives in the dashboard and isn't visible from
// the code. Raise alongside maxRuntime if a single tenant's roster/audit
// routinely needs more headroom.
export const maxDuration = 60;

// Expose Next.js App Router HTTP handlers for communication
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executeSkillRun, // ✅ Registers your worker function into the serverless endpoint mesh
    // Fanned-out per-prospect worker for pre-call-read — see the fan-out
    // note in brief-service.ts's executeNightlyBriefingCycle. Invoked via
    // step.invoke() (not step.sendEvent), so it needs to be registered
    // here like any other function even though nothing calls it via a
    // published event in normal operation.
    processSingleProspectBrief,
    // All four run on Inngest's own scheduler (see src/inngest/crons.ts) —
    // none of these are Vercel Cron Jobs, so Vercel's Hobby-plan
    // once-per-day cadence cap doesn't apply to any of them, including
    // the 6-hourly alert monitor which would fail to deploy as a real
    // vercel.json cron on Hobby.
    nightlyBriefsCron,
    leakMapScheduleCron,
    leakMapBenchmarksCron,
    canaryWeeklySweep,
    checkSingleCanary,
    alertMonitorCron,
    // Added for the reliability pass: closes runs stuck at "running"
    // forever, and proactively flags dead booking-platform credentials
    // before they cause a run to fail. See src/inngest/crons.ts.
    staleRunReaperCron,
    // Fanned-out per-run notifier — see the fix note on staleRunReaperCron
    // in crons.ts for why this exists as a separate function.
    notifyStaleRunCron,
    credentialHealthCron,
    // Fanned-out per-credential handler — see the fix note on
    // credentialHealthCron in crons.ts for why this exists as a separate
    // function instead of a loop inside the cron itself.
    checkSingleCredentialHealthCron,
    // Closes the gap on winBackCounts.lost_count sitting unused — see
    // src/features/win-back/server/lost-deal-sweep.ts.
    lostDealSweepCron,
    processLostDealEngagementCron,
    // The Monday-morning summary email that had no task loop at all
    // before this. See src/features/pile-on/server/weekly-metrics.ts.
    weeklyMetricsCron,
    processWeeklyMetricsEngagementCron,
    // Polling fallback for booking platforms without live webhooks — see
    // src/features/pin-down/server/booking-poller.ts (Pin-Down recovery gap 5).
    bookingPollCron,
    processBookingPollEngagementCron,
    // HEAD-validates canonical platform docs URLs nightly — see
    // src/features/pin-down/server/docs-link-validator.ts (Pin-Down recovery gap 9).
    docsLinksValidatorCron,
    // Durable multi-message SMS sequence for direct-send SMS platforms —
    // see src/inngest/pile-on-sms.ts (Pile-On recovery gap 1).
    processPileOnSmsSequence,
    // Dynamic (tight-poll) brief trigger, an alternative to the nightly
    // batch — see brief-service.ts's triggerMode (Pre-Call Read recovery gap 1).
    dynamicBriefCron,
    processDynamicBriefEngagementCron,
    // Halts a win-back cadence when a prospect replies — see
    // src/inngest/win-back-reply.ts (Win-Back recovery gap 6).
    processInboundReply,
    // Durable multi-message SMS sequence for the win-back recovery
    // cadence — see src/inngest/win-back-sms.ts (Win-Back recovery gap 2).
    processWinBackSmsSequence,
    // Durable multi-message email sequence for the SMTP direct-send
    // connector — see src/inngest/win-back-email-smtp.ts. Mailchimp,
    // ConvertKit, and the four pre-existing ESPs don't run through here;
    // they enroll into the buyer's own automation instead (email.ts).
    processWinBackEmailSmtpSequence,
    processConversationIntelligenceTranscript,
  ],
});