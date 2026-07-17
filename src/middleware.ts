import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

export const runtime = "nodejs";

const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

// Centralize your cookie configuration options to guarantee alignment
const COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 14, // 14 days
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Explicitly allow public authentication endpoints, webhooks, and cron workers to pass through
  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/crons")
  ) {
    return NextResponse.next();
  }

  // 🌟 THE FIX: Initialize the mutable response upfront so iron-session can bind headers directly
  const response = NextResponse.next();

  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: "mudd_session",
    cookieOptions: COOKIE_OPTIONS,
  });

  // 1. Kickout unauthenticated users directly to login flow
  if (!session.whopUserId) {
    const loginUrl = new URL("/api/auth/login", request.url);
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Handle membership revalidation updates if cached state is stale
  const verifiedAt = session.subscriptionVerifiedAt ?? 0;
  const isStale = Date.now() - verifiedAt > MEMBERSHIP_REVALIDATE_MS;

  if (isStale && session.subscriptionStatus !== "admin") {
    try {
      const membership = await checkActiveMembership(session.whopUserId);
      session.subscriptionStatus = membership.status;
      session.subscriptionVerifiedAt = Date.now();
      // 🌟 THE FIX: Natively encrypts and appends the fresh cookie directly into our response object
      await session.save(); 
    } catch (err) {
      console.error("[middleware] membership revalidation failed:", err);
    }
  }

  // 3. Kickout authenticated users who do not possess a valid paywall status
  if (!ACTIVE_STATUSES.has(session.subscriptionStatus)) {
    const redirectResponse = NextResponse.redirect(
      new URL("/?membership=required", request.url)
    );
    
    // 🌟 THE FIX: Safely copy the newly minted encryption header over to the redirect response frame
    const setCookieHeader = response.headers.get("Set-Cookie");
    if (setCookieHeader) {
      redirectResponse.headers.set("Set-Cookie", setCookieHeader);
    }
    return redirectResponse;
  }

  // 4. Standard completion continuation path (contains automatically stamped cookies from session.save)
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