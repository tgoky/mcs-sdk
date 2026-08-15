import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { SKILL_MANIFEST } from "@/lib/skill-manifest";
import { BackLink } from "@/components/back-link";
import { SkillSequence } from "@/components/library/skill-sequence";
import { SkillDetailRow } from "@/components/library/skill-detail-row";
import { StatChip } from "@/components/library/stat-chip";
import { LayoutGrid, Webhook, KeyRound, Download } from "lucide-react";
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
    <div className="w-full max-w-5xl space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Library" />

      {/* Package Header Banner */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 dark:bg-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_24px_-8px_rgba(45,212,191,0.5)]">
            <LayoutGrid size={26} className="text-zinc-950 stroke-[2.3px]" />
          </div>
          <div className="min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">Showtime</h1>
              
              {/* Filled Download Icon Badge */}
              <div 
                title="Installed & active" 
                className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm"
              >
                <Download size={13} className="fill-emerald-400 text-emerald-400 stroke-[2.2px]" />
              </div>
            </div>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-xl">
              Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health, all in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8 pt-2 border-t border-zinc-800/60">
          <StatChip label="Active clients" value={`${overview.activeClients}/${overview.totalClients}`} />
          <StatChip label={`Runs (${overview.windowDays}d)`} value={String(overview.runsInWindow)} />
          <StatChip
            label="Success rate"
            value={overview.successRate !== null ? `${overview.successRate}%` : "—"}
            tone={overview.successRate === null ? "neutral" : overview.successRate >= 80 ? "success" : "warning"}
          />
        </div>
      </div>

      {/* Client Journey Timeline */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          How a client moves through it
        </h2>
        <SkillSequence skills={overview.skills} />
      </div>

      {/* Skills Sub-Grid (App Store Style) */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          Included Skills (5)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {overview.skills.map((skill) => (
            <div key={skill.skillId} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden hover:border-zinc-700 transition-all">
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
            <div key={guide.title} className="p-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 space-y-2">
              <div className="flex items-center gap-2">
                <Webhook size={15} className="text-teal-400 shrink-0" />
                <p className="text-sm font-bold text-zinc-100">{guide.title}</p>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{guide.body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/settings/booking-sync"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors pt-1"
        >
          <KeyRound size={12} />
          Go to Settings → Booking Sync
        </Link>
      </div>
    </div>
  );
}