import { getSession } from "@/lib/session";
import { LandingWrapper } from "@/components/landing-wrapper";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

interface PageProps {
  searchParams: Promise<{ membership?: string }>;
}

export default async function LandingIndexPage({ searchParams }: PageProps) {
  const session = await getSession();
  const { membership } = await searchParams;
  const hasAccess = ACTIVE_STATUSES.has(session.subscriptionStatus ?? "");
  const membershipRequired = membership === "required";

  // "Enter Dashboard" (hero) is the sign-in-flavored CTA: an existing
  // member with a session that's just lapsed goes straight to checkout, but
  // someone with no session at all goes through Whop's own OAuth screen
  // first — for a returning buyer on a new browser/device who doesn't want
  // to pay again, that's the path that recognizes them and can drop them
  // straight into /home if their membership is still active.
  const destinationHref =
    session.whopUserId && hasAccess
      ? "/home"
      : session.whopUserId
      ? "/checkout"
      : "/api/auth/login";

  // "Get Started" (top nav) is the signup-flavored CTA: it never routes
  // through Whop OAuth at all, since /checkout creates the Whop account
  // automatically for someone who doesn't have one yet (see
  // src/lib/whop-checkout.ts). An already-active member just goes straight
  // in — no reason to show them checkout again.
  const getStartedHref = session.whopUserId && hasAccess ? "/home" : "/checkout";

  return (
    <LandingWrapper
      destinationHref={destinationHref}
      getStartedHref={getStartedHref}
      membershipRequired={membershipRequired}
      hasWhopUser={Boolean(session.whopUserId)}
    />
  );
}