import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { sessionOptions } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

export const runtime = "nodejs";

const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000;
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/crons")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  if (!session.whopUserId) {
    const isRsc = request.headers.get("rsc") === "1" || searchParams.has("_rsc");
    const isPrefetch =
      request.headers.get("next-router-prefetch") ||
      request.headers.get("purpose") === "prefetch";
    const isApi = pathname.startsWith("/api/");

    // Shield background fetches/RSC requests from cross-origin redirects
    if (isRsc || isPrefetch || isApi) {
      return new NextResponse(null, { status: 401 });
    }

    const loginUrl = new URL("/api/auth/login", request.url);
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

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
    "/api/crons/:path*",
  ],
};