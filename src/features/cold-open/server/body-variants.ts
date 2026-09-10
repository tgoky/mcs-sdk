// src/features/cold-open/server/body-variants.ts
//
// Per-ICP body-variant pools + deterministic rotation. Direct port of the
// Cold Open skill pack's body_variants.py — the internal outreach audit
// (2026-07-20, Panel 1 Issue #1) found one fixed body ran ~93% identical
// across 9 different leads in a week (a spam-filter and human-inbox
// fingerprint). Upload-mode copy (the buyer's own fixed templates) is the
// risk surface for that pattern in Cold Open — generate-mode already
// varies per lead via a fresh LLM call — so this module resolves the
// variant pool available for an ICP and requires at least `minVariants`
// (default 2) before Daily Send can run in upload mode.
//
// Storage shape here is simpler than the source module's file-composition
// model (coldOpenConfig.bodyVariantPools is already a
// Record<icpSlugOrDefault, Touchset[]> — see schema.ts) since this app has
// one config row per engagement instead of N template files to fold
// together; resolvePool's precedence (icp-specific > default) is kept
// identical.

import { pickByHash } from "./hash-rotation";

export interface BodyTouchset {
  subject: string;
  body1: string;
  body2: string;
  body3: string;
}

export const DEFAULT_MIN_VARIANTS = 2;
const DEFAULT_KEY = "default";

/** The variant pool that applies to `icp`: icp-specific > default. */
export function resolvePool(pools: Record<string, BodyTouchset[]>, icp: string): BodyTouchset[] {
  pools = pools ?? {};
  if (icp && pools[icp]?.length) return pools[icp];
  if (pools[DEFAULT_KEY]?.length) return pools[DEFAULT_KEY];
  return [];
}

/** Deterministically pick one touchset from the pool for this lead (same
 * lead_email -> same variant forever; consecutive leads spread across the
 * pool). Throws on an empty pool — the caller resolves an empty pool
 * before this point. */
export function pickBodyVariant(leadEmail: string, pool: BodyTouchset[]): BodyTouchset {
  return pickByHash(leadEmail, pool ?? []);
}

/** Every configured ICP must resolve to at least `minVariants` body
 * variants. Returns a list of human-readable problems ([] == clean) —
 * the upload-mode gate the audit's 93%-similarity finding motivates. */
export function validateBodyVariants(
  pools: Record<string, BodyTouchset[]>,
  icpSlugs: string[],
  minVariants: number = DEFAULT_MIN_VARIANTS
): string[] {
  const problems: string[] = [];
  for (const slug of icpSlugs ?? []) {
    const pool = resolvePool(pools, slug);
    if (pool.length < minVariants) {
      const src = pool.length === 0 ? "no template" : `only ${pool.length} variant${pool.length === 1 ? "" : "s"}`;
      problems.push(
        `ICP '${slug}': ${src} — Cold Open requires at least ${minVariants} body variants per ICP so the same body ` +
          `never sends to many similar prospects in a week (internal outreach audit 2026-07-20 found one fixed ` +
          `body ran ~93% identical across 9 leads and got fingerprinted). Add another variant, or lower the ` +
          `minimum if you accept the risk.`
      );
    }
  }
  if (!icpSlugs || icpSlugs.length === 0) {
    const pool = resolvePool(pools, "");
    if (pool.length < minVariants) {
      problems.push(`upload templates resolve to only ${pool.length} body variant(s) — at least ${minVariants} are required (audit Panel 1 Issue #1).`);
    }
  }
  return problems;
}
