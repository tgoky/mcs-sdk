import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

export const runtime = "nodejs";

const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

const isProd = process.env.NODE_ENV === "production";

// 🌟 CHIPS Partitioned Cookies for Whop iFrame Support
const COOKIE_OPTIONS = {
  secure: true,              // Always true for SameSite=None
  httpOnly: true,
  path: "/",
  sameSite: "none" as const, // Always "none" for iframe
  partitioned: true,          // CHIPS partitioned cookie
  maxAge: 60 * 60 * 24 * 14,
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Explicitly allow public authentication endpoints, webhooks, and cron workers
  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/crons")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: "mudd_session",
    cookieOptions: COOKIE_OPTIONS,
  });

  // 2. Kickout unauthenticated users directly to login flow
  if (!session.whopUserId) {
    // 🌟 THE FIX: Block background router pre-fetches from triggering OAuth login redirects
    if (
      request.headers.get("next-router-prefetch") ||
      request.headers.get("purpose") === "prefetch"
    ) {
      return new NextResponse(null, { status: 401 });
    }

    const loginUrl = new URL("/api/auth/login", request.url);
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Handle membership revalidation updates if cached state is stale
  const verifiedAt = session.subscriptionVerifiedAt ?? 0;
  const isStale = Date.now() - verifiedAt > MEMBERSHIP_REVALIDATE_MS;

  if (isStale && session.subscriptionStatus !== "admin") {
    try {
      const membership = await checkActiveMembership(session.whopUserId);
      session.subscriptionStatus = membership.status;
      session.subscriptionVerifiedAt = Date.now();
      await session.save(); 
    } catch (err) {
      console.error("[middleware] membership revalidation failed:", err);
    }
  }

  // 4. Kickout authenticated users who do not possess a valid paywall status
  if (!ACTIVE_STATUSES.has(session.subscriptionStatus)) {
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
    "/api/webhooks/:path*", 
    "/api/crons/:path*"
  ],
};