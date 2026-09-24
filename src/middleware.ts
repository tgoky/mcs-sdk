import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

export const runtime = "nodejs";

const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

// API routes machines call, each checking its own signature, secret or
// token; everything else under /api needs a signed-in, paid member.
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/webhooks", "/api/crons", "/api/inngest", "/api/slack/interactions", "/api/recall"];

const COOKIE_OPTIONS = {
  secure: true,
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 14,
};

/** users.session_version, or null when it can't be read (the check then
 * waits for the next pass rather than signing everyone out). */
async function currentSessionVersion(whopUserId: string): Promise<number | null> {
  try {
    const { db } = await import("@/lib/db");
    const { users } = await import("@/models/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select({ v: users.sessionVersion }).from(users).where(eq(users.whopUserId, whopUserId)).limit(1);
    return row ? row.v : null;
  } catch (err) {
    console.error("[middleware] session version check failed:", err);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Explicitly allow public authentication endpoints, webhooks, and cron workers
  if (pathname === "/" || PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  // The API answers in JSON rather than redirecting to sign-in or checkout.
  const isApi = pathname.startsWith("/api/");

  const response = NextResponse.next();

  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: "mudd_session",
    cookieOptions: COOKIE_OPTIONS,
  });

  // 2. Kickout unauthenticated users directly to login flow
  if (!session.whopUserId) {
    if (isApi) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    const loginUrl = new URL("/api/auth/login", request.url);
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Every few minutes: is this sign-in still current (not ended by a
  // sign-out elsewhere), and is the membership still active?
  const verifiedAt = session.subscriptionVerifiedAt ?? 0;
  const isStale = Date.now() - verifiedAt > MEMBERSHIP_REVALIDATE_MS;

  if (isStale) {
    const current = await currentSessionVersion(session.whopUserId);
    if (current !== null && (session.sessionVersion ?? 0) < current) {
      session.destroy();
      if (isApi) {
        const ended = NextResponse.json({ error: "You were signed out. Sign in again." }, { status: 401 });
        const cookie = response.headers.get("Set-Cookie");
        if (cookie) ended.headers.set("Set-Cookie", cookie);
        return ended;
      }
      const loginUrl = new URL("/api/auth/login", request.url);
      loginUrl.searchParams.set("redirect_to", pathname);
      const redirect = NextResponse.redirect(loginUrl);
      const cookie = response.headers.get("Set-Cookie");
      if (cookie) redirect.headers.set("Set-Cookie", cookie);
      return redirect;
    }
    try {
      if (session.subscriptionStatus !== "admin") {
        const membership = await checkActiveMembership(session.whopUserId);
        session.subscriptionStatus = membership.status;
      }
      session.subscriptionVerifiedAt = Date.now();
      await session.save();
    } catch (err) {
      console.error("[middleware] membership revalidation failed:", err);
    }
  }

  // 4. Kickout authenticated users who do not possess a valid paywall status
  if (!ACTIVE_STATUSES.has(session.subscriptionStatus)) {
    if (isApi) {
      const denied = NextResponse.json({ error: "Your membership isn't active. Renew it to keep using the app." }, { status: 402 });
      const cookie = response.headers.get("Set-Cookie");
      if (cookie) denied.headers.set("Set-Cookie", cookie);
      return denied;
    }
    const redirectResponse = NextResponse.redirect(
      new URL("/?membership=required", request.url)
    );
    
    const setCookieHeader = response.headers.get("Set-Cookie");
    if (setCookieHeader) {
      redirectResponse.headers.set("Set-Cookie", setCookieHeader);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    "/home",
    "/home/:path*",
    "/dashboard", 
    "/dashboard/:path*", 
    "/api/:path*"
  ],
};