import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

export const runtime = "nodejs";

const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

const isProd = process.env.NODE_ENV === "production";

// No iframe embedding anywhere in this app (verified: no postMessage, no
// Whop embed SDK, no frame-ancestors/X-Frame-Options config) — this is a
// plain top-level OAuth redirect flow, so CHIPS partitioning and
// SameSite=None were solving a problem this app doesn't have. Lax is sent
// on the top-level GET redirect back from Whop, and on every same-origin
// request inside the dashboard, which is everything this flow needs.
const COOKIE_OPTIONS = {
  secure: true,
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
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
    // 🌟 THE FIX: Any client-side transition (Link click, router.push, AND
    // background prefetch) fetches the RSC payload directly instead of doing
    // a full document navigation. These requests never set
    // `sec-fetch-dest: document`, and carry the RSC/Next-Router-* headers.
    // If we redirect *these* to a cross-origin URL (Whop), the browser has
    // to preflight the follow-on hop, and the fetch spec forbids a redirect
    // response to a preflight request — that's the exact
    // "Redirect is not allowed for a preflight request" CORS crash.
    // A same-origin redirect to /api/auth/login is fine on its own, but that
    // route immediately 307s to Whop, so it inherits the same problem.
    // Only real top-level document navigations are safe to redirect
    // cross-origin (that's why the landing-page <a> button works) — so 401
    // everything else and let the client fall back to a real navigation.
    const isDocumentRequest = request.headers.get("sec-fetch-dest") === "document";
    const isRscRequest =
      request.headers.get("RSC") === "1" ||
      request.headers.get("next-router-state-tree") !== null ||
      request.headers.get("next-router-prefetch") !== null ||
      request.headers.get("purpose") === "prefetch";

    if (!isDocumentRequest || isRscRequest) {
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