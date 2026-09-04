import { REP_SKILL_IDS } from "@/lib/rep-skill-manifest";
import { SKILL_IDS } from "@/lib/skill-manifest";

/**
 * Product-level metadata deliberately lives separately from the individual
 * skill manifests. A workspace installs products; engagements enable or
 * disable the skills inside those products.
 */
export const PRODUCT_IDS = ["showtime", "reputation-manager"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export const PRODUCT_SKILL_IDS = {
  showtime: SKILL_IDS,
  "reputation-manager": REP_SKILL_IDS,
} as const;

export function isProductId(value: string | null | undefined): value is ProductId {
  return Boolean(value && (PRODUCT_IDS as readonly string[]).includes(value));
}

export function skillIdsForProduct(productId: ProductId): readonly string[] {
  return PRODUCT_SKILL_IDS[productId];
}
