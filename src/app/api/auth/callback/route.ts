import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { getSession } from "@/lib/session";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  const codeVerifier = cookieStore.get("code_verifier")?.value;

  // Clear the short-lived PKCE cookies as soon as we've read them, on every
  // exit path below, so a failed/duplicate callback hit can't replay them.
  const clearPkceCookies = () => {
    cookieStore.delete("oauth_state");
    cookieStore.delete("oauth_nonce");
    cookieStore.delete("code_verifier");
  };

  if (error) {
    clearPkceCookies();
    return new Response(`Whop OAuth error: ${error}`, { status: 400 });
  }

  if (!code || !state || state !== storedState || !codeVerifier) {
    clearPkceCookies();
    return new Response("Invalid OAuth state", { status: 400 });
  }

  const tokens = await exchangeCode(code, codeVerifier);
  const whopUser = await getWhopUser(tokens.access_token);
  // Whop's userinfo endpoint returns the stable user id as `sub`
  // (e.g. "user_xxxxx"), not `id`.
  const whopUserId = whopUser.sub;

  // Admin/dev bypass: if this Whop account's email is on the allowlist,
  // skip the Whop Memberships lookup and grant access without requiring a
  // paid membership. See src/lib/whop-access.ts / ADMIN_WHOP_EMAILS env var.
  // Real paying customers always go through checkActiveMembership below —
  // this only ever short-circuits for explicitly allowlisted emails.
  const admin = isAdminEmail(whopUser.email);

  // Actually check whether this person holds a payable membership for this
  // company/product — OAuth login alone only proves they have a Whop
  // account, not that they ever bought anything. See src/lib/whop-access.ts.
  const membership = admin
    ? { hasAccess: true, status: "admin" as const }
    : await checkActiveMembership(whopUserId);

  // upsert user into our DB with the real status, not an assumed one
  await db
    .insert(users)
    .values({
      whopUserId,
      email: whopUser.email,
      subscriptionStatus: membership.status,
    })
    .onConflictDoUpdate({
      target: users.whopUserId,
      set: {
        email: whopUser.email,
        subscriptionStatus: membership.status,
        updatedAt: new Date(),
      },
    });

  const session = await getSession();
  session.whopUserId = whopUserId;
  session.email = whopUser.email ?? "";
  session.subscriptionStatus = membership.status;
  session.subscriptionVerifiedAt = Date.now();
  session.refreshToken = tokens.refresh_token;
  await session.save();

  clearPkceCookies();

  if (!membership.hasAccess) {
    redirect("/?membership=required");
  }

  redirect("/dashboard");
}