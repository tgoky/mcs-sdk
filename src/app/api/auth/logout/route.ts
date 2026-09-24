import { getSession } from "@/lib/session";
import { revokeToken } from "@/lib/whop";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

export async function POST() {
  const session = await getSession();
  if (session.refreshToken) {
    await revokeToken(session.refreshToken);
  }
  // Ends every copy of this sign-in, not just this browser's cookie:
  // middleware.ts refuses a session whose version is behind.
  if (session.whopUserId) {
    await db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.whopUserId, session.whopUserId))
      .catch((err) => console.error("[logout] couldn't end other sessions:", err));
  }
  session.destroy();
  redirect("/");
}