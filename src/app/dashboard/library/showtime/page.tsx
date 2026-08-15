import { getSession } from "@/lib/session";
import { getPackageOverview } from "@/lib/package-overview";
import { SKILL_MANIFEST } from "@/lib/skill-manifest";
import { BackLink } from "@/components/back-link";
import { SkillSequence } from "@/components/library/skill-sequence";
import { SkillDetailRow } from "@/components/library/skill-detail-row";
import { StatChip } from "@/components/library/stat-chip";
import { LayoutGrid, Webhook, KeyRound } from "lucide-react";
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
    body: "GHL's v2 Private Integration API has no endpoint to create webhooks programmatically, so onboarding starts you on 5-minute auto-polling. Head to Settings → Booking Sync any time to switch to a direct webhook — it walks through adding a Custom Webhook action to a GHL workflow, including the exact header GHL needs.",
  },
  {
    title: "OnceHub",
    body: "Same story as GHL today: auto-polling by default, with step-by-step instructions in Settings → Booking Sync to add a webhook from OnceHub's own interface. OnceHub's Developer Center now describes a webhooks API that returns a signing_secret directly, similar to Calendly/Cal.com — worth checking their current docs if you want fully automatic setup, since that wasn't available when this fallback was originally built.",
  },
];

export default async function ShowtimePackagePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return (
    <div className="w-full max-w-3xl space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Library" />

      {/* Hero */}
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 dark:bg-teal-400 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_24px_-8px_rgba(45,212,191,0.5)]">
            <LayoutGrid size={26} className="text-zinc-950 stroke-[2.3px]" />
          </div>
          <div className="min-w-0 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">Showtime</h1>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-800/60 bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Installed &amp; active
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-xl">
              Sales execution for your booked calls — client setup, follow-up sequences, call briefs,
              win-back, and funnel health, all in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8 pl-1">
          <StatChip label="Active clients" value={`${overview.activeClients}/${overview.totalClients}`} />
          <StatChip label={`Runs (${overview.windowDays}d)`} value={String(overview.runsInWindow)} />
          <StatChip
            label="Success rate"
            value={overview.successRate !== null ? `${overview.successRate}%` : "—"}
            tone={overview.successRate === null ? "neutral" : overview.successRate >= 80 ? "success" : "warning"}
          />
        </div>
      </div>

      {/* Signature element: the real client journey through the 5 skills */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          How a client moves through it
        </h2>
        <SkillSequence skills={overview.skills} />
      </div>

      {/* Full skill listing */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          All 5 skills
        </h2>
        <div className="rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60 overflow-hidden">
          {overview.skills.map((skill) => (
            <SkillDetailRow key={skill.skillId} skill={skill} manifest={SKILL_MANIFEST[skill.skillId]} />
          ))}
        </div>
      </div>

      {/* Booking platform setup */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
          Booking platform setup
        </h2>
        <div className="rounded-2xl border border-zinc-800/80 divide-y divide-zinc-800/60">
          {SETUP_GUIDES.map((guide) => (
            <div key={guide.title} className="px-4 sm:px-5 py-4 flex items-start gap-3">
              <Webhook size={15} className="text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-zinc-100">{guide.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{guide.body}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/settings/booking-sync"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <KeyRound size={12} />
          Go to Settings → Booking Sync
        </Link>
      </div>
    </div>
  );
}
