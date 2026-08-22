import { getSession } from "@/lib/session";
import { createSignupCheckoutSession } from "@/lib/whop-checkout";
import { WhopCheckoutWidget } from "@/components/whop-checkout-widget";

// Replaces the old "bounce to process.env.WHOP_COMPANY_CHECKOUT_URL"
// dead link (that env var was never set, so it fell through to
// https://whop.com — the actual bug behind "no way to sign up"). This
// keeps the buyer on-domain for the whole flow: no Whop account needed
// ahead of time, since completing checkout is what creates one.
export default async function CheckoutPage() {
  const session = await getSession();

  let sessionId: string | null = null;
  let configError: string | null = null;

  try {
    const checkout = await createSignupCheckoutSession(session.whopUserId);
    sessionId = checkout.sessionId;
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
    console.error("[checkout] Failed to create checkout session:", configError);
  }

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Get started</h1>
        <p className="text-sm text-zinc-400 mb-8">
          {session.whopUserId
            ? "Your account needs an active subscription to continue."
            : "Complete checkout below — this creates your account too."}
        </p>

        {sessionId ? (
          <WhopCheckoutWidget sessionId={sessionId} prefillEmail={session.email} />
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold text-red-400 mb-1">
              Checkout isn&apos;t configured yet
            </div>
            <p className="text-zinc-300 text-xs leading-normal">
              {configError ?? "Unknown error creating the checkout session."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
