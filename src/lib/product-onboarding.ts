// src/lib/product-onboarding.ts
//
// The real gap: enable/route.ts and its 4 per-product sibling toggle
// routes (skills/[skillId], skills/rep/[skillId], skills/cold-open/
// [skillId], skills/whop-agent/[skillId]) each only ever checked that ONE
// skill's own runOnSetup flag against itself. Every other skill in that
// same product enabled immediately with zero check that the product's
// own onboarding (pin-down / rep-onboarding / icp-lock / whop-connect)
// had actually run for this client — so "Daily Send" could be switched on
// before ICP Lock ever fired. This module is the one shared answer to
// "has this product actually been onboarded for this engagement," reused
// by all 5 routes instead of each reimplementing its own guess, plus the
// client-side pages that need to know before rendering an Enable button.
//
// Each product's signal is real, already-written data — not a new flag
// this pass invents:
//   - showtime: pin-down writes engagements.confirmationPageUrl once its
//     onboarding run actually deploys (or reuses) a confirmation page.
//   - reputation-manager: rep-onboarding writes a repIdentityGraphs row.
//   - cold-open: icp-lock writes a coldOpenConfig row.
//   - whop-agent: whop-connect writes a whopAgentConnections row.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, coldOpenConfig, whopAgentConnections, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import type { ProductId } from "@/lib/product-catalog";

export async function isProductOnboarded(productId: ProductId, engagementId: string): Promise<boolean> {
  if (productId === "showtime") {
    const [row] = await db
      .select({ confirmationPageUrl: engagements.confirmationPageUrl })
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .limit(1);
    return Boolean(row?.confirmationPageUrl);
  }
  if (productId === "reputation-manager") {
    const [row] = await db.select({ id: repIdentityGraphs.id }).from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
    return Boolean(row);
  }
  if (productId === "cold-open") {
    const [row] = await db.select({ id: coldOpenConfig.id }).from(coldOpenConfig).where(eq(coldOpenConfig.engagementId, engagementId)).limit(1);
    return Boolean(row);
  }
  // whop-agent
  const [row] = await db.select({ id: whopAgentConnections.id }).from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId)).limit(1);
  return Boolean(row);
}

/** Reads the per-product "skip for now" dismissal off an already-fetched
 * stack — never fetches itself, since every caller of this already has
 * (or is about to have) the engagement row in hand. Skipping only
 * changes how the CLIENT reacts to a gated product (a quiet inline note
 * instead of a hard redirect every time) — it never touches whether
 * isProductOnboarded returns true, so the actual enable gate above is
 * unaffected by it. */
export function isProductOnboardingSkipDismissed(stack: EngagementStack | null | undefined, productId: ProductId): boolean {
  return Boolean(stack?.product_onboarding_skip_dismissed_at?.[productId]);
}
