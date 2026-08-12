import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Link2, Send, FileText, RotateCcw, TrendingDown, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SKILLS, SKILL_INFO } from "@/lib/copy";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling", "admin"]);

// Defect #6 fix (2026-08-12, per explicit direction to make the landing
// page mirror the dashboard rather than the other way around). This was
// previously a full terminal-styled page: monospace uppercase nav,
// bracketed links, five CSS keyframes (laserSweep, variableFlicker,
// logStreamScroll, dataFlowMove, nodePulseGlow), pure-CSS :has() hover
// states swapping in fake "LIVE_TELEMETRY" panels per skill, and a
// vintage photo-collage backdrop (manila folder texture, operator
// portraits, torn paper notes). None of that is used anywhere in the
// dashboard, and home/page.tsx already has a standing test
// ("never reintroduces the old animated/pulsing decorative elements")
// that encodes the same rejection of this style for that page — this
// page was the one place it was still standing. Same bg-dot-grid
// background, same font-sans/zinc-palette/rounded-xl-card language as
// dashboard/page.tsx and library/page.tsx.
//
// Skill names come from SKILL_INFO (copy.ts) rather than being
// hardcoded, so they stay in sync with the single source of truth from
// the 2026-08-07 handoff's skill renames — this page was not one of the
// sources Finding A's audit caught, since it never rendered the names
// as plain text before (they were baked into the fake telemetry panels).
const SKILL_ICONS: Record<(typeof SKILLS)[number], typeof Link2> = {
  "pin-down": Link2,
  "pile-on": Send,
  "pre-call-read": FileText,
  "win-back": RotateCcw,
  "leak-map": TrendingDown,
};

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
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased transition-colors duration-200 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 bg-dot-grid" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <header className="w-full border-b border-zinc-200/80 dark:border-zinc-800/80 px-6 sm:px-10 py-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Showtime
          </span>
          <ThemeToggle />
        </header>

        {/* Main */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-6 sm:px-10 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left: copy */}
          <div className="lg:col-span-7 space-y-6">
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 leading-[1.05]">
              Where your infrastructure gets automated.
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
              Stop losing high-ticket revenue to dropped calendar handoffs, fragmented lead
              tracking, and unverified client data. Showtime links directly into your existing
              pipelines so the whole backend runs from one screen.
            </p>

            <div className="space-y-2 pt-2 max-w-xl">
              {SKILLS.map((skill) => {
                const Icon = SKILL_ICONS[skill];
                return (
                  <div
                    key={skill}
                    className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 px-4 py-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      <Icon size={14} className="text-zinc-500 dark:text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {SKILL_INFO[skill].name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-500">
                        {SKILL_INFO[skill].description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: auth card */}
          <div className="lg:col-span-5 w-full max-w-sm lg:ml-auto">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 p-6 space-y-5 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Dashboard access
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">
                  Sign in with Whop to open your workspace.
                </p>
              </div>

              {membershipRequired && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p className="font-semibold">Access required</p>
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {session.whopUserId
                      ? "Your Whop profile is active, but there's no valid subscription on it yet."
                      : "Sign in with Whop to check your subscription status."}
                  </p>
                </div>
              )}

              {session.whopUserId && hasAccess ? (
                <a href="/home" className="block w-full">
                  <Button className="w-full h-10 cursor-pointer">
                    Enter workspace
                    <ArrowRight size={14} />
                  </Button>
                </a>
              ) : session.whopUserId ? (
                <a
                  href={process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com"}
                  className="block w-full"
                >
                  <Button variant="outline" className="w-full h-10 cursor-pointer">
                    Get access
                  </Button>
                </a>
              ) : (
                <a href="/api/auth/login" className="block w-full">
                  <Button className="w-full h-10 cursor-pointer">
                    Sign in with Whop
                  </Button>
                </a>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full border-t border-zinc-200/80 dark:border-zinc-800/80 px-6 sm:px-10 py-4 text-xs text-zinc-400 dark:text-zinc-600">
          Mudd Ventures
        </footer>
      </div>
    </div>
  );
}