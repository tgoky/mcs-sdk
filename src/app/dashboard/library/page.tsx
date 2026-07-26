import Link from "next/link";
import { SKILLS, SKILL_INFO } from "@/lib/copy";
import { Webhook, KeyRound, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

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

/**
 * Reference material for what each skill actually does and how booking
 * sync works per platform — the "look this up without pinging support"
 * page. This is a first pass at what "Library" means for this app: skill
 * docs + setup guides, not a saved-content/template library. If the goal
 * was closer to a place to store generated assets (confirmation pages,
 * ad creative briefs, past proposals), that's a different page — flag it
 * and it's a quick redirect.
 */
export default function LibraryPage() {
  return (
    <div className="w-full space-y-8 px-6 py-6 transition-colors duration-200">
      <div>
        <h1 className="text-xl tracking-tight" style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          Library
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          What each skill does, and how to connect your booking platform for instant sync.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          Skills
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {SKILLS.map((skill) => (
            <Link
              key={skill}
              href={`/dashboard/modules/${skill}`}
              className="group rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{SKILL_INFO[skill].name}</p>
                <ArrowUpRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                {SKILL_INFO[skill].description}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono">
          Booking platform setup
        </h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 bg-white dark:bg-zinc-900/40 divide-y divide-zinc-200 dark:divide-zinc-900">
          {SETUP_GUIDES.map((guide) => (
            <div key={guide.title} className="px-4 py-4 flex items-start gap-3">
              <Webhook size={15} className="text-zinc-400 dark:text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{guide.title}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5 leading-relaxed">{guide.body}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/settings?tab=booking-sync"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
        >
          <KeyRound size={12} />
          Go to Settings → Booking Sync
        </Link>
      </div>
    </div>
  );
}
