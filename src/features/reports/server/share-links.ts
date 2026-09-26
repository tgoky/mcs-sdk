// src/features/reports/server/share-links.ts
//
// A no-login link to one client's results (app/results/[token]/page.tsx),
// made from the engagement's actions menu. The token is 32 random bytes;
// only its SHA-256 is stored, so a database read can't be turned back into
// a working link. One live link per client: making a new one retires the
// old, and it can be turned off at any time.

import crypto from "crypto";
import { db } from "@/lib/db";
import { resultsShareLinks } from "@/models/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const hashShareToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** base64url, 43 characters: the shape a real token has. */
export function looksLikeShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function createShareLink(engagementId: string, createdBy: string | null): Promise<{ token: string; createdAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(resultsShareLinks).set({ revokedAt: now }).where(and(eq(resultsShareLinks.engagementId, engagementId), isNull(resultsShareLinks.revokedAt)));
    await tx.insert(resultsShareLinks).values({ engagementId, tokenHash: hashShareToken(token), createdBy, createdAt: now });
  });
  return { token, createdAt: now };
}

export async function revokeShareLinks(engagementId: string): Promise<void> {
  await db.update(resultsShareLinks).set({ revokedAt: new Date() }).where(and(eq(resultsShareLinks.engagementId, engagementId), isNull(resultsShareLinks.revokedAt)));
}

export async function activeShareLink(engagementId: string): Promise<{ createdAt: Date; viewCount: number; lastViewedAt: Date | null } | null> {
  const [row] = await db
    .select({ createdAt: resultsShareLinks.createdAt, viewCount: resultsShareLinks.viewCount, lastViewedAt: resultsShareLinks.lastViewedAt })
    .from(resultsShareLinks)
    .where(and(eq(resultsShareLinks.engagementId, engagementId), isNull(resultsShareLinks.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** The client a live token opens, counting the view. Null for anything else. */
export async function openShareLink(token: string): Promise<string | null> {
  if (!looksLikeShareToken(token)) return null;
  const [row] = await db
    .update(resultsShareLinks)
    .set({ viewCount: sql`${resultsShareLinks.viewCount} + 1`, lastViewedAt: new Date() })
    .where(and(eq(resultsShareLinks.tokenHash, hashShareToken(token)), isNull(resultsShareLinks.revokedAt)))
    .returning({ engagementId: resultsShareLinks.engagementId });
  return row?.engagementId ?? null;
}
