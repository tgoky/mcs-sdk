"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";

/**
 * Renders Whop's actual checkout inside this app instead of bouncing the
 * visitor to an external whop.com page. Completing it is what creates the
 * Whop account (if the buyer doesn't have one yet) and the membership in
 * one step — see src/lib/whop-checkout.ts for the session/metadata side.
 *
 * Payment alone doesn't give this app a session (the embed never hands us
 * OAuth tokens, only payment/receipt info) — so on completion we hand off
 * to the existing, already-audited OAuth login flow to actually establish
 * one. That route re-checks the membership against Whop's live API and
 * sets the session cookie exactly like a normal login would.
 */
export function WhopCheckoutWidget({
  sessionId,
  prefillEmail,
}: {
  sessionId: string;
  prefillEmail?: string;
}) {
  return (
    <WhopCheckoutEmbed
      sessionId={sessionId}
      theme="dark"
      prefill={prefillEmail ? { email: prefillEmail } : undefined}
      returnUrl={
        typeof window !== "undefined"
          ? `${window.location.origin}/checkout/complete`
          : undefined
      }
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
          Loading checkout…
        </div>
      }
      onComplete={() => {
        // skipRedirect is implied by onComplete, so nothing navigates us
        // away on its own — send the buyer into the OAuth flow to
        // establish the app session now that the membership exists.
        window.location.href = "/api/auth/login?redirect_to=/home";
      }}
      onPaymentError={(error) => {
        console.error("[checkout] Payment error:", error.message, error.code);
      }}
    />
  );
}
