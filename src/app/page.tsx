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

      {/* Navigation Header */}
      <header className="relative z-30 w-full px-8 py-6 flex items-center justify-between">
        <div className="font-bold text-lg tracking-tight text-white">
          Showtime
        </div>
        
        {/* Starlink-style Hover Dropdown Nav */}
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          
          {/* Item 1: Show Rate */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-[#2c2c33] group-hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none">
              Show Rate
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            
            {/* Static Dropdown Panel */}
            <div className="absolute top-full left-0 mt-3 w-[720px] bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-[16px] p-8 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">ONBOARDING</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Show Rate Setup</div>
                    <div>Brand Voice Extraction</div>
                    <div>Confirmation Pages</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">AUTOMATION</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Webhook Sync</div>
                    <div>Video Scripting</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">ANALYTICS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Attendance Metrics</div>
                    <div>Funnel Benchmarks</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 2: Pre-Call */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-[#2c2c33] group-hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none">
              Pre-Call
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-[16px] p-8 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">SEQUENCES</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Pre-Call Sequence</div>
                    <div>AI Personalization</div>
                    <div>SMS Reminders</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">INTEGRATIONS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Calendly & Cal.com</div>
                    <div>CRM Workflows</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">AUDIENCE</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Retargeting Sync</div>
                    <div>Cohort Tracking</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 3: Recovery */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-[#2c2c33] group-hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none">
              Recovery
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-[16px] p-8 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">CADENCE</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Booking Recovery</div>
                    <div>No-Show Sequences</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">DETECTION</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Reply Triggers</div>
                    <div>Rebooking Exit Logic</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">CHANNELS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Direct SMS & Email</div>
                    <div>CRM Native Flows</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 4: Funnel Audit */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-[#2c2c33] group-hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none">
              Funnel Audit
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-[16px] p-8 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">AUDITS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Funnel Audit</div>
                    <div>Drop-off Detection</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">MONITORING</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Severity Alerts</div>
                    <div>Pipeline Integrity</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">REPORTS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Weekly Health Digests</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 5: Call Brief */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-[#2c2c33] group-hover:text-white transition-all flex items-center gap-1.5 cursor-pointer select-none">
              Call Brief
              <svg className="w-3 h-3 transition-transform group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full right-0 mt-3 w-[720px] bg-[#161619]/95 backdrop-blur-2xl border border-white/10 rounded-[16px] p-8 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">INTEL</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Call Briefs</div>
                    <div>Prospect Enrichment</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">DELIVERY</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>Slack Channel Digests</div>
                    <div>CRM Timeline Notes</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-5">SYNTHESIS</div>
                  <div className="space-y-3 text-sm text-zinc-200">
                    <div>AI Executive Summaries</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </nav>

        {/* Single Navigation Header CTA */}
        <div>
          <a href="/dashboard">
            <Button className="h-10 px-6 text-sm bg-white text-black hover:bg-zinc-200 transition-all font-semibold rounded-full">
              Enter Dashboard
            </Button>
          </a>
        </div>
      </header>

      {/* Hero Body Content */}
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

        {/* Single Primary Main Hero CTA */}
        <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          <a href="/dashboard" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto h-12 px-8 text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all rounded-full">
              Enter Dashboard
            </Button>
          </a>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="relative z-10 w-full px-8 py-6 flex items-center justify-between text-xs text-zinc-400 border-t border-white/10 backdrop-blur-md bg-black/10">
        <div>© Showtime</div>
      </footer>
    </div>
  );
}