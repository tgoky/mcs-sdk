import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCode, getWhopUser } from "@/lib/whop";
import { getSession } from "@/lib/session";
import { checkActiveMembership, isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { users } from "@/models/schema";

export async function GET(request: Request) {
  const cookieStore = await cookies();

  // Short-lived cookie cleanup utility
  const clearPkceCookies = () => {
    cookieStore.delete("oauth_state");
    cookieStore.delete("oauth_nonce");
    cookieStore.delete("code_verifier");
  };

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const storedState = cookieStore.get("oauth_state")?.value;
    const codeVerifier = cookieStore.get("code_verifier")?.value;

    if (error) {
      clearPkceCookies();
      return new Response(`Whop OAuth error: ${error}`, { status: 400 });
    }

    if (!code || !state || state !== storedState || !codeVerifier) {
      clearPkceCookies();
      return new Response(
        `Invalid OAuth state. State matches: ${state === storedState}. Verifier found: ${!!codeVerifier}`, 
        { status: 400 }
      );
    }

    // ── 1. Exchange OAuth code for permanent tokens ──
    const tokens = await exchangeCode(code, codeVerifier);
    
    // ── 2. Fetch authenticated profile identifiers ──
    const whopUser = await getWhopUser(tokens.access_token);
    const whopUserId = whopUser.sub;

    // ── 3. Evaluate Whop paywall validation scopes ──
    const admin = isAdminEmail(whopUser.email);
    const membership = admin
      ? { hasAccess: true, status: "admin" as const }
      : await checkActiveMembership(whopUserId);

    // ── 4. Persist or update user configuration row ──
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

    // ── 5. Inject encrypted iron-session parameters ──
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
  } catch (err: any) {
    clearPkceCookies();

    // CRITICAL Next.js Guard: redirect() signals navigation by throwing an internal 
    // error template. If caught and suppressed, navigation links break completely.
    if (err instanceof Error && (err.message === "NEXT_REDIRECT" || (err as any).digest?.startsWith("NEXT_REDIRECT"))) {
      throw err;
    }

    console.error("[Fatal Auth Callback Exception]:", err);
    
    // Outputs the precise system error directly to your browser window
    return new Response(
      `Local Server Error (500):\nReason: ${err.message || String(err)}\n\nCheck your terminal and .env.local file properties.`, 
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}