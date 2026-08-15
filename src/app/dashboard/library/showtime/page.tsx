import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { SKILL_MANIFEST } from "@/lib/skill-manifest";
import { BackLink } from "@/components/back-link";
import { SkillSequence } from "@/components/library/skill-sequence";
import { StatChip } from "@/components/library/stat-chip";
import {
  LayoutGrid,
  Webhook,
  KeyRound,
  Download,
  CheckCircle2,
  ShieldCheck,
  Star,
  ImageIcon,
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
    <div className="w-full space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Back to All Packages" />

      {/* Main Marketplace Card Header - Full Width */}
      <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-6 sm:p-8 space-y-8 shadow-sm">
        
        {/* Header Row: Info on Left + Installed Action Button at Extreme Right */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
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
              
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health, all in one place.
              </p>

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

          <div className="shrink-0">
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

        {/* Metadata Overview Bar */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
            <div className="space-y-1">
              <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Category</p>
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

        {/* Media Gallery - Drop Your Screenshots / Images Here */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
            Screenshots &amp; Media
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* Image Container 1 */}
            <div className="group relative aspect-video w-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors overflow-hidden">
              <ImageIcon size={24} />
              <span className="text-xs font-mono">Drop Image 1</span>
              {/* <img src="/images/showtime-preview-1.png" alt="Showtime Preview 1" className="w-full h-full object-cover" /> */}
            </div>

            {/* Image Container 2 */}
            <div className="group relative aspect-video w-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors overflow-hidden">
              <ImageIcon size={24} />
              <span className="text-xs font-mono">Drop Image 2</span>
              {/* <img src="/images/showtime-preview-2.png" alt="Showtime Preview 2" className="w-full h-full object-cover" /> */}
            </div>

            {/* Image Container 3 */}
            <div className="group relative aspect-video w-full rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors overflow-hidden">
              <ImageIcon size={24} />
              <span className="text-xs font-mono">Drop Image 3</span>
              {/* <img src="/images/showtime-preview-3.png" alt="Showtime Preview 3" className="w-full h-full object-cover" /> */}
            </div>

          </div>
        </div>

      </div>

      {/* Client Journey Pipeline */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          How a client moves through it
        </h2>
        <SkillSequence skills={overview.skills} />
      </div>

      {/* Simplified, Detailed Capabilities Breakdown (Non-carded) */}
      <div className="space-y-4 pt-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          Package Capabilities ({overview.skills.length})
        </h2>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80 border-t border-b border-zinc-200 dark:border-zinc-800/80">
          {overview.skills.map((skill) => {
            const manifest = SKILL_MANIFEST[skill.skillId];
            return (
              <div key={skill.skillId} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0 max-w-3xl">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 dark:text-white">
                      {manifest.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      ({skill.skillId})
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {manifest.description}
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase">Active</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{skill.activeClients} clients</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 dark:text-zinc-500 block text-[10px] uppercase">Success</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {skill.successRate !== null ? `${skill.successRate}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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