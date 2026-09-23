// src/lib/enable-pile-on.ts
//
// "Enable the Pile-On worker for this client" — a different action from
// chat-pile-on.ts's enrollProspectInPileOn (that's enrolling one
// prospect; this is turning the worker itself on). Shared by both real
// surfaces that can do it: the Library's EnablePileOnModal (via the
// enable-with-config API route) and Teammates chat's enable_pile_on tool
// — one function, so answering "SMS platform: twilio" means the exact
// same thing regardless of which surface asked the question.
//
// Mirrors /api/engagements/[id]/workers/[workerId]/enable/route.ts's own
// steps (install the product silently if needed, flip the worker on) plus
// the two config fields the enable modal already asks for — smsPlatform/
// adDataPlatform, both real WorkerConfigField["ask"] entries on pile-on
// (see worker-registry.ts) and both already in the deliberately-scoped
// PATCH /api/engagements/[id] route's own field allowlist, so writing
// them directly here (same fields, same values) carries no more risk
// than that route already accepts from a human typing into a select.

import { db } from "@/lib/db";
import { hasCredential, resolveCredential, syncMarkersForChosenPlatforms } from "@/lib/credentials";
import { harvestTwilioA2PStatus } from "@/lib/paste-key-harvest";
import { engagements } from "@/models/schema";
import type { EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getActiveWorkspace, installPackageInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isProductOnboarded } from "@/lib/product-onboarding";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";

export type EnablePileOnResult =
  | { ok: true }
  | { ok: false; error: string; bridgeHref?: string; productId?: "showtime"; onboardingWorkerName?: string };

const VALID_SMS_PLATFORMS = ["twilio", "ghl_sms", "hubspot_sms", "none"];

/** The sending details each SMS platform needs (sms.ts reads these from
 * sms_platform_meta). Only non-empty values are written, merged over what's
 * saved, so leaving a field blank on a revisit keeps it. */
export interface SmsPlatformMetaInput {
  twilio_account_sid?: string;
  twilio_messaging_service_sid?: string;
  twilio_from_number?: string;
  ghl_location_id?: string;
}
const VALID_AD_DATA_PLATFORMS = ["hyros", "native_crm", "google_sheets", "none"];

export async function enablePileOnForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  opts?: { smsPlatform?: string; adDataPlatform?: string; smsPlatformMeta?: SmsPlatformMetaInput }
): Promise<EnablePileOnResult> {
  if (opts?.smsPlatform && !VALID_SMS_PLATFORMS.includes(opts.smsPlatform)) {
    return { ok: false, error: `smsPlatform must be one of: ${VALID_SMS_PLATFORMS.join(", ")}.` };
  }
  if (opts?.adDataPlatform && !VALID_AD_DATA_PLATFORMS.includes(opts.adDataPlatform)) {
    return { ok: false, error: `adDataPlatform must be one of: ${VALID_AD_DATA_PLATFORMS.join(", ")}.` };
  }

  const [row] = await db
    .select({ engagementId: engagements.engagementId, stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return { ok: false, error: "Client not found." };

  if (!(await isProductOnboarded("showtime", engagementId))) {
    const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID.showtime;
    const onboardingWorker = WORKER_REGISTRY[onboardingWorkerId];
    return {
      ok: false,
      error: `${onboardingWorker.name} needs to run for this client before Pre-Call Sequence means anything.`,
      bridgeHref: `/dashboard/engagements/${engagementId}/bridges/${onboardingWorkerId}`,
      productId: "showtime",
      onboardingWorkerName: onboardingWorker.name,
    };
  }

  const installResult = await installPackageInWorkspace(whopUserId, workspaceId, "showtime");
  if ("error" in installResult) return { ok: false, error: installResult.error };

  const currentStack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  // Write whenever a field was actually passed — including an explicit
  // "none" — rather than only non-"none" values. The original enable-only
  // guard treated "none" the same as "field wasn't answered," which is
  // right for the initial Enable flow's untouched dropdowns but wrong for
  // Configure re-opening this same function: someone deliberately turning
  // SMS follow-ups back off by selecting "none" needs that write to
  // actually happen, not get silently dropped.
  const metaPatch = Object.fromEntries(
    Object.entries(opts?.smsPlatformMeta ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).trim()])
  );
  if (opts?.smsPlatform !== undefined || opts?.adDataPlatform !== undefined || Object.keys(metaPatch).length > 0) {
    await db
      .update(engagements)
      .set({
        stack: {
          ...currentStack,
          ...(opts?.smsPlatform !== undefined ? { sms_platform: opts.smsPlatform as EngagementStack["sms_platform"] } : {}),
          ...(opts?.adDataPlatform !== undefined ? { ad_data_platform: opts.adDataPlatform as EngagementStack["ad_data_platform"] } : {}),
          ...(Object.keys(metaPatch).length > 0 ? { sms_platform_meta: { ...(currentStack.sms_platform_meta ?? {}), ...metaPatch } } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, engagementId));
  }

  // The "has a credential" marker the completeness check reads is only set
  // when a key is saved while its platform is already selected. Choosing
  // the platform after the key was saved (Connections page, Reuse saved)
  // left the worker blocked on "no connected credential" forever — sync it
  // here for any platform just chosen whose key already exists.
  await syncMarkersForChosenPlatforms(engagementId, [opts?.smsPlatform, opts?.adDataPlatform]);

  // Twilio's A2P status can only be read once the Messaging Service SID is
  // known — re-run that harvest now that it may have just arrived.
  const smsNow = opts?.smsPlatform ?? currentStack.sms_platform;
  if (smsNow === "twilio" && (metaPatch.twilio_messaging_service_sid || metaPatch.twilio_account_sid) && (await hasCredential(engagementId, "twilio"))) {
    resolveCredential(engagementId, "twilio")
      .then((token) => harvestTwilioA2PStatus(engagementId, token))
      .catch((err) => console.warn(`[enable-pile-on] Twilio A2P check failed for ${engagementId}:`, err));
  }

  await setSkillEnabledForEngagement(engagementId, "pile-on", true);

  return { ok: true };
}

/** Thin wrapper matching getActiveWorkspace's own resolution, for callers
 * (chat) that only have whopUserId, not a pre-resolved workspaceId. */
export async function enablePileOnForEngagementByUser(whopUserId: string, engagementId: string, opts?: { smsPlatform?: string; adDataPlatform?: string }): Promise<EnablePileOnResult> {
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  return enablePileOnForEngagement(whopUserId, activeWorkspace.workspaceId, engagementId, opts);
}
