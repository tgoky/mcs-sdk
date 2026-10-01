import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createSignupCheckoutSession } from "@/lib/whop-checkout";
import { checkActiveMembership } from "@/lib/whop-access";
import { WhopCheckoutWidget } from "@/components/whop-checkout-widget";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

interface PageProps {
  // pending=1: just paid, but Whop hadn't activated the membership yet.
  // checked=1: /api/auth/refresh-membership already asked Whop; don't loop.
  searchParams: Promise<{ pending?: string; checked?: string }>;
}

// Replaces the old "bounce to process.env.WHOP_COMPANY_CHECKOUT_URL"
// dead link (that env var was never set, so it fell through to
// https://whop.com — the actual bug behind "no way to sign up"). This
// keeps the buyer on-domain for the whole flow: no Whop account needed
// ahead of time, since completing checkout is what creates one.
export default async function CheckoutPage({ searchParams }: PageProps) {
  const session = await getSession();
  const { pending, checked } = await searchParams;

  // A member never needs this page. The session's status can be out of
  // date (renewed on whop.com, or activated after they signed in), so ask
  // Whop before showing a payment form to someone signed in.
  if (session.whopUserId) {
    if (ACTIVE_STATUSES.has(session.subscriptionStatus ?? "")) redirect("/home");
    if (checked !== "1") {
      const live = await checkActiveMembership(session.whopUserId).catch((err) => {
        console.error("[checkout] live membership check failed:", err);
        return null;
      });
      // The session cookie can only be updated from a route handler.
      if (live?.hasAccess) redirect("/api/auth/refresh-membership");
    }
  }

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
    <div className="font-sans min-h-screen w-full bg-black text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Get started</h1>
        <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
          {session.whopUserId
            ? "Your account needs an active subscription to continue."
            : "Complete checkout below. This creates your account too."}
        </p>

        {pending === "1" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 mb-8">
            <div className="font-semibold text-amber-400 mb-1">Your payment may still be processing</div>
            <p className="text-zinc-300 text-xs leading-normal">
              Whop hasn&apos;t activated your membership yet. Don&apos;t pay again. Wait a minute, then reload this page.
            </p>
          </div>
        )}

        {session.whopUserId && (
          <div className="text-sm text-zinc-400 -mt-4 mb-8 leading-relaxed">
            Signed in as <span className="text-white">{session.email || "your Whop account"}</span>. Paid with a different email?{" "}
            <form action="/api/auth/logout" method="POST" className="inline">
              <input type="hidden" name="switch_account" value="1" />
              <button
                type="submit"
                className="text-white underline underline-offset-2 hover:text-zinc-200 bg-transparent border-none p-0 cursor-pointer"
              >
                Sign in with that account
              </button>
            </form>
            . If Whop signs you straight back in, sign out at whop.com first.
          </div>
        )}

        {!session.whopUserId && (
          <p className="text-sm text-zinc-400 -mt-4 mb-8">
            Already have an account?{" "}
            {/* A plain link: /api/auth/login is a route handler, not a page. */}
            <a href="/api/auth/login" className="text-white underline underline-offset-2 hover:text-zinc-200">
              Sign in
            </a>
          </p>
        )}

        {sessionId ? (
          <WhopCheckoutWidget sessionId={sessionId} prefillEmail={session.email} />
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold text-red-400 mb-1">
              Checkout isn&apos;t configured yet
            </div>
            <p className="text-zinc-300 text-xs font-mono leading-normal">
              {configError ?? "Unknown error creating the checkout session."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}