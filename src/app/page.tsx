import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Link2, Lock, Globe, Terminal, CheckCircle2, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <div className="relative min-h-screen bg-background text-foreground font-sans overflow-hidden selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-200">
      
      {/* Dynamic Hover States for Terminal Preview */}
      <style dangerouslySetInnerHTML={{ __html: `
        .viz-pindown, .viz-pileon, .viz-winback, .viz-leakmap, .viz-precall { display: none !important; }

        body:has(a[href*="pin-down"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pin-down"]:hover) .viz-pindown { display: flex !important; }

        body:has(a[href*="pile-on"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pile-on"]:hover) .viz-pileon { display: flex !important; }

        body:has(a[href*="win-back"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="win-back"]:hover) .viz-winback { display: flex !important; }

        body:has(a[href*="leak-map"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="leak-map"]:hover) .viz-leakmap { display: flex !important; }

        body:has(a[href*="pre-call"]:hover) .default-login-content { display: none !important; }
        body:has(a[href*="pre-call"]:hover) .viz-precall { display: flex !important; }
      `}} />

      {/* ---------------------------------------------------------------------- */}
      {/* HEADER: Clean Top Navigation */}
      {/* ---------------------------------------------------------------------- */}
      <header className="relative z-30 w-full border-b border-zinc-200 dark:border-zinc-800 bg-background/60 backdrop-blur-md px-8 py-4 hidden md:flex items-center justify-between text-sm">
        {/* Logo / Brand */}
        <div className="font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2">
          <span>Showtime</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">v1.34</span>
        </div>
        
        {/* Navigation Links */}
        <div className="flex items-center gap-6 text-xs text-zinc-600 dark:text-zinc-400 font-medium">
          <a href="/dashboard?skill=pin-down" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Show Rate Setup</a>
          <a href="/dashboard?skill=pile-on" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Pre-Call Sequence</a>
          <a href="/dashboard?skill=win-back" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Booking Recovery</a>
          <a href="/dashboard?skill=leak-map" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Funnel Audit</a>
          <a href="/dashboard?skill=pre-call-read" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Call Brief</a>
        </div>
        
        {/* System Status & Theme Toggle */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-zinc-500 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
            <span>Systems Normal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile Navigation Fallback */}
      <nav className="md:hidden relative z-30 w-full flex flex-wrap justify-center gap-x-4 gap-y-2 border-b border-border px-6 py-3 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-background/50">
        <a href="/dashboard?skill=pin-down">Show Rate Setup</a>
        <a href="/dashboard?skill=pile-on">Pre-Call Sequence</a>
        <a href="/dashboard?skill=win-back">Booking Recovery</a>
        <a href="/dashboard?skill=leak-map">Funnel Audit</a>
        <a href="/dashboard?skill=pre-call-read">Call Brief</a>
      </nav>

      {/* Background Mesh Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.08)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0" />

      {/* ---------------------------------------------------------------------- */}
      {/* MAIN HERO VIEWPORT */}
      {/* ---------------------------------------------------------------------- */}
      <div className="relative z-20 max-w-6xl mx-auto px-6 flex flex-col justify-between min-h-[calc(100vh-62px)]">
        
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-12 my-auto items-center pt-12 pb-12 w-full">
          
          {/* Left Column: Simple & Direct Headline */}
          <div className="lg:col-span-7 space-y-6 text-left select-text">
            <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground leading-[1.08] max-w-xl">
              Where your <br />
              <span className="text-zinc-900 dark:text-zinc-100 font-semibold underline decoration-zinc-300 dark:decoration-zinc-700 underline-offset-8">
                infrastructure
              </span> <br />
              gets automated.
            </h1>
            
            <div className="space-y-4 max-w-xl text-zinc-600 dark:text-zinc-400 text-base leading-relaxed">
              <p>
                Stop losing sales revenue to missed calendar handoffs, fragmented lead tracking, and unverified prospect data. Showtime connects directly into your tools to automate your backend sales workflows from one screen.
              </p>
              <div className="pt-2 text-xs font-mono text-zinc-500 dark:text-zinc-500 space-y-1">
                <p className="font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">Included Automations:</p>
                <p>• Show Rate Setup &bull; Pre-Call Sequences &bull; Call Briefs</p>
                <p>• Booking Recovery &bull; Funnel Audits</p>
              </div>
            </div>
          </div>

          {/* Right Column: Realistic Terminal & Auth Box */}
          <div className="lg:col-span-5 w-full max-w-md lg:ml-auto relative">
            
            <div className="relative border border-zinc-200 dark:border-zinc-800 bg-card rounded-xl shadow-xl overflow-hidden min-h-[380px] flex flex-col justify-between z-10">
              
              {/* Terminal Title Bar */}
              <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/80 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-xs text-zinc-500 font-medium flex items-center gap-1.5">
                  <Terminal size={12} /> showtime-execution
                </span>
                <div className="w-10" />
              </div>

              {/* ────────────────────────────────────────────────────────────────────── */}
              {/* REALISTIC TERMINAL LOG VIEWS */}
              {/* ────────────────────────────────────────────────────────────────────── */}

              {/* View 1: Show Rate Setup */}
              <div className="viz-pindown flex-1 p-5 flex flex-col justify-between font-mono text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-950 text-zinc-200">
                <div className="space-y-2">
                  <div className="text-zinc-500 text-[11px] border-b border-zinc-800 pb-2 flex justify-between">
                    <span>MODULE: SHOW_RATE_SETUP</span>
                    <span className="text-emerald-400">READY</span>
                  </div>
                  <p className="text-emerald-400">$ showtime onboard --client "Acme Corp"</p>
                  <p className="text-zinc-400">[1/3] Extracting brand voice and tone profile...</p>
                  <p className="text-zinc-400">[2/3] Generating custom confirmation page HTML...</p>
                  <p className="text-zinc-400">[3/3] Registering webhook with booking platform...</p>
                </div>
                <div className="mt-4 p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={14} /> Webhook active &amp; page deployed successfully.
                </div>
              </div>

              {/* View 2: Pre-Call Sequence */}
              <div className="viz-pileon flex-1 p-5 flex flex-col justify-between font-mono text-xs bg-zinc-950 text-zinc-200">
                <div className="space-y-2">
                  <div className="text-zinc-500 text-[11px] border-b border-zinc-800 pb-2 flex justify-between">
                    <span>MODULE: PRE_CALL_SEQUENCE</span>
                    <span className="text-sky-400">RUNNING</span>
                  </div>
                  <p className="text-sky-400">POST /api/webhooks/booking-event 200 OK</p>
                  <p className="text-zinc-400">[event] New booking received for Sarah Jenkins</p>
                  <p className="text-zinc-400">[ai] Generating personalized intro message...</p>
                  <p className="text-zinc-400">[esp] Enrolling prospect in pre-call sequence...</p>
                </div>
                <div className="mt-4 p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-sky-400">
                  Sequence active (Email &amp; SMS scheduled)
                </div>
              </div>

              {/* View 3: Booking Recovery */}
              <div className="viz-winback flex-1 p-5 flex flex-col justify-between font-mono text-xs bg-zinc-950 text-zinc-200">
                <div className="space-y-2">
                  <div className="text-zinc-500 text-[11px] border-b border-zinc-800 pb-2 flex justify-between">
                    <span>MODULE: BOOKING_RECOVERY</span>
                    <span className="text-amber-400">ACTIVE</span>
                  </div>
                  <p className="text-amber-400">[event] Call status updated: No-Show</p>
                  <p className="text-zinc-400">[init] Starting 30-day recovery sequence...</p>
                  <p className="text-zinc-400">[crm] Tagging prospect profile in CRM...</p>
                  <p className="text-zinc-400">[link] Generating fresh reschedule URL...</p>
                </div>
                <div className="mt-4 p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-amber-400">
                  Recovery cadence running (5 emails, 3 SMS)
                </div>
              </div>

              {/* View 4: Funnel Audit */}
              <div className="viz-leakmap flex-1 p-5 flex flex-col justify-between font-mono text-xs bg-zinc-950 text-zinc-200">
                <div className="space-y-2">
                  <div className="text-zinc-500 text-[11px] border-b border-zinc-800 pb-2 flex justify-between">
                    <span>MODULE: FUNNEL_AUDIT</span>
                    <span className="text-indigo-400">ANALYZING</span>
                  </div>
                  <p className="text-indigo-400">$ showtime audit --weekly-summary</p>
                  <p className="text-zinc-400">[data] Scanning pipeline metrics (n=42 calls)...</p>
                  <p className="text-zinc-400">[check] Evaluating show-up rates &amp; drop-offs...</p>
                  <p className="text-zinc-400">[report] Compiling executive report...</p>
                </div>
                <div className="mt-4 p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-indigo-400">
                  Audit report delivered to Slack channel
                </div>
              </div>

              {/* View 5: Call Brief */}
              <div className="viz-precall flex-1 p-5 flex flex-col justify-between font-mono text-xs bg-zinc-950 text-zinc-200">
                <div className="space-y-2">
                  <div className="text-zinc-500 text-[11px] border-b border-zinc-800 pb-2 flex justify-between">
                    <span>MODULE: CALL_BRIEF</span>
                    <span className="text-emerald-400">COMPLETE</span>
                  </div>
                  <p className="text-emerald-400">[cron] Nightly briefing cycle started</p>
                  <p className="text-zinc-400">[match] Researching prospect: VP of Sales</p>
                  <p className="text-zinc-400">[ai] Synthesizing executive summary...</p>
                  <p className="text-zinc-400">[slack] Sending pre-call brief to team...</p>
                </div>
                <div className="mt-4 p-3 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-emerald-400">
                  Brief sent with interactive outcome buttons
                </div>
              </div>

              {/* Standard Default Login Panel */}
              <div className="default-login-content flex-1 p-6 flex flex-col justify-between bg-card">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Dashboard Access
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                      Sign in with your Whop account to manage clients, credentials, and live automations.
                    </p>
                  </div>

                  {membershipRequired && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      <p className="font-medium">Access Required</p>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                        {session.whopUserId
                          ? "Your Whop profile is active, but missing a valid execution license. Please check your subscription."
                          : "No active session found. Please sign in below to continue."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-6">
                  {session.whopUserId && hasAccess ? (
                    <a href="/home" className="block w-full">
                      <Button className="w-full h-10 text-xs font-medium cursor-pointer flex items-center justify-center gap-2">
                        Enter Workspace <ArrowRight size={14} />
                      </Button>
                    </a>
                  ) : session.whopUserId ? (
                    <a
                      href={process.env.WHOP_COMPANY_CHECKOUT_URL ?? "https://whop.com"}
                      className="block w-full"
                    >
                      <Button variant="outline" className="w-full h-10 text-xs font-medium cursor-pointer">
                        Get Access Key
                      </Button>
                    </a>
                  ) : (
                    <a href="/api/auth/login" className="block w-full">
                      <Button className="w-full h-10 text-xs font-medium cursor-pointer flex items-center justify-center gap-2">
                        Sign in with Whop <ArrowRight size={14} />
                      </Button>
                    </a>
                  )}
                </div>
              </div>

            </div>
          </div>
        </main>
        
        {/* Footer */}
        <footer className="w-full py-6 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
          <div>Mudd Ventures &bull; Showtime</div>
          <div>All Systems Operational</div>
        </footer>
      </div>
    </div>
  );
}