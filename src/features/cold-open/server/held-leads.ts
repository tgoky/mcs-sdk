// src/features/cold-open/server/held-leads.ts
//
// Review queue for leads Daily Send held back because their ICP is
// review-required (see coldOpenConfig.reviewRequiredIcps / autoPushIcps).
// Before this existed, a held lead was written to coldOpenLeads with
// status "held" and nothing ever read that row again — there was no
// route, page, or action anywhere that let a buyer approve or discard it,
// so a review-required lead sat forever unreachable (see daily-send.ts's
// dedupe fix in the same pass: a held lead is now excluded from
// re-fetching too, so it no longer burned a fresh LLM call every day on
// top of being stuck).

import { db } from "@/lib/db";
import { coldOpenLeads } from "@/models/schema";
import { and, desc, eq } from "drizzle-orm";
import { getColdOpenConfig } from "./config";
import { createEspAdapter } from "./esp/factory";
import type { AssembledCopy } from "./copy-engine";

export type HeldLeadRow = typeof coldOpenLeads.$inferSelect;

export async function listHeldLeads(engagementId: string): Promise<HeldLeadRow[]> {
  return db
    .select()
    .from(coldOpenLeads)
    .where(and(eq(coldOpenLeads.engagementId, engagementId), eq(coldOpenLeads.status, "held")))
    .orderBy(desc(coldOpenLeads.createdAt));
}

export type ReleaseHeldLeadResult = { ok: true; status: "pushed" | "dry_run" | "discarded" } | { error: string };

/** Approve (push to the ESP, respecting the engagement's current
 * live/dry-run setting) or discard a single held lead. Only ever acts on
 * a row that's still "held" and belongs to this engagement — an
 * already-resolved row (approved/discarded/superseded) is left alone
 * rather than double-pushed.
 *
 * Fix: this used to SELECT the row, check status === "held" in JS, and
 * only later UPDATE it — a real check-then-act gap with no lock between
 * the read and the write. Two concurrent calls for the same leadId (a
 * double-click on Approve, the single most ordinary real-world UI
 * interaction there is) could both read status: "held" before either
 * committed, and both go on to call adapter.pushLead — actually emailing
 * the same prospect twice from one click. Fixed with a plain conditional
 * UPDATE ... WHERE status = 'held' as the atomic claim: Postgres
 * re-evaluates that WHERE clause against the row's real committed value
 * at UPDATE time, so the loser of two concurrent claims matches zero rows
 * instead of also proceeding — no explicit transaction/row lock needed
 * for a single-row compare-and-swap like this one. The ESP push itself
 * stays outside any lock, same reasoning this codebase already applies
 * elsewhere (run-log.ts's withStepsLock, approval-gate.ts's
 * decidePendingAction) to keep a real network call from holding one. */
export async function releaseHeldLead(engagementId: string, leadId: string, action: "approve" | "discard"): Promise<ReleaseHeldLeadResult> {
  const [claimed] = await db
    .update(coldOpenLeads)
    .set({ status: action === "discard" ? "discarded" : "claiming" })
    .where(and(eq(coldOpenLeads.id, leadId), eq(coldOpenLeads.engagementId, engagementId), eq(coldOpenLeads.status, "held")))
    .returning();

  if (!claimed) {
    return { error: "This lead is no longer in the held queue — it may have already been reviewed." };
  }
  // statusDetail on `claimed` is the pre-claim value — the claim UPDATE
  // above only touched `status`.
  const lead = claimed;

  if (action === "discard") {
    await db
      .update(coldOpenLeads)
      .set({ statusDetail: { ...(lead.statusDetail as Record<string, unknown> | null), discardedAt: new Date().toISOString() } })
      .where(eq(coldOpenLeads.id, leadId));
    return { ok: true, status: "discarded" };
  }

  const config = await getColdOpenConfig(engagementId);
  if (!config?.sendPlatform) {
    await db.update(coldOpenLeads).set({ status: "held" }).where(eq(coldOpenLeads.id, leadId));
    return { error: "No sending platform configured for this engagement anymore — reconnect Send Connect first." };
  }
  const copy = (lead.statusDetail as { copy?: AssembledCopy } | null)?.copy;
  if (!copy) {
    await db.update(coldOpenLeads).set({ status: "held" }).where(eq(coldOpenLeads.id, leadId));
    return { error: "This held lead has no saved copy to send — it was likely created before a code update. Discard it and let it re-fetch on the next run." };
  }

  const adapter = createEspAdapter(engagementId, config.sendPlatform.platform, { baseUrl: config.sendPlatform.baseUrl });
  const dryRun = !config.dailySendSettings?.liveSendEnabled;

  try {
    const result = await adapter.pushLead(
      { email: lead.email, firstName: lead.firstName ?? undefined, lastName: lead.lastName ?? undefined, companyName: lead.companyName, title: lead.title ?? undefined, icp: lead.icp ?? undefined },
      lead.campaignId,
      copy,
      dryRun
    );
    await db
      .update(coldOpenLeads)
      .set({
        status: result.status,
        statusDetail: { ...(lead.statusDetail as Record<string, unknown> | null), approvedAt: new Date().toISOString(), pushResult: result.detail },
        pushedAt: result.status === "pushed" ? new Date() : null,
      })
      .where(eq(coldOpenLeads.id, leadId));
    return { ok: true, status: result.status };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(coldOpenLeads)
      .set({ status: "error", statusDetail: { ...(lead.statusDetail as Record<string, unknown> | null), error: detail } })
      .where(eq(coldOpenLeads.id, leadId));
    return { error: `Push failed: ${detail}` };
  }
}
