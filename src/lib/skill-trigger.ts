// src/lib/skill-trigger.ts
//
// Extracted from src/app/api/skill-runs/trigger/route.ts (2026-08-25) so
// the Teammates chat (src/app/api/teammates/chat/route.ts) can trigger a
// skill run in-process — the exact same validation and dispatch path the
// HTTP endpoint already uses, not a second copy or an internal self-fetch.
// The route is now a thin wrapper around this function; behavior is
// unchanged for every existing caller of POST /api/skill-runs/trigger.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { startRun, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { SKILL_REGISTRY } from "@/lib/skill-registry";
import crypto from "crypto";

export type TriggerSkillRunResult =
  | { ok: true; runId: string; message: string }
  | { ok: false; status: number; error: string };

/**
 * Manually fires a skill for a client — same rules as the HTTP endpoint:
 * only "pre-call-read" and "leak-map" support a manual trigger at all;
 * "pin-down" needs the setup wizard, "pile-on"/"win-back" fire
 * automatically on bookings and can't be triggered this way.
 */
export async function triggerSkillRunForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  skillName: string
): Promise<TriggerSkillRunResult> {
  const [tenant] = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);

  if (!tenant) {
    return { ok: false, status: 404, error: "Engagement not found" };
  }

  if (skillName === "pre-call-read" || skillName === "leak-map") {
    const enabled = await isSkillEnabledForEngagement(engagementId, skillName);
    if (!enabled) {
      return {
        ok: false,
        status: 422,
        error: `${SKILL_REGISTRY[skillName].name} is turned off for this client. Enable it from the Skills panel first.`,
      };
    }

    const runId = crypto.randomUUID();
    await startRun({
      id: runId,
      engagementId,
      skillName,
      phase: skillName === "pre-call-read" ? "roster_fetch" : "stage_1_data_pull",
      label: "Manually triggered via dashboard",
    });

    try {
      await inngest.send(
        skillRunExecute.create({
          runId,
          engagementId,
          skillName,
          manualOverride: true,
          ...(skillName === "leak-map" && { auditType: "weekly" as const }),
        })
      );
    } catch (dispatchErr: unknown) {
      await failRun(runId, dispatchErr);
      return { ok: false, status: 502, error: "Failed to dispatch run to background queue" };
    }

    return { ok: true, runId, message: "Run initiated. Processing in background." };
  }

  if (skillName === "pin-down") {
    return { ok: false, status: 422, error: "Pin Down requires the full setup wizard. Go to Add a New Client to re-run it." };
  }
  if (skillName === "pile-on" || skillName === "win-back") {
    return {
      ok: false,
      status: 422,
      error: "This module fires automatically on bookings. Send a test event from your booking platform to trigger it.",
    };
  }
  return { ok: false, status: 400, error: `Unknown skill: ${skillName}` };
}
