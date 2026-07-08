import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";

// Next.js middleware defaults to the edge runtime, which can't do the
// server-side Whop API call below. Node.js middleware has been stable
// since Next 15.2 — this is what makes `checkActiveMembership` (a plain
// fetch through @whop/sdk) safe to call here instead of needing a
// separate route handler just to do the revalidation hop.
export const runtime = "nodejs";

// How long a verified subscriptionStatus is trusted before middleware
// re-checks it against Whop. Short enough that a cancellation or failed
// payment gets caught within one window instead of persisting until the
// next full OAuth login (which could be weeks away); long enough that
// we're not hitting the Whop API on every single request.
const MEMBERSHIP_REVALIDATE_MS = 10 * 60 * 1000; // 10 minutes

// "admin" is stamped by the OAuth callback for allowlisted dev/owner emails
// (see ADMIN_WHOP_EMAILS in src/lib/whop-access.ts) — those accounts never
// go through checkActiveMembership at all, so it must be trusted here too.
const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

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

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: "mudd_session",
  });

  if (!session.whopUserId) {
    const loginUrl = new URL("/api/auth/login", request.url);
    // Preserve where the user was actually trying to go — without this,
    // a forced re-auth from any /dashboard/* sub-page always drops the
    // user back on the dashboard root once login completes, regardless
    // of whether they were headed to /dashboard/engagements or anywhere
    // else. See redirect_to handling in login/route.ts and callback/route.ts.
    loginUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cached status from login or the last revalidation. This is the only
  // gate that used to exist here — a whopUserId cookie by itself proves
  // nothing about payment status, since the OAuth callback used to stamp
  // every login "active" unconditionally regardless of membership state.
  const verifiedAt = session.subscriptionVerifiedAt ?? 0;
  const isStale = Date.now() - verifiedAt > MEMBERSHIP_REVALIDATE_MS;

  // Admins were never granted access via a real Whop membership, so
  // re-checking them against checkActiveMembership would just find "none"
  // and lock them out. Their status is trusted for the life of the
  // session instead of being periodically revalidated.
  if (isStale && session.subscriptionStatus !== "admin") {
    try {
      const membership = await checkActiveMembership(session.whopUserId);
      session.subscriptionStatus = membership.status;
      session.subscriptionVerifiedAt = Date.now();
      await session.save();
    } catch (err) {
      // A Whop API hiccup shouldn't instantly lock out a buyer whose last
      // confirmed status was active — fail open on transient errors and
      // fall through to the cached (now-stale) status below rather than
      // hard-blocking on a network blip.
      console.error("[middleware] membership revalidation failed:", err);
    }
  }

  if (!ACTIVE_STATUSES.has(session.subscriptionStatus)) {
    // NextResponse.redirect() constructs a brand-new response object —
    // any cookie session.save() wrote onto `response` above (the updated
    // subscriptionStatus/subscriptionVerifiedAt) would otherwise be
    // silently discarded. Without copying it across, the browser keeps
    // sending the OLD session cookie, so `isStale` re-evaluates true on
    // every subsequent request, re-triggering checkActiveMembership and
    // this same redirect — an infinite loop that also hammers the Whop
    // API on every hop. response.cookies.getAll() (rather than reading
    // the raw "set-cookie" header) is the reliable way to carry this over:
    // Headers.get("set-cookie") collapses multiple Set-Cookie headers into
    // one comma-joined string in some runtimes, which would corrupt the
    // cookie rather than preserve it.
    const redirectResponse = NextResponse.redirect(
      new URL("/?membership=required", request.url)
    );
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/webhooks/:path*", "/api/crons/:path*"],
};