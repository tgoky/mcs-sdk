// =============================================================================
// CENTRAL COPY FILE
//
// Every plain-language label, name, status word, and description shown to
// users in the dashboard should live here, not be written inline in a page
// or component. If you want to rename a module, change a status word, or
// fix a confusing phrase, do it ONCE in this file and it updates everywhere.
//
// Rule of thumb: if a database value (status, phase, skillName, etc.) is
// ever rendered on screen, it should be looked up in this file first --
// never printed raw.
// =============================================================================

// ---------------------------------------------------------------------------
// Modules (the five automations users can run)
// ---------------------------------------------------------------------------

export const SKILLS = [
  "pin-down",
  "pile-on",
  "pre-call-read",
  "win-back",
  "leak-map",
] as const;

export type SkillName = (typeof SKILLS)[number];

export const SKILL_INFO: Record<SkillName, { name: string; description: string }> = {
  "pin-down": {
    name: "Pin Down",
    description: "Sets up a new client account and onboarding flow.",
  },
  "pile-on": {
    name: "Pile On",
    description: "Runs a pre-call email and SMS sequence for every new booking.",
  },
  "pre-call-read": {
    name: "Pre-Call Read",
    description: "Sends your team a quick briefing before every call.",
  },
  "win-back": {
    name: "Win-Back",
    description: "Re-engages prospects who no-showed or went cold.",
  },
  "leak-map": {
    name: "Leak Map",
    description: "Weekly check for where you're losing customers in the funnel.",
  },
};

/** Friendly module name for a skill codename, with a safe fallback. */
export function skillName(raw: string | null | undefined): string {
  if (!raw) return "Unknown module";
  return SKILL_INFO[raw as SkillName]?.name ?? raw;
}

// ---------------------------------------------------------------------------
// Overall module status (per-client module cards)
// ---------------------------------------------------------------------------

export type ModuleStatus = "live" | "failed" | "not_run";

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  live: "Running fine",
  failed: "Needs attention",
  not_run: "Not started yet",
};

export const MODULE_STATUS_COLORS: Record<ModuleStatus, string> = {
  live: "text-emerald-400",
  failed: "text-rose-400",
  not_run: "text-zinc-600",
};

// ---------------------------------------------------------------------------
// Individual run status (run-history tables, activity feed)
// ---------------------------------------------------------------------------

export const RUN_STATUS_LABELS: Record<string, string> = {
  success: "Done",
  failed: "Failed",
  running: "In progress",
   cancelled: "Cancelled",
  timed_out: "Timed out",
};

export const RUN_STATUS_COLORS: Record<string, string> = {
  success: "text-emerald-400 font-medium",
  failed: "text-rose-400",
  running: "text-zinc-400 italic",
  cancelled: "text-amber-400",
  timed_out: "text-amber-400",
};

/** Friendly run-status word for a raw status string, with a safe fallback. */
export function runStatusLabel(status: string | null | undefined): string {
  if (!status) return "In progress";
  return RUN_STATUS_LABELS[status.toLowerCase()] ?? "In progress";
}

export function runStatusColor(status: string | null | undefined): string {
  if (!status) return RUN_STATUS_COLORS.running;
  return RUN_STATUS_COLORS[status.toLowerCase()] ?? RUN_STATUS_COLORS.running;
}

// ---------------------------------------------------------------------------
// Phase labels
//
// Internal step names get stored in the database exactly as engineers wrote
// them (e.g. "stage_5_report", "hybrid_synthesis"). These should NEVER be
// shown to a user raw. Always run them through `phaseLabel()` below.
//
// If a new phase gets added to the backend and someone forgets to add it
// here, it falls back to a generic "In progress" instead of leaking an
// internal codename onto the screen.
// ---------------------------------------------------------------------------

export const PHASE_LABELS: Record<string, string> = {
  // Shared across all skills
  run_started: "Run started",

  // Client Setup (pin-down)
  onboarding_start: "Starting setup",
  credential_storage: "Saving your account keys",
  voice_extraction: "Learning your brand voice",
  engagement_upsert: "Creating your account",
  webhook_registration: "Connecting your booking calendar",
  redirect_config: "Setting up your confirmation page",

  // Follow-Up Sequences (pile-on)
  pile_on_enrollment: "Adding lead to follow-up sequence",
  hybrid_synthesis: "Personalizing your follow-up message",
  recovery_enrollment: "Adding lead to win-back sequence",

  // Pre-Call Briefs (pre-call-read)
  roster_fetch: "Checking today's calls",
  duplicate_check: "Checking for a duplicate brief",
  rule_14_gate: "Reviewing call eligibility",
  brief_synthesis: "Writing your call brief",
  delivery: "Sending the brief to your team",

  // Funnel Health Check (leak-map)
  stage_1_data_pull: "Pulling your account data",
  stage_2_compute: "Crunching the numbers",
  stage_4_severity: "Flagging the biggest issues",
  stage_5_report: "Writing your report",

  // Shared / webhooks
  webhook_received: "New booking received",
};

/** Friendly phase description for a raw phase string, with a safe fallback. */
export function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return "Getting started";
  return PHASE_LABELS[phase] ?? "In progress";
}

// ---------------------------------------------------------------------------
// Friendly names for the platform codenames stored on each client account.
// Used in the setup wizard, the engagements list, and the engagement detail
// page. Edit a name here and it updates everywhere.
// ---------------------------------------------------------------------------

export const BOOKING_PLATFORM_LABELS: Record<string, string> = {
  calendly: "Calendly",
  cal_com: "Cal.com",
  ghl_calendar: "GoHighLevel Calendar",
  oncehub: "OnceHub",
  discover_from_docs: "Something else (research + review)",
};

export const EMAIL_PLATFORM_LABELS: Record<string, string> = {
  klaviyo: "Klaviyo",
  hubspot: "HubSpot",
  activecampaign: "ActiveCampaign",
  ghl: "GoHighLevel",
  mailchimp: "Mailchimp",
  convertkit: "ConvertKit",
  smtp: "Custom SMTP",
};

export const HOSTING_PLATFORM_LABELS: Record<string, string> = {
  nextjs_vercel: "Next.js on Vercel",
  webflow: "Webflow",
  ghl: "GoHighLevel",
  wordpress: "WordPress",
  plain_html: "Plain HTML site",
  discover_from_docs: "Something else (research + review)",
};

export const BRIEF_DESTINATION_LABELS: Record<string, string> = {
  slack: "Slack message",
  crm_note: "Note in your CRM",
};

// ---------------------------------------------------------------------------
// Queue copy — see src/lib/queue.ts. These translate the raw
// pending_actions.action_type and human_blockers.blocker_type enum values
// (see the comments above those columns in src/models/schema.ts) into what
// a human should actually read on the queue panel and sidebar badge.
// ---------------------------------------------------------------------------

export const ACTION_TYPE_LABELS: Record<string, string> = {
  webhook_enrollment: "Enroll prospect from booking webhook",
  cohort_membership_add: "Add prospect to cohort",
  cohort_membership_remove: "Remove prospect from cohort",
};

export const BLOCKER_TYPE_LABELS: Record<string, string> = {
  video_recording: "Video recording needed",
  a2p_10dlc_approval: "A2P 10DLC approval pending",
  editor_hire: "Editor needs to be hired",
  credential_grant: "Credential access needed",
  buyer_content_approval: "Waiting on your content approval",
  other: "Needs your attention",
};

export const QUEUE_COPY = {
  sectionTitle: "Queue",
  sectionSubtitle: "Ranked by priority — the top item needs you first.",
  emptyState: "Nothing waiting on you right now.",
  sidebarLabel: "Queue",
  categoryLabels: {
    approve: "Approve",
    action_needed: "Needs action",
    alert: "Alert",
    fyi: "FYI",
  } as Record<string, string>,
  actions: {
    approve: "Approve",
    reject: "Reject",
    resolve: "Resolve",
    dismiss: "Dismiss",
    open: "Open",
  },
  errors: {
    adminOnly: "Admin access required.",
    generic: "Something went wrong — try again.",
  },
};

/** Friendly booking-platform name, with a safe fallback. */
export function bookingPlatformLabel(raw: string | null | undefined): string {
  if (!raw) return "Not connected yet";
  return BOOKING_PLATFORM_LABELS[raw] ?? raw;
}

/** Friendly email-platform name, with a safe fallback. */
export function emailPlatformLabel(raw: string | null | undefined): string {
  if (!raw) return "Not connected yet";
  return EMAIL_PLATFORM_LABELS[raw] ?? raw;
}

// ---------------------------------------------------------------------------
// Dashboard page copy
// ---------------------------------------------------------------------------

export const DASHBOARD_COPY = {
  pageTitle: "Dashboard",
  pageSubtitle: "A quick look at your accounts and what's running right now.",
  accountsLink: "Accounts",
  credentialsLink: "Credentials",
  newClientButton: "Add a New Client",
  overviewSectionTitle: "Overview",
  activityLogSectionTitle: "Recent Activity",
  noActivityYet:
    "Nothing has run yet — once you add a client, activity will show up here.",
  stat: {
    activeAccounts: "Active Accounts",
    activeAccountsAllGood: "All good",
    activeAccountsRunning: (n: number) => `${n} in progress`,
    automatedActions: "Tasks Completed",
    automatedActionsUnit: "tasks",
    systemIntegrity: "Issues",
    systemIntegrityClear: "No issues",
    systemIntegrityFound: "Needs attention",
  },
  shortcuts: {
    manageEngagements: {
      title: "Manage Your Clients",
      description: "View and update each client's account and settings.",
    },
    manageCredentials: {
      title: "Manage Credentials",
      description: "Add, update, or remove your connected account keys.",
    },
  },
};

// ---------------------------------------------------------------------------
// Home / workspace hub copy (src/app/home/page.tsx)
//
// This is the landing page every authenticated buyer sees before picking a
// product. Keep the voice identical to DASHBOARD_COPY above — plain,
// second-person, no internal codenames or system-status jargon.
// ---------------------------------------------------------------------------

export type WorkspaceStatus = "available" | "coming_soon";

export interface WorkspaceProduct {
  id: string;
  name: string;
  description: string;
  href: string;
  status: WorkspaceStatus;
}

export const HOME_COPY = {
  eyebrow: "Workspace",
  title: "Your products",
  subtitle: "Pick a product to open its dashboard.",
  signOut: "Sign out",
  footerNote: "Mudd Ventures",
  statusLabels: {
    available: "Available",
    coming_soon: "Coming soon",
  } as Record<WorkspaceStatus, string>,
  openLabel: "Open",
  comingSoonLabel: "Coming soon",
};

/**
 * Every product the workspace hub can link to. Add an object here to add
 * a new tile — nothing else in the page needs to change.
 */
export const WORKSPACE_PRODUCTS: WorkspaceProduct[] = [
  {
    id: "showtime",
    name: "Showtime",
    description:
      "Sales execution for your booked calls — client setup, follow-up sequences, call briefs, win-back, and funnel health, all in one place.",
    href: "/dashboard",
    status: "available",
  },
  {
    id: "counter-claim",
    name: "Counter Claim",
    description:
      "Automated dispute responses for chargebacks — evidence packs and alerts generated as disputes come in.",
    href: "/counter-claim",
    status: "coming_soon",
  },
];

// ---------------------------------------------------------------------------
// Live activity feed copy
// ---------------------------------------------------------------------------

export const ACTIVITY_FEED_COPY = {
  emptyTitle: "No activity yet.",
  emptySubtitle: "Once a module runs, you'll see it here in real time.",
  liveLabel: "Live",
  pausedLabel: "Paused",
  lastUpdatedPrefix: "Last updated ",
  pauseButton: "Pause updates",
  resumeButton: "Resume updates",
  columnClient: "Client",
  columnModule: "Module",
  columnStep: "Current Step",
  columnStatus: "Status",
  columnTime: "Time",
};

