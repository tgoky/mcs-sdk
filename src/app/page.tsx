import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling"]);

export default async function LandingIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>;
}) {
  const session = await getSession();
  const { membership } = await searchParams;
  const hasAccess = ACTIVE_STATUSES.has(session.subscriptionStatus ?? "");
  const membershipRequired = membership === "required";

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950 p-6 min-h-screen">
      <main className="w-full max-w-xl border border-zinc-200 rounded-2xl bg-white dark:border-zinc-900 dark:bg-zinc-950 p-10 shadow-sm text-center space-y-6 select-none tracking-tight">
        
        {/* Clean, Non-Intimidating Core Logo Mark */}
        {/* <div className="inline-flex h-10 w-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 items-center justify-center text-white dark:text-zinc-950 font-sans text-base font-bold shadow-sm">
          S
        </div>
         */}
        {/* Plain English Value Copy */}
        <div className="space-y-2">
          <h1 className="text-xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-2xl">
            Showtime Control Panel
          </h1>
          <p className="text-sm font-normal text-zinc-500 max-w-sm mx-auto leading-relaxed">
            Automate your client onboarding configuration, automated follow-ups, and sales team briefing logs from a single workspace.
          </p>
        </div>

        {membershipRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            {session.whopUserId
              ? "Your Whop account is signed in, but we don't see an active membership for this app. Grab or renew access on Whop, then come back."
              : "An active membership is required to open the dashboard. Sign in with Whop to check your access."}
          </div>
        )}

        {/* Auth + access gates */}
        <div className="pt-2 flex justify-center w-full">
          {session.whopUserId && hasAccess ? (
            <a href="/dashboard" className="w-full sm:w-auto">
              <Button variant="outline" className="w-full sm:w-48 text-xs font-mono uppercase tracking-wider cursor-pointer">
                [ Go to Dashboard ]
              </Button>
            </a>
          ) : session.whopUserId ? (
            <a
              href={process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com"}
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-48 text-xs font-sans font-medium bg-zinc-100 text-zinc-950 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
                Get access on Whop
              </Button>
            </a>
          ) : (
            <a href="/api/auth/login" className="w-full sm:w-auto">
              <Button className="w-full sm:w-48 text-xs font-sans font-medium bg-zinc-100 text-zinc-950 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
                Sign in with Whop
              </Button>
            </a>
          )}
        </div>
      </main>
    </div>
  );
}