// src/lib/user-avatar.ts
//
// Read/write for the four avatar columns on users (see their doc in
// schema.ts). A users row always exists by the time an authenticated
// session can reach any of these — created on the Whop OAuth callback and
// kept in sync by the Whop webhook (see api/auth/callback/route.ts and
// api/webhooks/whop/route.ts) — so these are plain UPDATEs, no upsert
// needed, same as the existing markExecutionsSeen.

import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { eq, sql } from "drizzle-orm";
import { isAvatarStyleId, type AvatarStyleId } from "@/lib/avatar";

export interface UserAvatarPrefs {
  avatarType: "upload" | "dicebear" | null;
  avatarStyle: AvatarStyleId | null;
  avatarSeed: string | null;
  avatarImageUrl: string | null;
}

/** Raster types an upload may be — never SVG, which can carry script. */
export const UPLOAD_IMAGE_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const NO_AVATAR: UserAvatarPrefs = { avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null };

export async function getUserAvatar(whopUserId: string): Promise<UserAvatarPrefs> {
  const [row] = await db
    .select({
      avatarType: users.avatarType,
      avatarStyle: users.avatarStyle,
      avatarSeed: users.avatarSeed,
      // Only a hash of the stored image, never the image itself: every
      // page gets a short cacheable URL (/api/user/avatar/image) instead of
      // a data URI of up to ~500KB inlined into each render.
      avatarImageHash: sql<string | null>`md5(${users.avatarImageUrl})`,
    })
    .from(users)
    .where(eq(users.whopUserId, whopUserId))
    .limit(1);

  if (!row) return NO_AVATAR;
  return {
    avatarType: row.avatarType === "upload" || row.avatarType === "dicebear" ? row.avatarType : null,
    avatarStyle: isAvatarStyleId(row.avatarStyle) ? row.avatarStyle : null,
    avatarSeed: row.avatarSeed,
    avatarImageUrl: row.avatarImageHash ? `/api/user/avatar/image?v=${row.avatarImageHash}` : null,
  };
}

/** The uploaded picture's bytes, for /api/user/avatar/image. Null when
 * there's no upload, or when what's stored isn't an allowed raster image
 * (an SVG saved before uploads were restricted is never served). */
export async function getUploadedAvatarImage(whopUserId: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  const [row] = await db.select({ avatarImageUrl: users.avatarImageUrl }).from(users).where(eq(users.whopUserId, whopUserId)).limit(1);
  const match = row?.avatarImageUrl?.match(UPLOAD_IMAGE_PATTERN);
  if (!match) return null;
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function setDicebearAvatar(whopUserId: string, style: AvatarStyleId, seed: string): Promise<void> {
  await db
    .update(users)
    .set({ avatarType: "dicebear", avatarStyle: style, avatarSeed: seed, avatarImageUrl: null, updatedAt: new Date() })
    .where(eq(users.whopUserId, whopUserId));
}

/** dataUri is a resized/compressed image already validated client-side — see the /api/user/avatar route for the actual size cap. */
export async function setUploadedAvatar(whopUserId: string, dataUri: string): Promise<void> {
  await db
    .update(users)
    .set({ avatarType: "upload", avatarImageUrl: dataUri, avatarStyle: null, avatarSeed: null, updatedAt: new Date() })
    .where(eq(users.whopUserId, whopUserId));
}

export async function clearUserAvatar(whopUserId: string): Promise<void> {
  await db
    .update(users)
    .set({ avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null, updatedAt: new Date() })
    .where(eq(users.whopUserId, whopUserId));
}
