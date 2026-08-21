"use client";

import { useState } from "react";
import { EnterDashboardBtn } from "@/components/enter-dashboard-btn";

export function LandingWrapper({
  destinationHref,
  membershipRequired,
  hasWhopUser,
}: {
  destinationHref: string;
  membershipRequired: boolean;
  hasWhopUser: boolean;
}) {
  const [isExiting, setIsExiting] = useState(false);

  return (
    <div 
      className={`relative min-h-screen w-full overflow-hidden bg-black text-white font-sans flex flex-col justify-between selection:bg-zinc-800 transition-opacity duration-500 ${
        isExiting ? "opacity-30" : "opacity-100"
      }`}
    >
      {/* Background Image Layer with Hyperspace Portal Zoom */}
      <div className="absolute inset-0 z-0">
        <img 
          src="/images/new.jpeg" 
          alt="Background" 
          className={`w-full h-full object-cover object-center opacity-50 transition-all duration-700 ease-out ${
            isExiting ? "scale-125 blur-sm" : "scale-105"
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>

      {/* Navigation Header */}
      <header className="relative z-30 w-full px-8 py-6 flex items-center justify-between">
        <div className="font-bold text-lg tracking-tight text-white">
          Showtime
        </div>
        
        {/* Starlink-style Glassmorphic Navigation */}
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium">
          
          {/* Item 1: Show Rate */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Show Rate
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            
            {/* Smooth Faint Glass Panel */}
            <div className="absolute top-full left-0 mt-3 w-[720px] bg-zinc-900/35 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">ONBOARDING</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Show Rate Setup</div>
                    <div className="hover:text-white transition-colors duration-200">Brand Voice Extraction</div>
                    <div className="hover:text-white transition-colors duration-200">Confirmation Pages</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">AUTOMATION</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Webhook Sync</div>
                    <div className="hover:text-white transition-colors duration-200">Video Scripting</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">ANALYTICS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Attendance Metrics</div>
                    <div className="hover:text-white transition-colors duration-200">Funnel Benchmarks</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 2: Pre-Call */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Pre-Call
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-zinc-900/35 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">SEQUENCES</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Pre-Call Sequence</div>
                    <div className="hover:text-white transition-colors duration-200">AI Personalization</div>
                    <div className="hover:text-white transition-colors duration-200">SMS Reminders</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">INTEGRATIONS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Calendly & Cal.com</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Workflows</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">AUDIENCE</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Retargeting Sync</div>
                    <div className="hover:text-white transition-colors duration-200">Cohort Tracking</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 3: Recovery */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Recovery
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-zinc-900/35 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">CADENCE</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Booking Recovery</div>
                    <div className="hover:text-white transition-colors duration-200">No-Show Sequences</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">DETECTION</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Reply Triggers</div>
                    <div className="hover:text-white transition-colors duration-200">Rebooking Exit Logic</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">CHANNELS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Direct SMS & Email</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Native Flows</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 4: Funnel Audit */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Funnel Audit
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[720px] bg-zinc-900/35 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">AUDITS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Funnel Audit</div>
                    <div className="hover:text-white transition-colors duration-200">Drop-off Detection</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">MONITORING</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Severity Alerts</div>
                    <div className="hover:text-white transition-colors duration-200">Pipeline Integrity</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">REPORTS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Weekly Health Digests</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Item 5: Call Brief */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-[8px] text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Call Brief
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>

            <div className="absolute top-full right-0 mt-3 w-[720px] bg-zinc-900/35 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)] opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-6 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">INTEL</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Call Briefs</div>
                    <div className="hover:text-white transition-colors duration-200">Prospect Enrichment</div>
                  </div>
                </div>
                <div className="px-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">DELIVERY</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">Slack Channel Digests</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Timeline Notes</div>
                  </div>
                </div>
                <div className="px-6 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-5">SYNTHESIS</div>
                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="hover:text-white transition-colors duration-200">AI Executive Summaries</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </nav>
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
              {hasWhopUser
                ? "Your account is active, but requires an active subscription."
                : "Please sign in to access your account."}
            </p>
          </div>
        )}

        {/* Main Hero CTA */}
        <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          <EnterDashboardBtn 
            href={destinationHref} 
            onNavigateStart={() => setIsExiting(true)}
          >
            Enter Dashboard
          </EnterDashboardBtn>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-8 py-6 flex items-center justify-between text-xs text-zinc-400 border-t border-white/10 backdrop-blur-md bg-black/10">
        <div>© Showtime</div>
      </footer>
    </div>
  );
}