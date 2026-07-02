import WhopSDK from "@whop/sdk";

/**
 * Whop OAuth (src/lib/whop.ts) only proves "this person has a Whop account
 * and clicked allow." It says nothing about whether they ever paid for this
 * product. The callback route used to set subscriptionStatus: "active"
 * unconditionally on every successful login — anyone with a Whop account got
 * full dashboard access forever, whether they bought a membership or not.
 *
 * This module is the actual paywall. It calls Whop's Memberships API with
 * our company-scoped API key (never the buyer's OAuth token — memberships
 * are queried company-side, not user-side) and checks whether the logged-in
 * whopUserId holds a membership in a payable state for this company/product.
 */

const WHOP_API_KEY = process.env.WHOP_API_KEY!;
const WHOP_COMPANY_ID = process.env.WHOP_COMPANY_ID!;
// Optional: comma-separated product IDs. If unset, ANY active/trialing
// membership under the company counts as access — fine for a single-SKU
// app, but set this once you sell more than one product/plan under the
// same Whop company so a buyer of Product A can't access Product B.
const WHOP_ACCESS_PRODUCT_IDS = (process.env.WHOP_ACCESS_PRODUCT_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Statuses that constitute "the buyer should have access right now."
// past_due is deliberately excluded — Whop is retrying the charge, and
// keeping access alive on a failed payment invites free-riding on a card
// that never clears. If you want a dunning grace period, add "past_due"
// here and enforce the cutoff via canceled_at/expires-at logic instead.
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

let _client: WhopSDK | null = null;
function client(): WhopSDK {
  if (!_client) {
    if (!WHOP_API_KEY) {
      throw new Error("WHOP_API_KEY is not set — cannot verify memberships");
    }
    _client = new WhopSDK({ apiKey: WHOP_API_KEY });
  }
  return _client;
}

export type MembershipCheckResult = {
  hasAccess: boolean;
  status: string; // the most-relevant membership status found, or "none"
  membershipId?: string;
};

/**
 * Checks whether whopUserId currently holds a payable membership for this
 * company (and, if configured, one of WHOP_ACCESS_PRODUCT_IDS).
 *
 * This hits the Whop API directly — no caching here. Callers (middleware,
 * the OAuth callback) are responsible for deciding how often to re-check
 * and for caching the result (session TTL) so we're not calling Whop on
 * every single request.
 */
export async function checkActiveMembership(
  whopUserId: string
): Promise<MembershipCheckResult> {
  if (!WHOP_COMPANY_ID) {
    throw new Error("WHOP_COMPANY_ID is not set — cannot verify memberships");
  }

  const page = await client().memberships.list({
    company_id: WHOP_COMPANY_ID,
    user_ids: [whopUserId],
    statuses: ["active", "trialing", "past_due", "canceling"],
    product_ids: WHOP_ACCESS_PRODUCT_IDS.length
      ? WHOP_ACCESS_PRODUCT_IDS
      : undefined,
    first: 10,
  });

  let best: { status: string; id: string } | null = null;
  for await (const membership of page) {
    // "canceling" = cancel_at_period_end, still has access until the
    // period actually ends. Treat it as active for gating purposes.
    const effectiveStatus =
      membership.status === "canceling" ? "active" : membership.status;
    if (ACTIVE_STATUSES.has(effectiveStatus)) {
      best = { status: membership.status, id: membership.id };
      break;
    }
    if (!best) {
      best = { status: membership.status, id: membership.id };
    }
  }

  if (!best) {
    return { hasAccess: false, status: "none" };
  }

  const effectiveStatus = best.status === "canceling" ? "active" : best.status;
  return {
    hasAccess: ACTIVE_STATUSES.has(effectiveStatus),
    status: best.status,
    membershipId: best.id,
  };
}
