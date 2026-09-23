// src/lib/approval-actions.ts
//
// Client-safe (no db import): shared by approval-gate.ts and the client
// page's Automation mode control.

import type { EngagementStack } from "@/models/schema";

/**
 * The actions an operator can choose to review first (Co-Pilot). Everything
 * else that queues for approval (Reputation Manager drafts, Whop Agent
 * changes) is always reviewed and never passes through this opt-in check.
 * `worker` names where the action comes from, for the settings UI.
 */
export const OPT_IN_GATED_ACTIONS = [
  { type: "confirmation_page_deploy", worker: "Pin-Down", label: "Publishing the confirmation page" },
  { type: "webhook_enrollment", worker: "Pile-On / Win-Back", label: "Enrolling a prospect in a follow-up sequence" },
  { type: "cohort_membership_add", worker: "Pile-On", label: "Adding a prospect to an ad audience" },
  { type: "cohort_membership_remove", worker: "Pile-On", label: "Removing a prospect from an ad audience" },
] as const satisfies ReadonlyArray<{ type: NonNullable<EngagementStack["require_approval_action_types"]>[number]; worker: string; label: string }>;

export const OPT_IN_GATED_ACTION_TYPES: readonly string[] = OPT_IN_GATED_ACTIONS.map((a) => a.type);

