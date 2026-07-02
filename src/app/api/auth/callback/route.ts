import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { getSession } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  const codeVerifier = cookieStore.get("code_verifier")?.value;

  if (!code || !state || state !== storedState || !codeVerifier) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  const tokens = await exchangeCode(code, codeVerifier);
  const whopUser = await getWhopUser(tokens.access_token);

  // Actually check whether this person holds a payable membership for this
  // company/product — OAuth login alone only proves they have a Whop
  // account, not that they ever bought anything. See src/lib/whop-access.ts.
  const membership = await checkActiveMembership(whopUser.id);

  // upsert user into our DB with the real status, not an assumed one
  await db
    .insert(users)
    .values({
      whopUserId: whopUser.id,
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
  session.whopUserId = whopUser.id;
  session.email = whopUser.email;
  session.subscriptionStatus = membership.status;
  session.subscriptionVerifiedAt = Date.now();
  await session.save();

  cookieStore.delete("oauth_state");
  cookieStore.delete("code_verifier");

  if (!membership.hasAccess) {
    redirect("/?membership=required");
  }

  redirect("/dashboard");
}