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

  const destinationHref =
    session.whopUserId && hasAccess
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