import { getSession } from "@/lib/session";
import { LandingWrapper } from "@/components/landing-wrapper";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

export default async function LandingIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>;
}) {
  const session = await getSession();
  const { membership } = await searchParams;
  const hasAccess = ACTIVE_STATUSES.has(session.subscriptionStatus ?? "");
  const membershipRequired = membership === "required";

  // Determine destination URL based on session state
  const destinationHref = session.whopUserId && hasAccess
    ? "/home"
    : session.whopUserId
    ? (process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com")
    : "/api/auth/login";

  return (
    <LandingWrapper
      destinationHref={destinationHref}
      membershipRequired={membershipRequired}
      hasWhopUser={Boolean(session.whopUserId)}
    />
  );
}