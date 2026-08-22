
import WhopSDK from "@whop/sdk";

/**
 * Creates the checkout session behind /checkout (src/app/checkout/page.tsx).
 *
 * This is the "custom fields → Whop's backend" mechanism: a Checkout
 * Configuration is created server-side with our own metadata attached, and
 * the resulting session id is handed to <WhopCheckoutEmbed sessionId=... />
 * instead of a bare planId. Whop's docs confirm the metadata rides along
 * onto whatever payment/membership the checkout produces, and it also shows
 * up on the membership.activated webhook payload (src/app/api/webhooks/whop)
 * — so this is the one place to extend if there's ever a real "custom
 * field" to capture at signup (team size, referral source, etc.): add keys
 * to `metadata` below, or add a `custom_fields` array to the plan itself if
 * it should show as an actual input on the checkout form.
 *
 * A brand-new Whop account is created automatically by Whop when someone
 * without one completes this checkout — there's no separate "create
 * account" call. This function only prepares the checkout; the account (and
 * the membership) come into existence when the buyer pays.
 */

const WHOP_API_KEY = process.env.WHOP_API_KEY!;
const WHOP_PLAN_ID = process.env.WHOP_PLAN_ID;

let _client: WhopSDK | null = null;
function client(): WhopSDK {
  if (!_client) {
    if (!WHOP_API_KEY) {
      throw new Error("WHOP_API_KEY is not set — cannot create a checkout session");
    }
    _client = new WhopSDK({ apiKey: WHOP_API_KEY });
  }
  return _client;
}

export type SignupCheckoutSession = {
  sessionId: string;
  purchaseUrl: string;
};

/**
 * whopUserId is passed when a session already exists but has no active
 * membership (the returning-buyer case) — it's attached as metadata so the
 * resulting membership/payment can be traced back to the visit that started
 * it. It's intentionally NOT used to prefill or restrict the checkout's own
 * email field: the buyer types whatever email they want to pay with, same
 * as any other checkout.
 */
export async function createSignupCheckoutSession(
  whopUserId?: string
): Promise<SignupCheckoutSession> {
  if (!WHOP_PLAN_ID) {
    throw new Error(
      "WHOP_PLAN_ID is not set. Find it at Whop Dashboard → Checkout links → " +
        "⋮ on your pricing option → Details → copy the plan_... id."
    );
  }

  const config = await client().checkoutConfigurations.create({
    plan_id: WHOP_PLAN_ID,
    metadata: {
      signup_source: "mcs-sdk-app",
      ...(whopUserId ? { existing_whop_user_id: whopUserId } : {}),
    },
  });

  return { sessionId: config.id, purchaseUrl: config.purchase_url };
}
