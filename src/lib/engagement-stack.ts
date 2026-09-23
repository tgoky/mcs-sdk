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
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) remove.push(key);
    else set[key] = value;
  }
  let expr: SQL = sql`coalesce(${engagements.stack}, '{}'::jsonb)`;
  for (const key of remove) expr = sql`(${expr} - ${key}::text)`;
  if (Object.keys(set).length > 0) expr = sql`(${expr} || ${JSON.stringify(set)}::jsonb)`;
  await db.update(engagements).set({ stack: expr, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
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
