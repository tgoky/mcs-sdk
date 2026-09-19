// src/lib/worker-capability-status.ts
//
// Phase 3's first real slice (see the "Worker Onboarding & Gating: Plan"
// doc): the Live Capability Matrix needs to know, per field, whether it's
// actually filled in — not just what its real storage key is
// (worker-config-completeness.ts already solved that for the fields that
// block a run) but a broader "is there a value here at all" read across
// every field WORKER_CAPABILITIES (worker-registry.ts) names, blocking or
// not. Scoped to the same 5 Phase 2 workers, for the same reason: a field
// key with no verified storage mapping here would silently show a
// capability as dim (or worse, lit) on a guess.
//
// Deliberately read-only. This module never writes — it exists to power
// a matrix that reads what's already true, not to duplicate the save
// paths in onboarding-service.ts / icp-lock.ts / the bridge routes.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { WORKER_CAPABILITIES, type WorkerId } from "@/lib/worker-registry";

function truthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

async function filledKeysForPinDown(engagementId: string): Promise<Set<string>> {
  const [row] = await db
    .select({ stack: engagements.stack, offerDetails: engagements.offerDetails, rawVoiceCorpus: engagements.rawVoiceCorpus, castingChoice: engagements.castingChoice, heroVideoUrl: engagements.heroVideoUrl, confirmationPageAnimationsEnabled: engagements.confirmationPageAnimationsEnabled })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!row) return new Set();
  const stack = (row.stack as EngagementStack | null) ?? null;
  const offer = row.offerDetails;
  const filled = new Set<string>();
  if (truthy(stack?.buyer_domain)) filled.add("buyerDomain");
  if (truthy(row.rawVoiceCorpus)) filled.add("rawVoiceCorpus");
  if (truthy(offer?.name)) filled.add("offerName");
  if (truthy(offer?.price)) filled.add("offerPrice");
  if (truthy(offer?.vertical)) filled.add("offerVertical");
  if (truthy(offer?.icp)) filled.add("offerIcp");
  if (truthy(offer?.traffic_temperature)) filled.add("trafficTemperature");
  if (truthy(row.castingChoice)) filled.add("castingChoice");
  if (truthy(row.heroVideoUrl)) filled.add("heroVideoUrl");
  if (offer?.hybrid_mode_enabled) filled.add("hybridModeEnabled");
  if (row.confirmationPageAnimationsEnabled) filled.add("confirmationPageAnimationsEnabled");
  if (truthy(stack?.booking_platform)) filled.add("bookingPlatform");
  if (truthy(stack?.booking_platform_credentials_ref)) filled.add("bookingPlatformCredential");
  if (truthy(stack?.email_platform)) filled.add("emailPlatform");
  if (truthy(stack?.email_platform_credentials_ref)) filled.add("emailPlatformCredential");
  if (truthy(stack?.hosting_platform)) filled.add("hostingPlatform");
  if (truthy(stack?.hosting_platform_credentials_ref)) filled.add("hostingPlatformCredential");
  return filled;
}

async function filledKeysForPreCallRead(engagementId: string): Promise<Set<string>> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  if (!stack) return new Set();
  const filled = new Set<string>();
  if (truthy(stack.brief_landing_destination)) filled.add("briefLandingDestination");
  if (truthy(stack.slack_webhook_url)) filled.add("slackWebhookUrl");
  if (truthy(stack.video_engagement_platform) && stack.video_engagement_platform !== "none") filled.add("videoEngagementPlatform");
  if (truthy(stack.video_engagement_credentials_ref)) filled.add("videoEngagementCredential");
  if (truthy(stack.prospect_research_sources_used)) filled.add("prospectResearchSourcesUsed");
  if (stack.conversation_intelligence_provider === "recall_ai") filled.add("conversationIntelligenceProvider");
  if (truthy(stack.conversation_intelligence_credentials_ref)) filled.add("conversationIntelligenceCredential");
  if (truthy(stack.conversation_intelligence_meta?.recall_region)) filled.add("recallRegion");
  if (stack.show_rate_scoring_enabled) filled.add("showRateScoringEnabled");
  return filled;
}

async function filledKeysForRepOnboarding(engagementId: string): Promise<Set<string>> {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  if (!row) return new Set();
  const filled = new Set<string>();
  if (truthy(row.operatorName)) filled.add("operatorName");
  if (truthy(row.operatorDomains)) filled.add("operatorDomains");
  if (truthy(row.operatorAliases)) filled.add("operatorAliases");
  if (truthy(row.operatorHandles)) filled.add("operatorHandles");
  if (truthy(row.competitors)) filled.add("competitors");
  if (truthy(row.trustedSources)) filled.add("trustedSources");
  if (row.crisisThresholdOverride !== null) filled.add("crisisThresholdOverride");
  if (truthy(row.entities)) filled.add("entities");
  if (truthy(row.seedPanelPrompts)) filled.add("seedPanelPrompts");
  if (row.activeEngines !== null) filled.add("activeEngines");
  if (truthy(row.soleAuthorityName)) filled.add("soleAuthorityName");
  if (truthy(row.operatorPagePhone)) filled.add("operatorPagePhone");
  return filled;
}

async function filledKeysForIcpLock(engagementId: string): Promise<Set<string>> {
  const config = await getColdOpenConfig(engagementId);
  if (!config) return new Set();
  const filled = new Set<string>();
  if (truthy(config.productIdentity?.name)) filled.add("productName");
  if (truthy(config.productIdentity?.url)) filled.add("productUrl");
  if (truthy(config.productIdentity?.price)) filled.add("productPrice");
  if (truthy(config.productIdentity?.valueProp)) filled.add("productValueProp");
  if (truthy(config.icps)) filled.add("icps");
  if (truthy(config.sizingBounds)) filled.add("sizingBounds");
  if (truthy(config.reviewRequiredIcps)) filled.add("reviewRequiredIcps");
  return filled;
}

async function filledKeysForPileOn(engagementId: string): Promise<Set<string>> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  const stack = (row?.stack as EngagementStack | null) ?? null;
  if (!stack) return new Set();
  const filled = new Set<string>();
  if (stack.sms_platform !== undefined) filled.add("smsPlatform");
  if (truthy(stack.sms_platform_credentials_ref)) filled.add("smsPlatformCredential");
  if (truthy(stack.sms_a2p_10dlc_status)) filled.add("smsA2p10dlcStatus");
  if (truthy(stack.sms_compliance_footer_variant)) filled.add("smsComplianceFooterVariant");
  if (stack.ad_data_platform !== undefined) filled.add("adDataPlatform");
  if (truthy(stack.ad_data_platform_credentials_ref)) filled.add("adDataPlatformCredential");
  if (stack.existing_pile_on_sequence_flagged) filled.add("existingPileOnSequenceFlagged");
  return filled;
}

const FIELD_READERS: Partial<Record<WorkerId, (engagementId: string) => Promise<Set<string>>>> = {
  "pin-down": filledKeysForPinDown,
  "pre-call-read": filledKeysForPreCallRead,
  "rep-onboarding": filledKeysForRepOnboarding,
  "icp-lock": filledKeysForIcpLock,
  "pile-on": filledKeysForPileOn,
};

/** Which of this worker's own configFields have a real value on file right
 * now. Fails safe: an empty set for any worker without a reader here,
 * same convention worker-config-completeness.ts's CHECKERS map uses. */
export async function getFilledFieldKeys(workerId: WorkerId, engagementId: string): Promise<Set<string>> {
  const reader = FIELD_READERS[workerId];
  if (!reader) return new Set();
  return reader(engagementId);
}

export interface CapabilityStatus {
  name: string;
  active: boolean;
  missingFieldKeys: string[];
}

/** Pure function over already-fetched data — the actual matrix-rendering
 * logic, kept separate from the DB reads above so it's trivially testable
 * and so an API route can fetch once and compute for every capability. */
export function computeCapabilityStatus(workerId: WorkerId, filledKeys: Set<string>): CapabilityStatus[] {
  const capabilities = WORKER_CAPABILITIES[workerId] ?? [];
  return capabilities.map((cap) => {
    const missingFieldKeys = cap.requiredFieldKeys.filter((key) => !filledKeys.has(key));
    return { name: cap.name, active: missingFieldKeys.length === 0, missingFieldKeys };
  });
}
