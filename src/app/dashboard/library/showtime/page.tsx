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
  Zap,
  Sparkles,
  BarChart3,
  RefreshCw,
  SlidersHorizontal,
  ArrowRight,
  Clock,
  FileText,
  Terminal,
  Slack,
  Check,
  TrendingUp,
  UserCheck,
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

const DETAILED_SKILL_PLAYBOOKS = [
  {
    id: "pin-down",
    icon: SlidersHorizontal,
    accentColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    badge: "Setup Bridge (Onboarding)",
    trigger: "Manual launch or wizard dispatch upon adding a new client.",
    cadence: "One-time execution per client onboarding pass.",
    overview:
      "Learns client brand voice, drafts high-converting ad creative briefs and video scripts, builds custom confirmation page HTML, and auto-provisions booking webhooks.",
    workflow: [
      "Scrapes and extracts brand tone, offer terms, and target audience persona.",
      "Generates paste-ready HTML confirmation page with dynamic booking URL injection.",
      "Deploys host configurations directly to Vercel, Webflow, WordPress, or GoHighLevel.",
      "Provisions push webhooks or initializes 5-minute auto-polling sync on calendar platforms.",
    ],
    deliverables: [
      "Hosted confirmation page URL",
      "Brand voice profile",
      "Ad creative & video script briefs",
      "Live calendar webhook connection",
    ],
  },
  {
    id: "pile-on",
    icon: Zap,
    accentColor: "text-teal-500 bg-teal-500/10 border-teal-500/20",
    badge: "Real-Time Event Stream",
    trigger: "Inbound booking webhook or 5-minute background polling cycle.",
    cadence: "Instant event-driven execution per booked prospect.",
    overview:
      "Captures new booking webhooks, synthesizes personalized intro copy within a strict 6-second budget, enrolls leads into ESP/SMS sequences, and updates ad attribution cohorts.",
    workflow: [
      "Extracts prospect name, email, phone, and booking form Q&A responses.",
      "Executes Claude hybrid synthesis for custom first-message intro copy.",
      "Enrolls prospect into Klaviyo, HubSpot, GHL, Mailchimp, or ConvertKit flows.",
      "Dispatches direct multi-message SMS sequences via Twilio or GHL SMS.",
      "Adds lead to Hyros or Google Sheets cohorts to halt redundant retargeting ad spend.",
    ],
    deliverables: [
      "Personalized introductory email/SMS",
      "Active ESP sequence enrollment",
      "Ad-data retargeting cohort exclusion",
    ],
  },
  {
    id: "pre-call-read",
    icon: Sparkles,
    accentColor: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
    badge: "Scheduled & Dynamic Batch",
    trigger: "Nightly cron sweep (00:00 server time) or lead-time window trigger.",
    cadence: "Nightly batch or dynamic 1-hour pre-call alert.",
    overview:
      "Researches upcoming booked calls overnight using cross-signal person-matching to locate verified LinkedIn profiles and delivers structured intelligence briefs to reps.",
    workflow: [
      "Pulls tomorrow's active calendar roster across Calendly, Cal.com, GHL, or OnceHub.",
      "Applies Rule 14 surname disambiguation and LinkedIn URL corroboration.",
      "Synthesizes company size, pain points, intent signals, and historical CRM interactions.",
      "Delivers brief to Slack with interactive outcome buttons (Showed / No-show / Rescheduled) and attaches note to CRM.",
    ],
    deliverables: [
      "Slack pre-call brief notification",
      "CRM timeline contact note",
      "Interactive outcome button handler",
    ],
  },
  {
    id: "win-back",
    icon: RefreshCw,
    accentColor: "text-rose-500 bg-rose-500/10 border-rose-500/20",
    badge: "Recovery Cadence Engine",
    trigger: "Cancellation webhook, rep Slack button click, or assumed-no-show sweep.",
    cadence: "Durable 30-day automated re-engagement cycle.",
    overview:
      "Generates and executes a multi-channel recovery cadence (5 emails + 3 SMS) for prospects who went cold, injecting single-use reschedule links with automatic exit detection.",
    workflow: [
      "Detects cancelled or no-showed prospects automatically or via rep action.",
      "Generates 30-day cadence copy with single-use per-prospect reschedule links.",
      "Schedules multi-message SMS and SMTP/ESP delivery sequences via durable Inngest functions.",
      "Monitors inbound email replies and rebooking webhooks to halt sequences instantly upon re-engagement.",
    ],
    deliverables: [
      "30-day recovery email & SMS cadence",
      "Single-use fresh reschedule link injection",
      "Automated reply & rebook exit listeners",
    ],
  },
  {
    id: "leak-map",
    icon: BarChart3,
    accentColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    badge: "Pipeline Diagnostics",
    trigger: "Scheduled weekly audit cron or manual on-demand trigger.",
    cadence: "Weekly recurring audit or manual run.",
    overview:
      "Audits the full sales pipeline for conversion drop-offs, calculates financial revenue leakage, ranks bottleneck severity, and generates actionable fix reports.",
    workflow: [
      "Aggregates booking-to-attendance and attendance-to-close metrics across CRM & ad platforms.",
      "Computes stage-by-stage percentage drop-offs and identifies core conversion leaks.",
      "Calculates estimated monthly revenue lost per bottleneck stage.",
      "Evaluates alert rules and dispatches breach warnings to Slack when thresholds are crossed.",
    ],
    deliverables: [
      "Comprehensive Funnel Audit report",
      "Slack alert breach notifications",
      "Actionable bottleneck remediation plan",
    ],
  },
];

/* --- Visual Showcase Components --- */

function VisualCardSetup() {
  return (
    <div className="aspect-video w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-4 font-sans text-xs flex flex-col justify-between select-none overflow-hidden shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-amber-400" />
          <span className="font-bold text-white text-[11px]">Client Setup (pin-down)</span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
          Active
        </span>
      </div>

      <div className="space-y-2 py-1">
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Webhook size={12} className="text-teal-400" /> Push Webhook
          </span>
          <span className="text-white font-mono text-[10px]">Calendly Connected</span>
        </div>

        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-[11px]">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Check size={12} className="text-amber-400" /> Brand Voice
          </span>
          <span className="text-amber-300 font-mono text-[10px]">Profile Extracted</span>
        </div>
      </div>

      <div className="bg-zinc-900/80 border border-zinc-800 p-2 rounded-lg flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span>Confirmation Page:</span>
        <span className="text-teal-400 truncate max-w-[140px]">/confirm/live-pass</span>
      </div>
    </div>
  );
}

function VisualCardExecution() {
  return (
    <div className="aspect-video w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-4 font-sans text-xs flex flex-col justify-between select-none overflow-hidden shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Slack size={14} className="text-indigo-400" />
          <span className="font-bold text-white text-[11px]">Briefs &amp; Intro (pile-on / pre-call)</span>
        </div>
        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded">
          Real-Time
        </span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-white font-bold flex items-center gap-1">
            <UserCheck size={11} className="text-indigo-400" /> Marcus Vance
          </span>
          <span className="text-zinc-500">Apex Media</span>
        </div>
        <p className="text-[10.5px] text-zinc-300 line-clamp-2 leading-relaxed">
          &quot;Verified LinkedIn match. Pain point: high customer acquisition costs. Ready to switch platforms.&quot;
        </p>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono bg-zinc-900/60 p-2 rounded border border-zinc-800/60">
        <span className="text-zinc-400">Claude Personalization:</span>
        <span className="text-emerald-400 font-semibold">Delivered in 2.1s</span>
      </div>
    </div>
  );
}

function VisualCardRecovery() {
  return (
    <div className="aspect-video w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-4 font-sans text-xs flex flex-col justify-between select-none overflow-hidden shadow-inner">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-emerald-400" />
          <span className="font-bold text-white text-[11px]">Funnel &amp; Win-Back (leak-map)</span>
        </div>
        <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
          Recovery Active
        </span>
      </div>

      <div className="space-y-2 py-1">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-zinc-400">
            <span>Show-Up Conversion</span>
            <span className="text-emerald-400 font-bold">84%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full w-[84%]" />
            <div className="bg-rose-500 h-full w-[16%]" />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-center justify-between text-[10.5px] font-mono">
          <span className="text-zinc-300">16% Cold Prospects:</span>
          <span className="text-rose-400 font-semibold">Auto-Enrolled (30d)</span>
        </div>
      </div>

      <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800/60 flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span>Reschedule Link:</span>
        <span className="text-teal-400">Single-Use Fresh URL</span>
      </div>
    </div>
  );
}

export default async function ShowtimePackagePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const overview = await getPackageOverview(whopUserId);

  return (
    <div className="w-full space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Back to All Packages" />

      {/* Main Marketplace Card Header - Full Width */}
      <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-6 sm:p-8 space-y-8 shadow-sm">
        {/* Header Row */}
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

        {/* 3 Logical Feature Gallery Visuals */}
        <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800/80 space-y-4">
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider font-mono">
            Platform Capabilities &amp; System Previews
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <VisualCardSetup />
            <VisualCardExecution />
            <VisualCardRecovery />
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

      {/* Exhaustive Skill Execution Playbook */}
      <div className="space-y-6 pt-2">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
            Comprehensive Skill Execution Playbook
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Operational guide detailing execution triggers, automated workflows, and expected outputs for each skill in this suite.
          </p>
        </div>

        <div className="space-y-6">
          {DETAILED_SKILL_PLAYBOOKS.map((playbook, idx) => {
            const overviewSkill = overview.skills.find((s) => s.skillId === playbook.id);
            const manifest = SKILL_MANIFEST[playbook.id as keyof typeof SKILL_MANIFEST];
            const PlaybookIcon = playbook.icon;

            return (
              <div
                key={playbook.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/30 p-6 space-y-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${playbook.accentColor}`}>
                      <PlaybookIcon size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400 font-semibold">0{idx + 1}.</span>
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                          {manifest.name}
                        </h3>
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                          {playbook.id}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {playbook.overview}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-xs font-mono text-zinc-500 dark:text-zinc-400 self-start sm:self-auto">
                    <span className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                      {playbook.badge}
                    </span>
                    {overviewSkill && (
                      <div className="flex items-center gap-3 border-l border-zinc-200 dark:border-zinc-800 pl-4">
                        <div>
                          <span className="text-zinc-400 block text-[9px] uppercase">Active</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{overviewSkill.activeClients} clients</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 block text-[9px] uppercase">Pass Rate</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {overviewSkill.successRate !== null ? `${overviewSkill.successRate}%` : "—"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid Details */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Triggers & Cadence */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={13} className="text-teal-500" /> Trigger &amp; Cadence
                    </h4>
                    <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <div>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-300 block">How it runs:</span>
                        <p className="mt-0.5 leading-relaxed">{playbook.trigger}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-300 block">Frequency:</span>
                        <p className="mt-0.5 leading-relaxed">{playbook.cadence}</p>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Steps */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal size={13} className="text-indigo-500" /> Automated Workflow
                    </h4>
                    <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {playbook.workflow.map((step, sIdx) => (
                        <li key={sIdx} className="flex items-start gap-2 leading-relaxed">
                          <span className="text-indigo-500 font-mono text-[10px] mt-0.5 shrink-0">0{sIdx + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Expected Deliverables */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={13} className="text-emerald-500" /> Expected Deliverables
                    </h4>
                    <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {playbook.deliverables.map((item, dIdx) => (
                        <li key={dIdx} className="flex items-center gap-2">
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Link
                    href={`/dashboard/modules/${playbook.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                  >
                    View All Client Runs for {manifest.name} <ArrowRight size={12} />
                  </Link>
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