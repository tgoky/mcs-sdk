// src/lib/autopilot-clients.ts
//
// Shared query behind both /dashboard/autopilot (full page) and
// GET /api/engagements/autopilot-summary (the right-utility-panel's compact
// Autopilot tab) — one place computing "every client's access-control
// state" instead of the same 3-table join duplicated in a page and a route.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSkillStatesForEngagements } from "@/lib/engagement-skills";
import type { PendingActionType } from "@/lib/approval-gate";
import type { SkillId } from "@/lib/skill-manifest";

export interface AutopilotClientDTO {
  engagementId: string;
  buyer: string;
  pausedAt: string | null;
  pausedReason: string | null;
  requireApprovalForSideEffects: boolean;
  requireApprovalActionTypes: PendingActionType[];
  skills: Record<SkillId, boolean>;
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

  const skillStates = await getSkillStatesForEngagements(rows.map((r) => r.engagementId));

  return rows.map((r) => {
    const stack = r.stack as EngagementStack | null;
    return {
      engagementId: r.engagementId,
      buyer: r.buyer,
      pausedAt: r.pausedAt ? r.pausedAt.toISOString() : null,
      pausedReason: r.pausedReason,
      requireApprovalForSideEffects: stack?.require_approval_for_side_effects ?? false,
      requireApprovalActionTypes: stack?.require_approval_action_types ?? [],
      skills: skillStates[r.engagementId],
    };
  });
}
