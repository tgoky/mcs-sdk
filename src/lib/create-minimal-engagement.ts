// src/lib/create-minimal-rep-engagement.ts
//
// Extracted from src/app/api/reputation-manager/new/route.ts (2026-09-06)
// so Teammates chat's create_rep_client tool can create a real
// Reputation Manager client in-process — the exact same insert +
// identity-graph-intake + rep-onboarding dispatch that route already
// does, not a second, drifting copy. Same extraction shape
// skill-trigger.ts already used for Showtime's manual triggers; the route
// is now a thin wrapper around this function, behavior unchanged for its
// existing caller.
//
// Deliberately name-only, same "additive, not a replacement" rule
// create-minimal-engagement.ts (Showtime's own chat counterpart) follows:
// operatorAliases/handles/domains/offerings/competitors/etc. all default
// empty here. Full identity-graph setup still happens on
// /dashboard/engagements/[id]/bridges/rep-onboarding afterward, same as a
// client created from the real "New client" page who didn't fill
// everything in would need to finish there too.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { generateEngagementId } from "@/lib/engagement-id";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveRepIdentityGraphIntake, type RepIntakeInput } from "@/features/reputation-manager/server/onboarding-service";
import crypto from "crypto";

export type CreateMinimalRepEngagementResult =
  | { ok: true; engagementId: string; runId: string }
  | { ok: false; error: string };

export async function createMinimalRepEngagement(opts: {
  whopUserId: string;
  workspaceId: string;
  operatorName: string;
}): Promise<CreateMinimalRepEngagementResult> {
  const buyerName = opts.operatorName.trim();
  if (!buyerName) {
    return { ok: false, error: "Operator name is required." };
  }

  const engagementId = generateEngagementId(buyerName);

  // onConflictDoNothing as defense-in-depth, matching the route this was
  // extracted from — engagementId is timestamp-suffixed (engagement-id.ts)
  // so a real collision is astronomically rare.
  await db
    .insert(engagements)
    .values({
      id: crypto.randomUUID(),
      engagementId,
      whopUserId: opts.whopUserId,
      workspaceId: opts.workspaceId,
      buyer: buyerName,
      schemaVersion: "1.0",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: engagements.engagementId });

  const input: RepIntakeInput = {
    operatorName: buyerName,
    operatorAliases: [],
    operatorHandles: {},
    operatorDomains: [],
    operatorEmailContacts: [],
    entities: [],
    offerings: [],
    competitors: [],
    collisions: [],
    trustedSources: [],
    seedPanelPrompts: [],
    soleAuthorityName: "",
    crisisThresholdOverride: null,
    activeEngines: null,
  };

  const result = await saveRepIdentityGraphIntake(engagementId, input);
  if ("error" in result) {
    // The row already exists at this point (created above) — a
    // validation failure here means an incomplete-but-real client, not
    // an orphan. Reachable again at the rep-onboarding bridge to finish,
    // same as any other engagement whose setup didn't finish in one
    // sitting.
    return { ok: false, error: result.error };
  }

  await setSkillEnabledForEngagement(engagementId, "rep-onboarding", true);
  const runId = await dispatchSkillRun(engagementId, "rep-onboarding", buyerName);

  return { ok: true, engagementId, runId };
}
