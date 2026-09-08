// src/lib/skill-playbooks.ts
//
// Real per-skill copy (overview/trigger/cadence/workflow/deliverables),
// ported verbatim from the pre-two-tier Library page
// (src/app/dashboard/library/showtime/page.tsx as of commit afcb504) —
// not new marketing copy invented for this rebuild. Scoped to Showtime's
// 5 skills on purpose: that's the only copy that was ever actually
// written and shipped. Reputation Manager's 6 skills have no equivalent
// yet, so they're simply absent here rather than backfilled with
// something nobody wrote or verified — product-detail-client.tsx falls
// back to a plainer row (name/description/live stats only) for any
// worker with no entry, instead of pretending this exists for it.
//
// image paths point at the same public/images/*.jpeg screenshots the
// old MediaGallery used — untouched since, still on disk.

import type { WorkerId } from "@/lib/worker-registry";

export interface SkillPlaybook {
  badge: string;
  image: string;
  trigger: string;
  cadence: string;
  overview: string;
  workflow: string[];
  deliverables: string[];
}

export const SKILL_PLAYBOOKS: Partial<Record<WorkerId, SkillPlaybook>> = {
  "pin-down": {
    badge: "Setup Bridge (Onboarding)",
    image: "/images/sts.jpeg",
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
  "pile-on": {
    badge: "Real-Time Event Stream",
    image: "/images/prec.jpeg",
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
  "pre-call-read": {
    badge: "Scheduled & Dynamic Batch",
    image: "/images/cabr.jpeg",
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
  "win-back": {
    badge: "Recovery Cadence Engine",
    image: "/images/brec.jpeg",
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
  "leak-map": {
    badge: "Pipeline Diagnostics",
    image: "/images/fudit.jpeg",
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
};
