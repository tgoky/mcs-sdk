"use client";

import { useState } from "react";
import { EnterDashboardBtn } from "@/components/enter-dashboard-btn";
import { HeaderCtaBtn } from "@/components/header-cta-btn";

export function LandingWrapper({
  destinationHref,
  getStartedHref,
  membershipRequired,
  hasWhopUser,
}: {
  destinationHref: string;
  getStartedHref: string;
  membershipRequired: boolean;
  hasWhopUser: boolean;
}) {
  const [isExiting, setIsExiting] = useState(false);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white font-sans flex flex-col justify-between selection:bg-zinc-800">
      {/* Background Image Layer */}
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
   <div className="flex items-center z-10">
  <img
    src="/images/logo.png"
    alt="Mudd Ventures"
    className="h-11 md:h-14 w-auto object-contain"
  />
</div>
        <nav className="hidden md:flex items-center gap-2 text-sm font-medium absolute left-1/2 -translate-x-1/2">
          {/* Show Time */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Show Time
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[640px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-5 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">ONBOARDING</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Brand Voice Extraction</div>
                    <div className="hover:text-white transition-colors duration-200">Confirmation Pages</div>
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">AUTOMATION</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Webhook Sync</div>
                    <div className="hover:text-white transition-colors duration-200">Video Scripting</div>
                  </div>
                </div>
                <div className="px-5 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">ANALYTICS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Attendance Metrics</div>
                    <div className="hover:text-white transition-colors duration-200">Funnel Benchmarks</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Counter Claim */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Counter Claim
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[640px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-5 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">SEQUENCES</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">AI Personalization</div>
                    <div className="hover:text-white transition-colors duration-200">SMS Reminders</div>
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">INTEGRATIONS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Calendly & Cal.com</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Workflows</div>
                  </div>
                </div>
                <div className="px-5 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">AUDIENCE</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Retargeting Sync</div>
                    <div className="hover:text-white transition-colors duration-200">Cohort Tracking</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recovery */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Recovery
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[640px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-5 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">CADENCE</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Booking Recovery</div>
                    <div className="hover:text-white transition-colors duration-200">No-Show Sequences</div>
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">DETECTION</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Reply Triggers</div>
                    <div className="hover:text-white transition-colors duration-200">Rebooking Exit Logic</div>
                  </div>
                </div>
                <div className="px-5 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">CHANNELS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Direct SMS & Email</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Native Flows</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Funnel Audit */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Funnel Audit
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[640px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-5 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">AUDITS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Funnel Audit</div>
                    <div className="hover:text-white transition-colors duration-200">Drop-off Detection</div>
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">MONITORING</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Severity Alerts</div>
                    <div className="hover:text-white transition-colors duration-200">Pipeline Integrity</div>
                  </div>
                </div>
                <div className="px-5 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">REPORTS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Weekly Health Digests</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Call Brief */}
          <div className="relative group">
            <span className="px-3.5 py-1.5 rounded-sm text-zinc-300 group-hover:bg-white/10 group-hover:text-white transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none">
              Call Brief
              <svg className="w-3 h-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[640px] bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-sm p-7 shadow-2xl opacity-0 -translate-y-2 scale-[0.98] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-50">
              <div className="grid grid-cols-3 divide-x divide-white/10">
                <div className="px-5 first:pl-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">INTEL</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Call Briefs</div>
                    <div className="hover:text-white transition-colors duration-200">Prospect Enrichment</div>
                  </div>
                </div>
                <div className="px-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">DELIVERY</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">Slack Channel Digests</div>
                    <div className="hover:text-white transition-colors duration-200">CRM Timeline Notes</div>
                  </div>
                </div>
                <div className="px-5 last:pr-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-300 mb-4">SYNTHESIS</div>
                  <div className="space-y-3 text-sm text-zinc-100">
                    <div className="hover:text-white transition-colors duration-200">AI Executive Summaries</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <HeaderCtaBtn href={getStartedHref} onNavigateStart={() => setIsExiting(true)}>
          Get Started
        </HeaderCtaBtn>
      </header>

      {/* Hero Body Content */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-8 md:px-12 my-auto py-24 flex flex-col items-start space-y-6">
        <h1 className={`text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95] max-w-3xl text-white transition-all duration-700 ease-out ${
          isExiting ? "opacity-0 scale-105" : "opacity-100 scale-100"
        }`}>
         Your entire stack, unified.
        </h1>

        <p className={`text-lg sm:text-2xl text-zinc-300 max-w-xl font-normal leading-relaxed transition-all duration-500 ease-out ${
          isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
        }`}> 
         Access an expanding ecosystem of tools built to automate and scale your operations.
        </p>

        {membershipRequired && (
          <div className={`rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md p-4 max-w-md text-sm text-amber-200 space-y-1 transition-all duration-400 ease-out ${
            isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
          }`}>
            <div className="font-semibold text-amber-400">Membership Required</div>
            <p className="text-zinc-300 text-xs leading-normal">
              {hasWhopUser
                ? "Your account is active, but requires an active subscription."
                : "Please sign in to access your account."}
            </p>
          </div>
        )}

        <div className="relative z-50 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
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
        <div>© Mudd Ventures 2026</div>
      </footer>
    </div>
  );
}