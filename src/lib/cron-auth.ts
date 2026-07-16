import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";

/**
 * Shared gate for every /api/crons/* route.
 *
 * These endpoints operate across every tenant (leak-map-audit with no
 * engagement_id sweeps the whole `engagements` table, alert-monitor and
 * credential-health run globally, stale-run-reaper touches every stuck
 * skillRun). They are meant to be triggered by (a) the scheduler via
 * `Authorization: Bearer ${CRON_SECRET}`, or (b) an admin manually
 * re-triggering from a browser session during debugging.
 *
 * The previous per-route check used `!!session.whopUserId` — "is *someone*
 * logged in" — which let any paying customer's authenticated session
 * dispatch cross-tenant, budget-spending jobs for every other tenant.
 * This replaces that with an actual admin-email check (the same
 * ADMIN_WHOP_EMAILS allowlist already used for the dashboard paywall
 * bypass in src/lib/whop-access.ts), so a regular customer session no
 * longer satisfies the gate.
 *
 * Non-production environments stay ungated (matches the previous
 * `process.env.NODE_ENV === "production"` behavior) so local dev and
 * preview deploys don't need CRON_SECRET or an admin login to exercise
 * these routes.
 */
export async function requireCronOrAdmin(
  request: Request
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true };
  }

  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true };
  }

  const session = await getSession();
  if (session.whopUserId && isAdminEmail(session.email)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: new Response("Unauthorized", { status: 401 }),
  };
}
