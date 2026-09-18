// src/lib/chat-cold-open.ts
//
// Cold Open's only real chat-shaped action. Its 6 non-onboarding skills
// (voice-capture, source-connect, send-connect, daily-send, reply-sort,
// send-report) have no manual "run now" anywhere in the app, dashboard
// included — they run automatically off their own cadence once enabled
// and onboarded, same as Reputation Manager's watch skills (see
// route.ts's own rule on those). The one real lever is the same on/off
// toggle the dashboard's Skills panel already has, mirrored here exactly
// — including both of the route's own gates — rather than calling
// setSkillEnabledForEngagement directly and silently dropping them:
//   - icp-lock (onboarding) can't be turned on this way — it needs its
//     own bridge wizard (ICP definition, sizing bounds, product
//     identity), the same reason Pin-Down's full wizard and Reputation
//     Manager's Identity Setup aren't chat-shaped either.
//   - every other Cold Open skill needs icp-lock to have actually run
//     first (isProductOnboarded), not just its own flag against itself.
//
// See src/app/api/engagements/[id]/skills/cold-open/[skillId]/route.ts
// for the source of truth this mirrors.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { isColdOpenSkillId, COLD_OPEN_SKILL_MANIFEST } from "@/lib/cold-open-skill-manifest";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isProductOnboarded } from "@/lib/product-onboarding";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY } from "@/lib/worker-registry";

type ToggleResult = { ok: true; message: string } | { ok: false; error: string };

export async function enableColdOpenSkillForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  skillId: string,
  enabled: boolean
): Promise<ToggleResult> {
  if (!isColdOpenSkillId(skillId)) {
    return { ok: false, error: `"${skillId}" isn't a real Cold Open skill.` };
  }

  const [row] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return { ok: false, error: "Client not found." };

  if (COLD_OPEN_SKILL_MANIFEST[skillId].runOnSetup && enabled) {
    return { ok: false, error: "ICP Lock runs once during setup and has to be configured from its own bridge page — not something this can turn on directly." };
  }

  if (enabled && !COLD_OPEN_SKILL_MANIFEST[skillId].runOnSetup && !(await isProductOnboarded("cold-open", engagementId))) {
    const onboardingWorker = WORKER_REGISTRY[PRODUCT_ONBOARDING_WORKER_ID["cold-open"]];
    return { ok: false, error: `${onboardingWorker.name} needs to run for this client first, on its own bridge page, before ${COLD_OPEN_SKILL_MANIFEST[skillId].name} means anything.` };
  }

  await setSkillEnabledForEngagement(engagementId, skillId, enabled);
  return { ok: true, message: `${COLD_OPEN_SKILL_MANIFEST[skillId].name} is now ${enabled ? "enabled" : "disabled"} for this client.` };
}
