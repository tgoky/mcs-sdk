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

import { SKILL_MANIFEST, SKILL_IDS, type SkillId } from "@/lib/skill-manifest";

export const SKILLS = SKILL_IDS;

export type SkillName = SkillId;

// Finding A fix (2026-08-07 handoff) — `name` is no longer authored here;
// it's read straight from SKILL_MANIFEST (skill-manifest.ts), the single
// source of truth for display names. `description` stays independently
// authored in this file on purpose: these are short dashboard blurbs for
// a different audience than skill-manifest.ts's longer technical
// descriptions (consumed by the engagement detail page's Skills panel) —
// the drift Finding A flagged was specifically the *name* rendering three
// different ways, not the descriptions serving different UI contexts.
export const SKILL_INFO: Record<SkillName, { name: string; description: string }> = {
  "pin-down": {
    name: SKILL_MANIFEST["pin-down"].name,
    description: "Sets up a new client account and onboarding flow.",
  },
  "pile-on": {
    name: SKILL_MANIFEST["pile-on"].name,
    description: "Runs a pre-call email and SMS sequence for every new booking.",
  },
  "pre-call-read": {
    name: SKILL_MANIFEST["pre-call-read"].name,
    description: "Sends your team a quick briefing before every call.",
  },
  "win-back": {
    name: SKILL_MANIFEST["win-back"].name,
    description: "Re-engages prospects who no-showed or went cold.",
  },
  "leak-map": {
    name: SKILL_MANIFEST["leak-map"].name,
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

export type ModuleStatus = "live" | "running" | "failed" | "not_run" | "paused";

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  live: "Healthy",
  running: "In progress",
  failed: "Needs attention",
  not_run: "Not started yet",
  // Distinct from "disabled": the skill itself is still turned ON, it's the
  // whole client/engagement that's on hold, so nothing will actually fire.
  paused: "Paused",
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
  success: "text-status-success font-medium",
  failed: "text-status-error",
  running: "text-sky-600 dark:text-sky-400 italic",
  cancelled: "text-status-neutral",
  timed_out: "text-status-neutral",
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

/**
 * Solid-fill dot color for a run status — a genuinely separate concern
 * from runStatusColor above (that one returns a *text* color class; a
 * status dot needs a *background-fill* class, and rose-400/emerald-400
 * read fine as small fills even where they're not used as text color
 * post-defect-#1). Previously global-search.tsx string-sniffed
 * runStatusColor's return value (`.includes("ink")`, `.includes("rose")`)
 * to guess a dot color — that broke the moment defect #1's fix renamed
 * those classes, and was fragile before that too (two components quietly
 * relying on exact substrings of each other). This is the single source
 * for both now.
 */
export const RUN_STATUS_DOT_COLORS: Record<string, string> = {
  success: "bg-emerald-400",
  failed: "bg-rose-400",
  running: "bg-sky-400",
  cancelled: "bg-zinc-400",
  timed_out: "bg-zinc-400",
};

export function runStatusDotColor(status: string | null | undefined): string {
  if (!status) return RUN_STATUS_DOT_COLORS.running;
  return RUN_STATUS_DOT_COLORS[status.toLowerCase()] ?? RUN_STATUS_DOT_COLORS.running;
}

// ---------------------------------------------------------------------------
// Call intelligence session status (conversationIntelligenceSessions.status —
// mirrors Recall.ai's own bot.status_change vocabulary loosely; see the
// mapping in src/app/api/recall/route.ts)
// ---------------------------------------------------------------------------

export const CALL_SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: "Bot scheduled",
  joining: "Bot joining",
  in_call: "In call",
  // Win-Back no-show gap fix — the call has ended but the transcript
  // isn't processed yet; see subCode for why it ended (docs.recall.ai/docs/sub-codes).
  call_ended: "Call ended",
  done: "Processed",
  failed: "Failed",
};

export const CALL_SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: "text-status-neutral",
  joining: "text-sky-600 dark:text-sky-400 italic",
  in_call: "text-sky-600 dark:text-sky-400 italic",
  call_ended: "text-status-neutral",
  done: "text-status-success font-medium",
  failed: "text-status-error",
};

/** Friendly call-intelligence-session-status word, with a safe fallback. */
export function callSessionStatusLabel(status: string | null | undefined): string {
  if (!status) return "Scheduled";
  return CALL_SESSION_STATUS_LABELS[status] ?? status;
}

export function callSessionStatusColor(status: string | null | undefined): string {
  if (!status) return CALL_SESSION_STATUS_COLORS.scheduled;
  return CALL_SESSION_STATUS_COLORS[status] ?? CALL_SESSION_STATUS_COLORS.scheduled;
}

// ---------------------------------------------------------------------------
// Phase labels
// ---------------------------------------------------------------------------

export const PHASE_LABELS: Record<string, string> = {
  // Shared across all skills
  run_started: "Run started",

  // Client Setup (pin-down)
  onboarding_start: "Starting setup",
  credential_storage: "Saving your account keys",
  voice_scrape: "Reading your website for brand voice",
  voice_extraction: "Learning your brand voice",
  engagement_upsert: "Creating your account",
  webhook_registration: "Connecting your booking calendar",
  redirect_config: "Setting up your confirmation page",
  script_pack: "Writing your video scripts",
  sms_sequence: "Writing your SMS follow-up sequence",
  ad_creative_briefs: "Generating your ad creative briefs",
  pile_on_sequence_audit: "Reviewing your existing follow-up sequence",
  leak_map_existing_audit: "Comparing your existing report against Leak Map",
  notification_pack_activation: "Turning on your alerts",
  existing_page_audit: "Reviewing your existing confirmation page",
  confirmation_page_deploy: "Publishing your confirmation page",

  // Follow-Up Sequences (pile-on)
  pile_on_enrollment: "Adding lead to follow-up sequence",
  hybrid_synthesis: "Personalizing your follow-up message",
  sms_enrollment: "Adding lead to SMS follow-up",
  ad_data_cohort: "Updating your ad audience list",

  // Win-Back (triggered from pile-on's enrollment flow, and its own
  // recovery-service.ts)
  recovery_enrollment: "Adding lead to win-back sequence",
  cadence_generation: "Building the recovery sequence",
  reply_detection_setup: "Setting up reply tracking",
  reschedule_link: "Creating a fresh booking link",
  win_back_exit_signal: "Watching for a reply or new booking",
  win_back_hybrid: "Personalizing the win-back message",
  win_back_sms: "Sending the win-back text",
  win_back_email_smtp: "Sending the win-back email",
  recovered_tagger: "Tagging the recovered lead in your CRM",

  // Pre-Call Briefs (pre-call-read)
  roster_fetch: "Checking today's calls",
  duplicate_check: "Checking for a duplicate brief",
  rule_14_gate: "Reviewing call eligibility",
  prospect_research: "Researching the prospect",
  brief_synthesis: "Writing your call brief",
  delivery: "Sending the brief to your team",
  conversation_intelligence: "Setting up call recording",

  // Funnel Health Check (leak-map)
  stage_1_data_pull: "Pulling your account data",
  stage_2_compute: "Crunching the numbers",
  stage_4_severity: "Flagging the biggest issues",
  stage_5_report: "Writing your report",
  report_delivery: "Sending your report",

  // Shared / webhooks
  webhook_received: "New booking received",
  booking_roster: "Syncing your booking calendar",
  skill_disabled: "Skipped — module turned off",
};

/** Friendly phase description for a raw phase string, with a safe fallback. */
export function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return "Getting started";
  return PHASE_LABELS[phase] ?? "In progress";
}

// ---------------------------------------------------------------------------
// Platform Codenames
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
  smtp: "Direct Send — no CRM (Resend or SMTP)",
};

export const HOSTING_PLATFORM_LABELS: Record<string, string> = {
  nextjs_vercel: "Next.js on Vercel",
  webflow: "Webflow",
  ghl: "GoHighLevel",
  wordpress: "WordPress",
  lovable: "Lovable",
  plain_html: "Plain HTML site",
  discover_from_docs: "Something else (research + review)",
};

export const SMS_PLATFORM_LABELS: Record<string, string> = {
  twilio: "Twilio",
  ghl_sms: "GoHighLevel SMS",
  hubspot_sms: "HubSpot SMS",
  none: "Not tracked",
};

export const AD_DATA_PLATFORM_LABELS: Record<string, string> = {
  hyros: "Hyros",
  native_crm: "Tag on existing CRM (no separate platform)",
  google_sheets: "Google Sheets",
  none: "Not connected",
};

export const BRIEF_DESTINATION_LABELS: Record<string, string> = {
  slack: "Slack message",
  crm_note: "Note in your CRM",
};

// Win-Back exitReason — winBackEnrollments.exitReason, "why did this
// enrollment stop" as distinct from the status it stopped in. Previously
// rendered raw ("window_elapsed", "outcome_corrected_to_showed") straight
// from the database in the Win-Back drawer.
export const EXIT_REASON_LABELS: Record<string, string> = {
  rebooked: "Booked a new call",
  reply_detected: "Replied to an outreach message",
  window_elapsed: "Recovery window ended",
  outcome_corrected_to_showed: "Marked as showed (correction)",
};

// Pile-On sentVia — pileOnSendLog.sentVia, which of the two internal
// personalization paths handled Email 1: the AI path, or a safe
// non-personalized fallback used when that path fails. "hybrid"/"fallback"
// are implementation vocabulary, not something a buyer should have to
// decode; this is the difference they actually care about.
export const SENT_VIA_LABELS: Record<string, string> = {
  hybrid: "AI-personalized",
  fallback: "Standard template (AI personalization unavailable)",
};

// Leak-Map runType — auditRunsLog.runType, which cadence produced this
// audit. Previously rendered raw ("weekly audit", "monthly audit" via CSS
// capitalize) — capitalize only fixes the first letter, so this was
// already mostly readable by luck, but goes through the same lookup
// convention as everything else here now rather than relying on that.
export const AUDIT_RUN_TYPE_LABELS: Record<string, string> = {
  weekly: "Weekly audit",
  monthly: "Monthly audit",
};

// Pile-On ad creative brief pillars — engagements.adCreativeBriefs.briefs[].pillar,
// generated once by ad-creative-briefs.ts at Pin-Down onboarding.
export const AD_CREATIVE_PILLAR_LABELS: Record<string, string> = {
  common_questions: "Common Question",
  deeper_questions: "Deeper Question",
  success_proof: "Proof & Results",
  objections: "Objection Handling",
};

export const CONVERSATION_INTELLIGENCE_PROVIDER_LABELS: Record<string, string> = {
  recall_ai: "Recall.ai",
  none: "Not connected",
};

// ---------------------------------------------------------------------------
// Queue copy
// ---------------------------------------------------------------------------

export const ACTION_TYPE_LABELS: Record<string, string> = {
  webhook_enrollment: "Enroll prospect from booking webhook",
  cohort_membership_add: "Add prospect to cohort",
  cohort_membership_remove: "Remove prospect from cohort",
  confirmation_page_deploy: "Confirmation page ready — approve to publish",
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

// ---------------------------------------------------------------------------
// Table toolbar copy
// ---------------------------------------------------------------------------

export const TABLE_TOOLBAR_COPY = {
  customizeMenuTitle: "Add to this view",
  filtersSectionLabel: "Filters",
  statsSectionLabel: "Stats",
  displaySectionLabel: "Display",
  groupRepeatsLabel: "Group repeated items",
  noResultsTitle: "Nothing matches your filters",
  noResultsSubtitle: "Try a different tab, time range, or clear your search.",
  clearFiltersButton: "Clear filters",
  pageSizeLabel: (n: number) => `${n}/page`,
};

export const QUEUE_TOOLBAR_COPY = {
  tabs: {
    all: "All",
    approve: "Needs approval",
    action_needed: "Action needed",
    alerts: "Alerts",
  } as Record<string, string>,
  searchPlaceholder: "Search by client, title, or module...",
  chips: {
    needsAttention: "Needs attention",
    priorityHigh: "High priority",
    priorityMedium: "Medium priority",
    priorityLow: "Low priority",
    credentialIssues: "Credential issues",
    autoDiagnosed: "Auto-diagnosed",
    pausedClients: "Paused clients",
    fyiOnly: "FYI only",
  },
  chipSections: {
    priority: "Priority",
    diagnosis: "Diagnosis",
    platform: "Platform area",
    account: "Account",
  },
  platformAreaLabels: {
    booking: "Booking",
    email: "Email / CRM",
    sms: "SMS",
    hosting: "Hosting",
    ad_data: "Ad data",
  } as Record<string, string>,
};

// ---------------------------------------------------------------------------
// Client rail — the "All / Clients" scope switch that sits to the left of
// the Queue and Live Executions tables (see components/client-rail.tsx).
// "All" is the existing flat, unfiltered list. "Clients" reveals a
// searchable roster; picking one scopes the table to that client alone.
// ---------------------------------------------------------------------------

export const CLIENT_RAIL_COPY = {
  scopeTabs: {
    all: "All",
    clients: "Clients",
  },
  allClientsRow: "All clients",
  searchPlaceholder: "Search clients...",
  addClientLabel: "Add a client",
  emptyState: "No clients yet.",
  noMatches: "No clients match your search.",
  pausedBadge: "Paused",
  backToAllClients: "All clients",
  allModeBlurb: (n: number) => `Showing every item across all ${n} client${n === 1 ? "" : "s"}. Switch to Clients to focus on one.`,
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

/** Friendly hosting-platform name, with a safe fallback. */
export function hostingPlatformLabel(raw: string | null | undefined): string {
  if (!raw) return "Not connected yet";
  return HOSTING_PLATFORM_LABELS[raw] ?? raw;
}

/** Friendly SMS-platform name, with a safe fallback. */
export function smsPlatformLabel(raw: string | null | undefined): string {
  if (!raw) return "Not connected yet";
  return SMS_PLATFORM_LABELS[raw] ?? raw;
}

/** Friendly ad-data-platform name, with a safe fallback. */
export function adDataPlatformLabel(raw: string | null | undefined): string {
  if (!raw) return "Not connected yet";
  return AD_DATA_PLATFORM_LABELS[raw] ?? raw;
}

/** Friendly conversation-intelligence-provider name, with a safe fallback. */
export function conversationIntelligenceProviderLabel(raw: string | null | undefined): string {
  if (!raw || raw === "none") return "Not connected";
  return CONVERSATION_INTELLIGENCE_PROVIDER_LABELS[raw] ?? raw;
}

/** Friendly brief-delivery-destination name, with a safe fallback. */
export function briefDestinationLabel(raw: string | null | undefined): string {
  if (!raw) return "Not delivered yet";
  return BRIEF_DESTINATION_LABELS[raw] ?? raw;
}

/** Friendly reason a Win-Back enrollment stopped, with a safe fallback. */
export function exitReasonLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return EXIT_REASON_LABELS[raw] ?? raw;
}

/** Friendly description of which send path delivered a message, with a safe fallback. */
export function sentViaLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  return SENT_VIA_LABELS[raw] ?? raw;
}

/** Friendly audit cadence name, with a safe fallback. */
export function auditRunTypeLabel(raw: string | null | undefined): string {
  if (!raw) return "Audit";
  return AUDIT_RUN_TYPE_LABELS[raw] ?? `${raw} audit`;
}

/** Friendly ad-creative-brief pillar name, with a safe fallback. */
export function adCreativePillarLabel(raw: string | null | undefined): string {
  if (!raw) return "Ad Brief";
  return AD_CREATIVE_PILLAR_LABELS[raw] ?? raw;
}

// briefOutcomeLog.source — which of the four resolution paths confirmed a
// call's outcome. "auto_sweep" is context-dependent: crons.ts's
// assumed-no-show sweep defaults every unresolved call to "no_show" and
// only flips to "showed" when crm-activity-check.ts's
// hasPostCallCrmActivity finds real post-call CRM activity — so the same
// source string means two different things depending on the outcome it's
// paired with. Takes the outcome alongside the source rather than a flat
// lookup, so this can't misrepresent an assumed no-show as a checked one.
export function outcomeSourceLabel(source: string | null | undefined, outcome: string | null | undefined): string {
  if (!source) return "";
  switch (source) {
    case "dashboard":
      return "Confirmed by your team";
    case "slack":
      return "Confirmed via Slack";
    case "recall_bot":
      return "Confirmed automatically from the call recording";
    case "auto_sweep":
      return outcome === "showed"
        ? "Confirmed automatically — activity found in your CRM"
        : "Assumed no-show — no activity found after the scheduled time";
    default:
      return "Confirmed automatically";
  }
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
    activeAccountsPaused: (n: number) => `${n} paused`,
    automatedActions: "Tasks Completed",
    automatedActionsThisWeek: "This Week",
    automatedActionsUnit: "tasks",
    automatedActionsAllTime: (n: number) => `${n.toLocaleString()} all-time`,
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
// Home / workspace hub copy
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
    id: "reputation-manager",
    name: "Reputation Manager",
    description:
      "Monitors what AI engines, Trustpilot, and Reddit say about your business, and pages you the moment something crosses into crisis territory.",
    href: "/dashboard/reputation-manager",
    status: "available",
  },
];

// ---------------------------------------------------------------------------
// Run detail page copy
// ---------------------------------------------------------------------------

export const RUN_DETAIL_COPY = {
  pageTitleSuffix: "run",
  stepsSectionTitle: "Steps",
  summarySectionTitle: "Summary",
  errorSectionTitle: "What went wrong",
  noStepsRecorded: "No steps were recorded for this run.",
  awaitingFirstStep: "Waiting on the first step…",
  noSummaryRecorded:
    "No summary was recorded for this run. Re-triggering the module will produce a full summary going forward.",
  nextStepCompiling: "Next step…",
  summaryFields: {
    whatWasAttempted: "What was attempted",
    whatWorked: "What worked",
    whatFailed: "What failed",
    openItems: "Open items",
    decisionsMade: "Decisions made",
  },
  noFailuresNote: "No errors during this run.",
};

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

export const EXECUTIONS_TOOLBAR_COPY = {
  title: "Live Executions",
  allExecutionsTitle: "All Executions",
  tabs: {
    all: "All",
    running: "Running",
    needs_attention: "Needs attention",
    completed: "Completed",
  } as Record<string, string>,
  searchPlaceholder: "Search by client, module, or detail...",
  chips: {
    cancelled: "Cancelled runs",
    pausedClients: "Paused clients",
    longRunning: "Long-running (10m+)",
  },
  chipSections: {
    module: "Module",
    status: "Status",
    account: "Account",
  },
  stats: {
    showSuccessRate: "Show success rate",
    showModuleBreakdown: "Show breakdown by module",
  },
  successRateSuffix: (n: number) => `success   last ${n} finished`,
};
