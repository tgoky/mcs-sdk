// src/lib/reminder-holdout.ts
//
// Holdout proof: while the client has it on, a fixed share of bookings
// (chosen by a hash of the booking id, so a replay picks the same way) gets
// no reminder texts. Comparing the show rate of reminded bookings with
// held-out ones, on the client's own calls in the same weeks, shows what
// the reminders are worth, rather than a before-and-after that other
// changes could explain.

import crypto from "crypto";
import { db } from "@/lib/db";
import { reminderHoldouts } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import type { HoldoutComparison } from "@/lib/client-results-shape";

export const MAX_HOLDOUT_PERCENT = 20;
/** Fewer outcomes than this on either side and the comparison isn't shown as proof. */
export const MIN_HOLDOUT_SAMPLE = 20;

export function inHoldout(engagementId: string, bookingId: string, percent: number): boolean {
  if (!(percent > 0)) return false;
  const bucket = crypto.createHash("sha256").update(`${engagementId}:${bookingId}`).digest().readUInt32BE(0) % 100;
  return bucket < Math.min(percent, MAX_HOLDOUT_PERCENT);
}

/** Decides (once per booking) and records whether it's held out. */
export async function decideHoldout(engagementId: string, bookingId: string, percent: number | undefined): Promise<boolean> {
  if (!percent || percent <= 0) return false;
  const heldOut = inHoldout(engagementId, bookingId, percent);
  await db.insert(reminderHoldouts).values({ engagementId, bookingId, heldOut, percent: Math.round(percent) }).onConflictDoNothing();
  const [row] = await db.select({ heldOut: reminderHoldouts.heldOut }).from(reminderHoldouts).where(and(eq(reminderHoldouts.engagementId, engagementId), eq(reminderHoldouts.bookingId, bookingId))).limit(1);
  return row?.heldOut ?? heldOut;
}

export async function isHeldOut(engagementId: string, bookingId: string): Promise<boolean> {
  const [row] = await db.select({ heldOut: reminderHoldouts.heldOut }).from(reminderHoldouts).where(and(eq(reminderHoldouts.engagementId, engagementId), eq(reminderHoldouts.bookingId, bookingId))).limit(1);
  return row?.heldOut ?? false;
}

export type { HoldoutComparison };

/** Latest outcome per booking, split by whether it was held out. */
export function compareHoldout(decisions: { bookingId: string; heldOut: boolean }[], outcomes: { bookingId: string; outcome: string; at: Date }[]): HoldoutComparison | null {
  if (!decisions.length) return null;
  const latest = new Map<string, string>();
  for (const o of [...outcomes].sort((a, b) => a.at.getTime() - b.at.getTime())) if (o.outcome === "showed" || o.outcome === "no_show") latest.set(o.bookingId, o.outcome);
  const side = { reminded: { showed: 0, total: 0 }, heldOut: { showed: 0, total: 0 } };
  for (const d of decisions) {
    const o = latest.get(d.bookingId);
    if (!o) continue;
    const s = d.heldOut ? side.heldOut : side.reminded;
    s.total++;
    if (o === "showed") s.showed++;
  }
  const enough = side.reminded.total >= MIN_HOLDOUT_SAMPLE && side.heldOut.total >= MIN_HOLDOUT_SAMPLE;
  const liftPoints = enough ? Math.round((side.reminded.showed / side.reminded.total - side.heldOut.showed / side.heldOut.total) * 100) : null;
  return { ...side, liftPoints };
}
