// src/lib/chat-whop-agent.ts
//
// Wires Whop Agent's own real actions into the Teammates chat, closing
// the gap where the chat had a product-install flag and a connection
// health check (check_whop_connection) but literally no way to run any
// of Whop Agent's 15 skills. Same discipline as chat-pile-on.ts and
// chat-winback.ts: thin wrappers around the exact same service functions
// each skill's own dashboard route already calls — see each route under
// src/app/api/engagements/[id]/whop-agent/ for the one-to-one match —
// never a second, parallel execution path.
//
// Ownership check is isAuthorizedForEngagement (whop-access.ts), the
// same check every one of those routes already uses, rather than a
// hand-rolled workspace join re-derived here — one source of truth for
// "does this session own this engagement."
//
// Safety gates are NOT reimplemented here — they already live in the
// service layer and are inherited for free by calling the same
// functions the dashboard calls:
//   - whop-product-launch-preflight / whop-bulk-promo-codes: dry-run by
//     default on first execution per engagement (Section 8.2 —
//     isDryRunRequired), only bypassed if the caller explicitly passes
//     dryRun:false, which chat only does after the user explicitly
//     confirms a dry run's result (see the system prompt rule).
//   - whop-cancellation-save-offer's discount config, dispute evidence
//     submission, and the ads flip-to-active are all queue-only here —
//     queueNativeCancelDiscountConfig / queueDisputeEvidenceSubmit /
//     queueAdsFlipToActive write a row to pendingActions (Section 8.3)
//     that a human must separately approve in the dashboard; nothing
//     these wrappers call ever writes live to Whop directly.
//   - whop-connect itself (pasting the Bot API key) is deliberately NOT
//     here — same raw-secret exclusion chat-credentials.ts's header
//     explains for booking/email platforms, unconditional for Whop too.
//
// Not every Whop Agent skill has a wrapper here. whop-drift-monitor and
// whop-refund-dispute-velocity run only on their own cron dispatch
// (src/inngest/whop-agent.ts) with no manual endpoint anywhere in the
// app, dashboard included — same category as Reputation Manager's watch
// skills (see route.ts's own rule on those). whop-daily-change-digest is
// notification-only, not a tracked run at all. Building a manual trigger
// for any of those three would be inventing a capability the app itself
// doesn't have yet, not wiring chat to an existing one.

import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { startRun, failRun } from "@/lib/run-log";
import { inngest, whopAdsDraftProcess } from "@/lib/inngest";
import crypto from "crypto";
import { runProductLaunchBatch, type ProductLaunchInput } from "@/features/whop-agent/server/product-launch-preflight-service";
import { assemblePurchaseCapPacket, type PurchaseCapPacketInput } from "@/features/whop-agent/server/purchase-cap-copilot-service";
import { queueNativeCancelDiscountConfig } from "@/features/whop-agent/server/cancellation-save-offer-service";
import { assemblePayoutHoldPacket } from "@/features/whop-agent/server/payout-hold-kit-service";
import { assembleDisputeResponse, queueDisputeEvidenceSubmit, type DisputeEvidenceDraft } from "@/features/whop-agent/server/dispute-response-service";
import { queueAdsFlipToActive } from "@/features/whop-agent/server/whop-ads-service";
import { runBulkPromoCodes, type PromoCodeSpec } from "@/features/whop-agent/server/bulk-promo-codes-service";
import { dispatchPortfolioRollupRun } from "@/features/whop-agent/server/portfolio-rollup-service";
import { dispatchWeeklyOpsReportRun } from "@/features/whop-agent/server/weekly-ops-report-service";
import { dispatchAttributionReportRun } from "@/features/whop-agent/server/attribution-report-service";

type Session = { whopUserId?: string; email: string };
type ActionResult = { ok: true; message: string; runId?: string } | { ok: false; error: string };

async function requireAccess(session: Session, engagementId: string): Promise<string | null> {
  if (!(await isAuthorizedForEngagement(session, engagementId))) return "Client not found or access denied.";
  return null;
}

export async function runProductLaunchPreflightForEngagement(
  session: Session,
  engagementId: string,
  input: ProductLaunchInput
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!input.title || !input.headline || !Array.isArray(input.plans) || input.plans.length === 0) {
    return { ok: false, error: "title, headline, and at least one plan are required." };
  }
  try {
    const result = await runProductLaunchBatch(engagementId, [input]);
    if (result.queued) {
      return { ok: true, message: `Queued for confirmation (${result.pendingActionId}) — review it in the dashboard's Approvals before it launches.` };
    }
    const one = result.results[0];
    if (one.status === "halted_on_validation") {
      return { ok: false, error: `Preflight failed: ${(one.violations ?? []).map((v) => `${v.field}: ${v.message}`).join("; ")}` };
    }
    if (one.status === "halted_on_purchase_cap") {
      return { ok: false, error: "Halted — one of these plans exceeds the purchase cap. Use assemble_purchase_cap_packet to request an increase first." };
    }
    if (one.status === "dry_run") {
      return {
        ok: true,
        message:
          "Dry run only (this client's first Product Launch Pre-Flight run, per Section 8.2) — no product was actually created, this was a preview of what would be. There's currently no single-launch path (here or in the dashboard) to force it live from here — going live requires either a batch of 4+ products (queued for a human to approve in Approvals) or this client having already gone live once through that path.",
      };
    }
    return { ok: true, message: `Launched "${input.title}" — product ${one.productId}, plans ${one.createdPlanIds?.join(", ") ?? "none"}${one.promoCodeId ? `, promo code ${one.promoCodeId}` : ""}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function assemblePurchaseCapPacketForEngagement(
  session: Session,
  engagementId: string,
  input: PurchaseCapPacketInput
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!Number.isFinite(input.highestPricedOfferCents) || !Number.isFinite(input.targetApprovalAmountCents) || !input.contactEmail) {
    return { ok: false, error: "highestPricedOfferCents, targetApprovalAmountCents, and contactEmail are required." };
  }
  try {
    const packet = await assemblePurchaseCapPacket(engagementId, input);
    return {
      ok: true,
      message: `Purchase cap increase packet assembled. Sales: ${
        packet.salesHistory.unavailable ? "unavailable" : `$${((packet.salesHistory.grossRevenueCents ?? 0) / 100).toFixed(2)} gross, ${packet.salesHistory.successfulPayments ?? 0} payments`
      }. Walkthrough: ${packet.walkthrough.join(" -> ")}. ${packet.reserveAlternativeNote}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function configureCancelDiscountForEngagement(
  session: Session,
  engagementId: string,
  planId: string,
  percentage: number,
  intervals: number
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!planId || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100 || !Number.isInteger(intervals) || intervals <= 0) {
    return { ok: false, error: "planId, a percentage between 1-100, and a positive whole number of intervals are required." };
  }
  try {
    const pendingActionId = await queueNativeCancelDiscountConfig(engagementId, planId, { percentage, intervals });
    return { ok: true, message: `Queued for confirmation (${pendingActionId}) — this changes what every cancelling member sees, so a human needs to approve it in the dashboard's Approvals before it goes live.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function assemblePayoutHoldKitForEngagement(session: Session, engagementId: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  try {
    const { packet } = await assemblePayoutHoldPacket(engagementId);
    return {
      ok: true,
      message: `Payout hold kit assembled. Chargeback ratio (90d): ${packet.chargebackRatio90d ?? "unknown"}. Payout methods on file: ${packet.payoutMethods.length}. Drafted escalation:\n${packet.draftedEscalation}\n\nFollow-up checklist: ${packet.followUpChecklist.join(" | ")}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function assembleDisputeResponseForEngagement(session: Session, engagementId: string, disputeId: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!disputeId) return { ok: false, error: "disputeId is required." };
  try {
    const result = await assembleDisputeResponse(engagementId, disputeId);
    if (result.status === "window_closed") {
      return { ok: false, error: "The evidence submission window for this dispute has already closed — nothing can be drafted or submitted now." };
    }
    return {
      ok: true,
      message: `Draft assembled for dispute ${disputeId}${result.usedGeneratedResponse ? " (used Whop's own generated response as a starting point)" : ""}. Draft notes: ${result.draft?.notes ?? "(none)"}. Still needed manually: ${result.gatheredManually.join(", ") || "nothing"}. Review this with the user, then call submit_dispute_evidence with the final draft if they want to submit it.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function submitDisputeEvidenceForEngagement(
  session: Session,
  engagementId: string,
  disputeId: string,
  draft: DisputeEvidenceDraft
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!disputeId || !draft?.notes) return { ok: false, error: "disputeId and draft.notes are required." };
  try {
    const pendingActionId = await queueDisputeEvidenceSubmit(engagementId, disputeId, draft);
    return { ok: true, message: `Queued for confirmation (${pendingActionId}) — dispute evidence submission always needs a human's approval in the dashboard before it's actually sent to Whop.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function draftWhopAdForEngagement(
  session: Session,
  engagementId: string,
  input: { productId: string; creativeBrief: string; budgetCents: number; budgetLevel: "ad_group" | "campaign"; targeting?: Record<string, unknown> }
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!input.productId || !input.creativeBrief || !Number.isFinite(input.budgetCents) || input.budgetCents <= 0) {
    return { ok: false, error: "productId, creativeBrief, and a positive budgetCents are required." };
  }
  if (input.budgetLevel !== "ad_group" && input.budgetLevel !== "campaign") {
    return { ok: false, error: "budgetLevel must be 'ad_group' or 'campaign'." };
  }
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-ads-draft-approve", phase: "social_account_preflight", label: "Whop Ads draft" });
  try {
    await inngest.send(whopAdsDraftProcess.create({ runId, engagementId, input }));
  } catch (dispatchErr) {
    await failRun(runId, dispatchErr);
    return { ok: false, error: "Failed to dispatch the ad draft to the background queue." };
  }
  return {
    ok: true,
    runId,
    message: "Drafting the ad now (generating media, then creating it in draft status — no spend yet). This can take a minute; check get_run_history for the result. Flipping it active is a separate step once you've reviewed the draft.",
  };
}

export async function flipWhopAdActiveForEngagement(session: Session, engagementId: string, adId: string, budgetCents: number): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!adId || !Number.isFinite(budgetCents) || budgetCents <= 0) return { ok: false, error: "adId and a positive budgetCents are required." };
  try {
    const pendingActionId = await queueAdsFlipToActive(engagementId, adId, budgetCents);
    return { ok: true, message: `Queued for confirmation (${pendingActionId}) — flipping an ad active always needs a human's approval in the dashboard, since it starts real spend.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runBulkPromoCodesForEngagement(
  session: Session,
  engagementId: string,
  specs: PromoCodeSpec[],
  dryRun: boolean | undefined
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!Array.isArray(specs) || specs.length === 0 || !specs.every((s) => typeof s?.code === "string" && Array.isArray(s?.planIds) && s.planIds.length > 0)) {
    return { ok: false, error: "At least one code is required, each with a code and planIds[]." };
  }
  try {
    const result = await runBulkPromoCodes(engagementId, specs, { dryRun });
    if (result.status === "queued_for_confirmation") {
      return { ok: true, message: `Batch exceeds the confirmation threshold — queued (${result.pendingActionId}) for a human to approve in the dashboard.` };
    }
    if (result.status === "dry_run") {
      return { ok: true, message: `Dry run only (first run for this client per Section 8.2, or dryRun was left unset) — would create: ${specs.map((s) => s.code).join(", ")}. No live call was made. Confirm with the user, then call this again with dryRun:false to actually create them.` };
    }
    if (result.status === "queued_live") {
      return { ok: true, runId: result.runId, message: "Dispatched — creating the codes for real now in the background. Check get_run_history for the result." };
    }
    return { ok: true, message: `Created: ${result.created.join(", ") || "none"}.${result.failed.length ? ` Failed: ${result.failed.map((f) => `${f.code} (${f.error})`).join("; ")}.` : ""}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runPortfolioRollupForEngagement(session: Session, engagementId: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  try {
    const runId = await dispatchPortfolioRollupRun(engagementId);
    return { ok: true, runId, message: "Running the portfolio rollup now. Check get_run_history for the result." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runWeeklyOpsReportForEngagement(session: Session, engagementId: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  try {
    const runId = await dispatchWeeklyOpsReportRun(engagementId);
    return { ok: true, runId, message: "Running the weekly ops report now. Check get_run_history for the result." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runAttributionReportForEngagement(session: Session, engagementId: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  try {
    const { runId, report } = await dispatchAttributionReportRun(engagementId);
    return {
      ok: true,
      runId,
      message: `Attribution report ready — ${report.totalMemberships} membership(s) total, ${report.byPromoCode.length} promo code group(s), ${report.byAffiliate.length} affiliate group(s), ${report.byCheckoutSession.length} checkout-session group(s).${report.shapeMismatch ? ` Note: ${report.shapeMismatch}` : ""}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Playbook 5.12's own "Trigger: Manual for configuration" — a plain
 * config write, never gated: it only tells the agent where to route
 * already-verified webhook events it receives, it doesn't touch Whop or
 * the destination itself. Mirrors bridge-config/route.ts's POST exactly
 * (same https-only validation) rather than a second, looser copy. */
export async function configureWhopBridgeForEngagement(session: Session, engagementId: string, destinationUrl: string): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  let parsed: URL;
  try {
    parsed = new URL(destinationUrl);
    if (parsed.protocol !== "https:") throw new Error("must be https");
  } catch {
    return { ok: false, error: "destinationUrl must be a valid https:// URL." };
  }
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return { ok: false, error: "Client not found." };
  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  await db.update(engagements).set({ stack: { ...stack, whop_bridge_destination_url: parsed.toString() }, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
  return { ok: true, message: `Bridge destination set to ${parsed.toString()}. Field mapping (if this destination needs one) still has to be set on the client's own Bridge Manager page.` };
}

/** save-offer-config/route.ts's own POST, mirrored exactly — a plain
 * config write, not gated (Section 8.3's gate is on actually applying an
 * offer to a live cancel-intent event, not on saving what that offer
 * would say). */
export async function configureCancellationSaveOfferForEngagement(
  session: Session,
  engagementId: string,
  config: { discountPercentage: number; durationMonths: number; message: string; minTenureDays?: number; cooldownDays?: number }
): Promise<ActionResult> {
  const denied = await requireAccess(session, engagementId);
  if (denied) return { ok: false, error: denied };
  if (!Number.isFinite(config.discountPercentage) || config.discountPercentage <= 0 || config.discountPercentage > 100) {
    return { ok: false, error: "discountPercentage must be a number between 1 and 100." };
  }
  if (!Number.isInteger(config.durationMonths) || config.durationMonths <= 0) {
    return { ok: false, error: "durationMonths must be a positive whole number." };
  }
  if (!config.message?.trim()) {
    return { ok: false, error: "A message is required — never propose an offer with a guessed message." };
  }
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return { ok: false, error: "Client not found." };
  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  await db
    .update(engagements)
    .set({
      stack: {
        ...stack,
        whop_save_offer_discount_percentage: config.discountPercentage,
        whop_save_offer_duration_months: config.durationMonths,
        whop_save_offer_message: config.message.trim(),
        whop_save_offer_min_tenure_days: config.minTenureDays,
        whop_save_offer_cooldown_days: config.cooldownDays,
      },
      updatedAt: new Date(),
    })
    .where(eq(engagements.engagementId, engagementId));
  return { ok: true, message: "Cancellation save-offer configuration saved. It'll be proposed automatically the next time a real cancel-intent event comes in for this client." };
}
