import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
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

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, {
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
  let sessionWasUpdated = false;

  if (isStale && session.subscriptionStatus !== "admin") {
    try {
      const membership = await checkActiveMembership(session.whopUserId);
      session.subscriptionStatus = membership.status;
      session.subscriptionVerifiedAt = Date.now();
      await session.save(); 
      sessionWasUpdated = true; // Flag that we need to send the updated header to the browser
    } catch (err) {
      console.error("[middleware] membership revalidation failed:", err);
    }
  }

  // 3. Kickout authenticated users who do not possess a valid paywall status
  if (!ACTIVE_STATUSES.has(session.subscriptionStatus)) {
    const redirectResponse = NextResponse.redirect(
      new URL("/?membership=required", request.url)
    );
    
    // Explicitly pass the session cookie to the redirect response with full security parameters
    const currentSessionCookie = cookieStore.get("mudd_session");
    if (currentSessionCookie) {
      redirectResponse.cookies.set({
        name: "mudd_session",
        value: currentSessionCookie.value,
        ...COOKIE_OPTIONS,
      });
    }
    return redirectResponse;
  }

  // 4. Standard completion continuation path
  const response = NextResponse.next();

  // Only append a Set-Cookie header if iron-session actually modified the internal data tokens
  if (sessionWasUpdated) {
    const updatedSessionCookie = cookieStore.get("mudd_session");
    if (updatedSessionCookie) {
      response.cookies.set({
        name: "mudd_session",
        value: updatedSessionCookie.value,
        ...COOKIE_OPTIONS,
      });
    }
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