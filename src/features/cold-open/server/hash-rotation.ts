// src/features/cold-open/server/hash-rotation.ts
//
// One deterministic per-lead rotation primitive. Direct port of the Cold
// Open skill pack's hash_rotation.py — same MD5-based approach for the
// same reason: it's a STABLE hash, not a security control. A JS engine's
// string hashing isn't guaranteed stable across runs the way Python's
// unsalted MD5 use here is, so this uses Node's crypto module directly
// rather than reaching for a non-cryptographic hash — same lead_email
// must map to the same variant forever, consecutive leads must spread
// across the pool.

import { createHash } from "crypto";

/** Deterministic index in [0, n) from an arbitrary seed string. A blank or
 * undefined seed hashes stably too (it never throws), so a missing lead
 * email always maps to a fixed index rather than erroring. */
export function hashIndex(seed: string | null | undefined, n: number): number {
  if (n <= 0) throw new Error("hashIndex needs a positive n");
  const digest = createHash("md5").update(seed ?? "", "utf8").digest("hex");
  return parseInt(digest.slice(0, 8), 16) % n;
}

/** Deterministically pick one element of `items` for this seed. Same seed
 * -> same element forever; consecutive seeds spread across the pool. */
export function pickByHash<T>(seed: string | null | undefined, items: T[]): T {
  if (!items || items.length === 0) throw new Error("pickByHash needs a non-empty items list");
  return items[hashIndex(seed, items.length)];
}
