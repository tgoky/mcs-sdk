// src/features/win-back/server/export-to-skill-pack.ts
//
// Tier 4 #29 / Win-Back recovery gap 1 option 2 — export path.
//
// The transfer analysis's section 8.4 framed this as a strategic choice
// with three options; the recommendation was option 1 (accept the
// runtime-service inversion) for the near term with option 2 (an export
// path) as a paid upgrade. This is that upgrade, scoped to Win-Back
// first since that's the skill where "build-it-and-leave-it" was most
// explicitly a Skill Pack promise this app inverted.
//
// Honesty note on scope: this produces a PASTE-READY EXPORT BUNDLE, not a
// live API call that auto-creates a flow inside the buyer's ESP.
// Klaviyo does have a beta Create Flow API, and ActiveCampaign/HubSpot
// have automation-creation APIs of varying completeness — but each is a
// genuinely different, intricate payload shape (Klaviyo's beta flow API
// in particular is a graph of temporary-id-linked nodes, not a flat list
// of steps) that deserves the same doc-verification-before-shipping
// discipline credential-health.ts's VALIDATORS map and this app's other
// live integrations already hold themselves to. Guessing at that shape
// here would risk silently creating a malformed or incomplete flow in a
// buyer's production ESP — worse than not automating it at all. See
// EngagementStack.runtime_export_result's "live_api" vs
// "paste_ready_bundle" distinction: this module only ever produces the
// latter today; a verified live_api path per platform is a real,
// separately-scoped follow-up, not a mechanical extension of this file.
//
// What this DOES do well: it exports exactly the cadence currently
// running (reads winBackSequenceAssetMap rather than regenerating
// content, so what the buyer's team recreates matches what was actually
// live, not a fresh drift-prone regeneration), with per-platform setup
// instructions and the exit-condition logic spelled out explicitly, since
// that logic (rebook or reply halts the sequence — Win-Back recovery
// gaps 4 and 6) is exactly the kind of thing that's invisible in a list
// of email bodies but essential to recreate faithfully.
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";

export interface ExportedStep {
  stepNumber: number;
  type: "email" | "sms";
  subject?: string;
  body: string;
  sendDelay: string;
  exitCondition: string;
}

export interface SkillPackExportBundle {
  engagementId: string;
  platform: string;
  flowName: string;
  exportedAt: string;
  steps: ExportedStep[];
  setupInstructions: string[];
  rescheduleMechanismNote: string;
}

const EXIT_CONDITION_NOTE =
  "Exit this flow immediately if the prospect rebooks a call (recovered) or replies to any message in this sequence (Win-Back recovery gaps 4 and 6) — do not let a later step send after either signal.";

const PLATFORM_SETUP_INSTRUCTIONS: Record<string, string[]> = {
  klaviyo: [
    "In Klaviyo: Flows > Create Flow > Build your own.",
    "Set the trigger to whatever event/list this buyer's booking platform previously enrolled prospects into Win-Back on (ask your Mudd Ventures contact for the exact enrollment criteria if you're not sure — this app enrolled on the booking platform's 'no_show' or 'cancelled' disposition tag).",
    "Add each step below in order using its listed delay relative to the previous step (Klaviyo: 'Time Delay' action between each email/SMS action).",
    "Add a flow filter on the flow itself (or per-step) implementing the exit condition noted on each step — Klaviyo supports this via a 'Conditional Split' checking a rebooked/replied property, or by removing the profile from the flow's trigger list on those events.",
  ],
  hubspot: [
    "In HubSpot: Automation > Workflows > Create workflow > From scratch.",
    "Set the enrollment trigger to match this buyer's prior no-show/cancelled disposition criteria.",
    "Add each step below as a 'Send email' or (if using HubSpot SMS) 'Send SMS' action, with a 'Delay' action of the listed duration before each.",
    "Add a 'Set up unenrollment triggers' rule for the exit condition noted on each step (rebooked or replied).",
  ],
  activecampaign: [
    "In ActiveCampaign: Automations > New Automation > Start from scratch.",
    "Set the trigger to match this buyer's prior no-show/cancelled disposition criteria.",
    "Add each step below as a 'Send Email' action with a 'Wait' action of the listed duration before each.",
    "Add an 'If/Else' condition implementing the exit condition noted on each step, routing to 'End Automation' on match.",
  ],
  ghl: [
    "In GoHighLevel: Automation > Workflows > Create Workflow.",
    "Set the trigger to match this buyer's prior no-show/cancelled disposition criteria.",
    "Add each step below as an 'Email' or 'SMS' action, with a 'Wait' step of the listed duration before each.",
    "Add a workflow-level 'Goal' or conditional exit implementing the exit condition noted on each step.",
  ],
};

const GENERIC_SETUP_INSTRUCTIONS = [
  "Recreate this sequence as a native automation/flow inside your platform, triggered the same way this app's Win-Back skill was — on a no-show or cancelled disposition.",
  "Add each step below in order, respecting each step's send delay relative to the previous step.",
  "Implement the exit condition noted on each step so the sequence halts correctly on a rebook or reply.",
];

export async function exportWinBackToSkillPack(engagementId: string): Promise<SkillPackExportBundle> {
  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) throw new Error(`Engagement ${engagementId} not found`);

  const stack = tenant.stack as EngagementStack | null;
  const assetMap = tenant.winBackSequenceAssetMap;
  if (!assetMap || (assetMap.emails.length === 0 && assetMap.sms.length === 0)) {
    throw new Error(
      "No generated Win-Back cadence found for this engagement — run generateRecoveryCadence (Win-Back onboarding) before exporting."
    );
  }

  const platform = stack?.email_platform ?? "klaviyo";

  const combined = [
    ...assetMap.emails.map((e) => ({ ...e, type: "email" as const })),
    ...assetMap.sms.map((s) => ({ ...s, type: "sms" as const, subject: undefined as string | undefined })),
  ].sort((a, b) => a.offsetDays - b.offsetDays);

  const steps: ExportedStep[] = combined.map((item, i) => ({
    stepNumber: i + 1,
    type: item.type,
    subject: item.subject,
    body: item.body,
    sendDelay: item.offsetDays === 0 ? "Immediately on enrollment" : `${item.offsetDays} day(s) after enrollment`,
    exitCondition: EXIT_CONDITION_NOTE,
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://mcs-abra.vercel.app";
  const rescheduleMechanismNote =
    stack?.reschedule_mode === "fresh_link"
      ? "This cadence used per-prospect single-use reschedule links generated at enrollment time (Win-Back recovery gap 3, fresh_link mode). Recreating this natively requires either a merge field wired to your booking platform's per-invitee reschedule token, or a landing page you build that looks up each prospect's next available slots."
      : `This cadence links to a shared reschedule page (${appUrl}/reschedule/${engagementId}) that resolves live availability at click time. To fully detach from this app's infrastructure, replace this link with one to your own booking page before disabling that route's access for this engagement.`;

  return {
    engagementId,
    platform,
    flowName: `Win-Back Recovery — ${tenant.buyer}`,
    exportedAt: new Date().toISOString(),
    steps,
    setupInstructions: PLATFORM_SETUP_INSTRUCTIONS[platform] ?? GENERIC_SETUP_INSTRUCTIONS,
    rescheduleMechanismNote,
  };
}

/**
 * Flips ownership after an operator confirms they've actually recreated
 * the flow — this is a separate, explicit step from exportWinBackToSkillPack
 * itself (which is read-only and safe to call repeatedly to preview the
 * bundle) so that recovery-service.ts's server-side cadence doesn't stop
 * running for an engagement until the buyer's own automation is
 * confirmed live. See recovery-service.ts's ownership check.
 */
export async function markWinBackExported(engagementId: string, platform: string): Promise<void> {
  const [tenant] = await db.select().from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!tenant) throw new Error(`Engagement ${engagementId} not found`);
  const stack = tenant.stack as EngagementStack | null;
  if (!stack) throw new Error(`Engagement ${engagementId} has no stack configured — nothing to export`);

  await db
    .update(engagements)
    .set({
      stack: {
        ...stack,
        runtime_ownership_model: "buyer_exported",
        runtime_ownership_exported_at: new Date().toISOString(),
        runtime_export_result: { method: "paste_ready_bundle", platform },
      },
    })
    .where(eq(engagements.engagementId, engagementId));
}
