// src/lib/autopilot-clients.ts
//
// Shared query behind both /dashboard/autopilot (full page) and
// GET /api/engagements/autopilot-summary (the right-utility-panel's compact
// Autopilot tab) — one place computing "every client's access-control
// state" instead of the same 3-table join duplicated in a page and a route.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSkillStatesForEngagements, getRepSkillStatesForEngagements } from "@/lib/engagement-skills";
import { getRepEnrolledEngagementIds } from "@/lib/rep-engagements";
import type { PendingActionType } from "@/lib/approval-gate";
import type { SkillId } from "@/lib/skill-manifest";
import type { RepSkillId } from "@/lib/rep-skill-manifest";

export interface AutopilotClientDTO {
  engagementId: string;
  buyer: string;
  pausedAt: string | null;
  pausedReason: string | null;
  requireApprovalForSideEffects: boolean;
  requireApprovalActionTypes: PendingActionType[];
  // Showtime's skills always shown, gated on the same booking_platform
  // signal productSetupState("showtime") uses elsewhere — a client that
  // was never set up under Showtime shouldn't show 5 skill chips that
  // never applied to it any more than an RM one should.
  showtimeConfigured: boolean;
  showtimeSkills: Record<SkillId, boolean>;
  repConfigured: boolean;
  repSkills: Record<RepSkillId, boolean>;
}

export async function getAutopilotClients(whopUserId: string, workspaceId: string): Promise<AutopilotClientDTO[]> {
  const rows = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      stack: engagements.stack,
      pausedAt: engagements.pausedAt,
      pausedReason: engagements.pausedReason,
    })
    .from(engagements)
    .where(and(eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId), isNull(engagements.deletedAt)))
    .orderBy(engagements.buyer);

  const engagementIds = rows.map((r) => r.engagementId);

  const [showtimeSkillStates, repEnrolledIds, repSkillStates] = await Promise.all([
    getSkillStatesForEngagements(engagementIds),
    getRepEnrolledEngagementIds(whopUserId, workspaceId),
    getRepSkillStatesForEngagements(engagementIds),
  ]);
  const repEnrolledSet = new Set(repEnrolledIds);

  return rows.map((r) => {
    const stack = r.stack as EngagementStack | null;
    return {
      engagementId: r.engagementId,
      buyer: r.buyer,
      pausedAt: r.pausedAt ? r.pausedAt.toISOString() : null,
      pausedReason: r.pausedReason,
      requireApprovalForSideEffects: stack?.require_approval_for_side_effects ?? false,
      requireApprovalActionTypes: stack?.require_approval_action_types ?? [],
      showtimeConfigured: Boolean(stack?.booking_platform),
      showtimeSkills: showtimeSkillStates[r.engagementId],
      repConfigured: repEnrolledSet.has(r.engagementId),
      repSkills: repSkillStates[r.engagementId],
    };
  });
}
