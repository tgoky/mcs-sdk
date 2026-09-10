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
import { eq } from "drizzle-orm";
import { isAvatarStyleId, type AvatarStyleId } from "@/lib/avatar";

export interface UserAvatarPrefs {
  avatarType: "upload" | "dicebear" | null;
  avatarStyle: AvatarStyleId | null;
  avatarSeed: string | null;
  avatarImageUrl: string | null;
}

const NO_AVATAR: UserAvatarPrefs = { avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null };

export async function getUserAvatar(whopUserId: string): Promise<UserAvatarPrefs> {
  const [row] = await db
    .select({
      avatarType: users.avatarType,
      avatarStyle: users.avatarStyle,
      avatarSeed: users.avatarSeed,
      avatarImageUrl: users.avatarImageUrl,
    })
    .from(users)
    .where(eq(users.whopUserId, whopUserId))
    .limit(1);

  if (!row) return NO_AVATAR;
  return {
    avatarType: row.avatarType === "upload" || row.avatarType === "dicebear" ? row.avatarType : null,
    avatarStyle: isAvatarStyleId(row.avatarStyle) ? row.avatarStyle : null,
    avatarSeed: row.avatarSeed,
    avatarImageUrl: row.avatarImageUrl,
  };
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
