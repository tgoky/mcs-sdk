import { getSession } from "@/lib/session";
import { revokeToken } from "@/lib/whop";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: Request) {
  // "Sign in with that account" on /checkout: sign out here, then straight
  // into a Whop sign-in that asks which account to use.
  const form = await request.formData().catch(() => null);
  const switchAccount = form?.get("switch_account") === "1";
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
  if (switchAccount) {
    // 303 so the browser follows with a GET; the login route has no POST.
    return NextResponse.redirect(new URL("/api/auth/login?switch_account=1", request.url), 303);
  }
  redirect("/");
}