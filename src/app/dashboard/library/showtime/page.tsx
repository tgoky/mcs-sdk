import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { SKILL_MANIFEST } from "@/lib/skill-manifest";
import { BackLink } from "@/components/back-link";
import { SkillSequence } from "@/components/library/skill-sequence";
import { SkillDetailRow } from "@/components/library/skill-detail-row";
import {
  LayoutGrid,
  Webhook,
  KeyRound,
  Download,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Layers,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SETUP_GUIDES = [
  {
    title: "Calendly & Cal.com",
    body: "Fully automatic. Paste your API key in Settings → Credentials and a push webhook subscription is registered for you during onboarding — nothing else to configure.",
  },
  {
    title: "GoHighLevel",
    body: "GHL's v2 Private Integration API has no endpoint to create webhooks programmatically, so onboarding starts you on 5-minute auto-polling. Head to Settings → Booking Sync any time to switch to a direct webhook.",
  },
  {
    title: "OnceHub",
    body: "Auto-polling by default, with step-by-step instructions in Settings → Booking Sync to add a webhook from OnceHub's own interface.",
  },
];

export default async function ShowtimePackagePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return (
    <div className="w-full max-w-6xl space-y-8 px-6 py-6 font-sans mx-auto">
      <BackLink href="/dashboard/library" label="Back to All Packages" />

      {/* Main Marketplace Card Header */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-6 sm:p-8 space-y-8 shadow-sm">
        
        {/* Top Header Row: Info on Left + Action Button on Extreme Right */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          
          {/* Left App Brand & Info */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-teal-500 dark:bg-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_24px_-8px_rgba(45,212,191,0.5)]">
              <LayoutGrid className="size-8 sm:size-10 text-zinc-950 stroke-[2.3px]" />
            </div>
            <div className="min-w-0 pt-0.5 space-y-1.5">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Showtime</h1>
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 px-2 py-0.5 rounded-md">
                  Core Suite
                </span>
              </div>
              
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health, all in one place.
              </p>

              {/* Rating, Total Runs & Verification Badges */}
              <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 dark:text-zinc-400 pt-1 flex-wrap">
                <span className="flex items-center gap-1 text-amber-500 font-semibold font-sans">
                  <Star size={13} className="fill-amber-500 text-amber-500" />
                  5.0 <span className="text-zinc-400 font-normal">(24)</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Download size={13} className="fill-current text-zinc-700 dark:text-zinc-300" />
                  {overview.runsInWindow} runs ({overview.windowDays}d)
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-sans text-[11px] font-medium border border-emerald-500/20">
                  <ShieldCheck size={12} /> Verified Package
                </span>
              </div>
            </div>
          </div>

          {/* Right Action Button at Extreme End */}
          <div className="shrink-0 pt-1 sm:pt-0">
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-sm opacity-95 cursor-default"
            >
              <CheckCircle2 size={16} className="text-emerald-400 dark:text-emerald-600" />
              Installed &amp; Active
            </button>
          </div>
        </div>

        {/* Horizontal Metadata Overview Bar */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 text-center sm:text-left">
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Package Category</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">Revenue Execution</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Pricing</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">Included</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Active Clients</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">{overview.activeClients} / {overview.totalClients}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Success Rate</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
                {overview.successRate !== null ? `${overview.successRate}%` : "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Version</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">v2.4.0</p>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Developer</p>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">Showtime Core</p>
            </div>
          </div>
        </div>

        {/* Visual Highlights & Feature Showcase */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
            Visual Highlights &amp; Automation Specs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Visual Highlight Card 1 */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="p-2 w-fit rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Zap size={18} />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Instant Lead Personalization</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Generates personalized pre-call intro messages dynamically the moment a webhook lands.
                </p>
              </div>
              <div className="h-28 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/60 border border-zinc-300/40 dark:border-zinc-700/40 p-3 flex flex-col justify-center items-center gap-2">
                <div className="w-full h-2.5 bg-zinc-300 dark:bg-zinc-700 rounded-full w-3/4 animate-pulse" />
                <div className="w-full h-2.5 bg-teal-500/40 rounded-full w-1/2" />
                <div className="w-full h-2.5 bg-zinc-300 dark:bg-zinc-700 rounded-full w-5/6" />
              </div>
            </div>

            {/* Visual Highlight Card 2 */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="p-2 w-fit rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Sparkles size={18} />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Nightly Call Intelligence</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Researches upcoming prospects overnight and delivers rich briefs to Slack &amp; CRM.
                </p>
              </div>
              <div className="h-28 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/60 border border-zinc-300/40 dark:border-zinc-700/40 p-3 flex items-center justify-center gap-3">
                <div className="size-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                  AI
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-zinc-300 dark:bg-zinc-700 rounded w-full" />
                  <div className="h-2.5 bg-zinc-300 dark:bg-zinc-700 rounded w-2/3" />
                </div>
              </div>
            </div>

            {/* Visual Highlight Card 3 */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-4 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="p-2 w-fit rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Layers size={18} />
                </div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Funnel Audit &amp; Win-Back</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Audits drop-offs weekly and automatically triggers re-engagement sequences for cold leads.
                </p>
              </div>
              <div className="h-28 rounded-lg bg-zinc-200/50 dark:bg-zinc-800/60 border border-zinc-300/40 dark:border-zinc-700/40 p-3 flex items-end justify-between gap-2 px-6">
                <div className="w-6 h-10 bg-amber-500/40 rounded-t" />
                <div className="w-6 h-16 bg-amber-500/60 rounded-t" />
                <div className="w-6 h-20 bg-amber-500/90 rounded-t" />
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* Client Journey Pipeline Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          How a client moves through it
        </h2>
        <SkillSequence skills={overview.skills} />
      </div>

      {/* Included Skills Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          Included Skills (5)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overview.skills.map((skill) => (
            <div
              key={skill.skillId}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
            >
              <SkillDetailRow skill={skill} manifest={SKILL_MANIFEST[skill.skillId]} />
            </div>
          ))}
        </div>
      </div>

      {/* Booking Platform Setup Section */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          Booking platform setup
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SETUP_GUIDES.map((guide) => (
            <div
              key={guide.title}
              className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/20 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Webhook size={15} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{guide.title}</p>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-500 leading-relaxed">{guide.body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/settings/booking-sync"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors pt-1"
        >
          <KeyRound size={12} />
          Go to Settings → Booking Sync
        </Link>
      </div>
    </div>
  );
}