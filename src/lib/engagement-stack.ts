// src/lib/engagement-stack.ts
//
// Atomic writes to engagements.stack. Reading the whole stack, changing a
// key in JS, and writing the whole object back loses any other write that
// lands in between (a tour step saving while a config form saves, two
// forms at once): the second write restores the first reader's stale copy.
// These do the change inside one UPDATE instead, so only the named keys
// are touched.

import { sql, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";

/**
 * Sets the given top-level stack keys; a key whose value is `undefined`
 * is removed. Every other key is left exactly as stored.
 */
export async function patchEngagementStack(engagementId: string, patch: Partial<EngagementStack>): Promise<void> {
  await db.update(engagements).set({ stack: stackPatchSql(patch), updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
}

/**
 * The value for `.set({ stack: ... })` that applies `patch` the same way
 * patchEngagementStack does, for an update that also writes other columns
 * in the same statement.
 */
export function stackPatchSql(patch: Partial<EngagementStack>): SQL {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) remove.push(key);
    else set[key] = value;
  }
  let expr: SQL = sql`coalesce(${engagements.stack}, '{}'::jsonb)`;
  for (const key of remove) expr = sql`(${expr} - ${key}::text)`;
  if (Object.keys(set).length > 0) expr = sql`(${expr} || ${JSON.stringify(set)}::jsonb)`;
  return expr;
}

/**
 * The top-level keys `after` changes relative to `before` (the copy the
 * caller read): changed or added keys carry their new value, and keys
 * `after` dropped are `undefined`, which removes them.
 */
export function stackDiff(before: Partial<EngagementStack> | null | undefined, after: Partial<EngagementStack>): Partial<EngagementStack> {
  const prev = (before ?? {}) as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      if (key in prev && prev[key] !== undefined) patch[key] = undefined;
    } else if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) {
      patch[key] = next[key];
    }
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next) && prev[key] !== undefined) patch[key] = undefined;
  }
  return patch as Partial<EngagementStack>;
}

/**
 * For code that read the stack, built a whole new object and used to write
 * it back: writes only what changed, so a key someone else saved in the
 * meantime isn't put back to the stale copy.
 */
export function stackChanges(before: Partial<EngagementStack> | null | undefined, after: Partial<EngagementStack>): SQL {
  return stackPatchSql(stackDiff(before, after));
}

/** Sets stack[key][entryKey] = value (for map-shaped keys like tour_state),
 * leaving the map's other entries as stored. */
export async function setEngagementStackEntry(engagementId: string, key: keyof EngagementStack & string, entryKey: string, value: unknown): Promise<void> {
  await db
    .update(engagements)
    .set({
      stack: sql`coalesce(${engagements.stack}, '{}'::jsonb) || jsonb_build_object(${key}::text, coalesce(${engagements.stack} -> ${key}::text, '{}'::jsonb) || jsonb_build_object(${entryKey}::text, ${JSON.stringify(value)}::jsonb))`,
      updatedAt: new Date(),
    })
    .where(eq(engagements.engagementId, engagementId));
}
