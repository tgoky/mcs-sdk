import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white font-sans flex flex-col justify-between selection:bg-zinc-800">
      
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img 
          src="/images/new.jpeg" 
          alt="Background" 
          className="w-full h-full object-cover object-center opacity-50 scale-105 transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>

      {/* Navigation */}
      <header className="relative z-20 w-full px-8 py-6 flex items-center justify-between">
        <div className="font-bold text-lg tracking-tight text-white">
          Showtime
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-300 font-medium">
          <a href="/dashboard?skill=pin-down" className="hover:text-white transition-colors">Show Rate</a>
          <a href="/dashboard?skill=pile-on" className="hover:text-white transition-colors">Pre-Call</a>
          <a href="/dashboard?skill=win-back" className="hover:text-white transition-colors">Recovery</a>
          <a href="/dashboard?skill=leak-map" className="hover:text-white transition-colors">Funnel Audit</a>
          <a href="/dashboard?skill=pre-call-read" className="hover:text-white transition-colors">Call Brief</a>
        </nav>

        <div>
          {session.whopUserId && hasAccess ? (
            <a href="/home">
              <Button className="h-10 px-5 text-sm bg-white text-black hover:bg-zinc-200 transition-all font-medium rounded-full">
                Workspace
              </Button>
            </a>
          ) : (
            <a href="/api/auth/login">
              <Button className="h-10 px-5 text-sm bg-white/10 text-white hover:bg-white/20 transition-all font-medium rounded-full backdrop-blur-md border border-white/20">
                Sign In
              </Button>
            </a>
          )}
        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-8 md:px-12 my-auto py-24 flex flex-col items-start space-y-6">
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] max-w-3xl text-white">
          Automate your sales pipeline.
        </h1>

        <p className="text-lg sm:text-2xl text-zinc-300 max-w-xl font-normal leading-relaxed">
          Stop losing revenue to dropped calendar handoffs, fragmented lead tracking, and unverified data.
        </p>

        {membershipRequired && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md p-4 max-w-md text-sm text-amber-200 space-y-1">
            <div className="font-semibold text-amber-400">Membership Required</div>
            <p className="text-zinc-300 text-xs leading-normal">
              {session.whopUserId
                ? "Your account is active, but requires an active subscription."
                : "Please sign in to access your account."}
            </p>
          </div>
        )}

        <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          {session.whopUserId && hasAccess ? (
            <a href="/home" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto h-12 px-8 text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all rounded-full">
                Enter Workspace
              </Button>
            </a>
          ) : session.whopUserId ? (
            <a
              href={process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com"}
              className="w-full sm:w-auto"
            >
              <Button className="w-full sm:w-auto h-12 px-8 text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all rounded-full">
                Get Access
              </Button>
            </a>
          ) : (
            <a href="/api/auth/login" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto h-12 px-8 text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all rounded-full">
                Get Started
              </Button>
            </a>
          )}
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="relative z-10 w-full px-8 py-6 flex items-center justify-between text-xs text-zinc-400 border-t border-white/10 backdrop-blur-md bg-black/10">
        <div>© Showtime</div>
        <div className="flex gap-6">
          <a href="/dashboard" className="hover:text-white transition-colors">Dashboard</a>
        </div>
      </footer>
    </div>
  );
}