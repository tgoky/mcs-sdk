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
import { engagements } from "@/models/schema";
import type { EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getActiveWorkspace, installPackageInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";

export type EnablePileOnResult = { ok: true } | { ok: false; error: string };

const VALID_SMS_PLATFORMS = ["twilio", "ghl_sms", "hubspot_sms", "none"];
const VALID_AD_DATA_PLATFORMS = ["hyros", "native_crm", "google_sheets", "none"];

export async function enablePileOnForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  opts?: { smsPlatform?: string; adDataPlatform?: string }
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

  const installResult = await installPackageInWorkspace(whopUserId, workspaceId, "showtime");
  if ("error" in installResult) return { ok: false, error: installResult.error };

  const currentStack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  if (
    (opts?.smsPlatform && opts.smsPlatform !== "none") ||
    (opts?.adDataPlatform && opts.adDataPlatform !== "none")
  ) {
    await db
      .update(engagements)
      .set({
        stack: {
          ...currentStack,
          ...(opts?.smsPlatform && opts.smsPlatform !== "none" ? { sms_platform: opts.smsPlatform as EngagementStack["sms_platform"] } : {}),
          ...(opts?.adDataPlatform && opts.adDataPlatform !== "none" ? { ad_data_platform: opts.adDataPlatform as EngagementStack["ad_data_platform"] } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(engagements.engagementId, engagementId));
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
