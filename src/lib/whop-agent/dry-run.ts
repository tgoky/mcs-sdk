// src/lib/whop-agent/dry-run.ts
//
// Section 8.2: "Any playbook that writes to Whop defaults to dry-run on
// first execution for a given operator against their live account.
// Dry-run resolves all inputs and shows the exact set of calls and
// resulting state changes without issuing a single write."
//
// Genuinely new machinery, not a reuse of an existing pattern — nothing
// else in this codebase has a first-class dry-run concept (every existing
// skill either runs for real or doesn't run at all). Tracked per
// (engagement, skill) on whopAgentConnections.dryRunClearedSkills rather
// than as a one-time global flag, since a client that reviewed Product
// Launch Pre-Flight's dry-run output has said nothing about trusting
// Dispute Response Assembly's writes yet.
import { db } from "@/lib/db";
import { whopAgentConnections } from "@/models/schema";
import { eq } from "drizzle-orm";

export async function isDryRunRequired(engagementId: string, skillId: string): Promise<boolean> {
  const [row] = await db
    .select({ dryRunClearedSkills: whopAgentConnections.dryRunClearedSkills })
    .from(whopAgentConnections)
    .where(eq(whopAgentConnections.engagementId, engagementId))
    .limit(1);
  if (!row) return true;
  return !row.dryRunClearedSkills.includes(skillId);
}

/** Called only after a live (non-dry-run) execution actually completes —
 * never on the dry-run itself, and never speculatively. Plain read-modify-
 * write (same pattern storeCredential/rotateVaultCredential already use in
 * credentials.ts) rather than a raw-SQL jsonb merge — this array is small
 * (one entry per Whop Agent skill, ~15 max) and never written concurrently
 * for the same engagement in a way that a lost update would matter. */
export async function clearDryRunForSkill(engagementId: string, skillId: string): Promise<void> {
  const [row] = await db
    .select({ dryRunClearedSkills: whopAgentConnections.dryRunClearedSkills })
    .from(whopAgentConnections)
    .where(eq(whopAgentConnections.engagementId, engagementId))
    .limit(1);
  if (!row || row.dryRunClearedSkills.includes(skillId)) return;

  await db
    .update(whopAgentConnections)
    .set({ dryRunClearedSkills: [...row.dryRunClearedSkills, skillId], updatedAt: new Date() })
    .where(eq(whopAgentConnections.engagementId, engagementId));
}

/** One planned call, recorded instead of executed while dry-run is
 * active — this list IS the dry-run's output (Section 8.2's "shows the
 * exact set of calls and resulting state changes"). */
export interface PlannedCall {
  method: "POST" | "PATCH" | "DELETE";
  description: string;
  body?: unknown;
}
