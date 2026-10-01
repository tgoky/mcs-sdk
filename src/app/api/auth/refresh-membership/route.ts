import { getSession } from "@/lib/session";
import { checkActiveMembership } from "@/lib/whop-access";
import { buildOAuthRedirectHtml } from "@/lib/oauth-redirect-html";
import { rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

/**
 * /checkout sends a signed-in visitor here when Whop says their membership
 * is active but their session still says it isn't (they renewed on
 * whop.com, or Whop finished activating after they signed in). A page
 * can't write the session cookie, so this route re-checks with Whop
 * itself (never trusting the caller), saves the result, and moves on.
 */
export async function GET() {
  const session = await getSession();
  const html = (destination: string) =>
    new Response(buildOAuthRedirectHtml(destination, "Checking your membership..."), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  if (!session.whopUserId) return html("/api/auth/login");

  const limited = await rateLimitResponse(RATE_LIMITS.membershipRefresh, session.whopUserId);
  if (limited) return limited;

  try {
    if (session.subscriptionStatus !== "admin") {
      const membership = await checkActiveMembership(session.whopUserId);
      session.subscriptionStatus = membership.status;
    }
    session.subscriptionVerifiedAt = Date.now();
    await session.save();
  } catch (err) {
    console.error("[refresh-membership] membership check failed:", err);
  }

  // checked=1 stops /checkout from sending them straight back here.
  return html(ACTIVE_STATUSES.has(session.subscriptionStatus) ? "/home" : "/checkout?checked=1");
}
