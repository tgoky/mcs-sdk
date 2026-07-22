import type { FormData, Step } from "./types";

// Wizard step order. IMPORTANT: "credentials" (API keys) must come before
// any step that renders a dropdown whose options are fetched live using
// one of those keys (Klaviyo lists, GHL locations/workflows, ActiveCampaign
// lists — see credentials-step.tsx). Reordering this array without also
// checking use-email-integrations.ts / credentials-step.tsx is how this
// broke before: the fetch-on-key-entry effects don't care what step you're
// on, but the dropdowns that display their results only render inside the
// "credentials" step, so if a step that *needs* the key comes before
// "credentials", there's no key yet to fetch with.
export const STEPS: { id: Step; label: string }[] = [
  { id: "offer", label: "Your Offer" },
  { id: "stack", label: "Connect Your Tools" },
  { id: "credentials", label: "Account Keys" },
  { id: "voice", label: "Your Brand Voice" },
  { id: "confirm", label: "Review & Finish" },
];

export const DEFAULT_FORM: FormData = {
  engagementId: "",
  buyerName: "",
  offerName: "",
  offerPrice: "",
  offerIcp: "",
  trafficTemperature: "warm",
  hybridMode: false,
  bookingPlatform: "calendly",
  bookingLocationId: "",
  bookingStandingLink: "",
  emailPlatform: "klaviyo",
  recoveryAutomationId: "",
  longTermNurtureListId: "",
  emailTargetListId: "",
  emailRecoveryListId: "",
  emailActiveCampaignBaseUrl: "",
  emailGhlLocationId: "",
  emailGhlTargetWorkflowId: "",
  emailGhlRecoveryWorkflowId: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  smtpFromAddress: "",
  smtpFromName: "",
  hostingPlatform: "nextjs_vercel",
  publishDomain: "",
  hostingWebflowSiteId: "",
  hostingWebflowCollectionId: "",
  hostingWordpressSiteUrl: "",
  hostingVercelProjectName: "",
  hostingVercelTeamId: "",
  hostingApiKey: "",
  briefDestination: "slack",
  slackWebhookUrl: "",
  smsPlatform: "none",
  smsApiKey: "",
  smsTwilioAccountSid: "",
  smsTwilioMessagingServiceSid: "",
  smsTwilioFromNumber: "",
  smsA2p10dlcStatus: "not_started",
  smsComplianceFooterVariant: "standard",
  smsComplianceFooterCustom: "",
  adDataPlatform: "none",
  adDataApiKey: "",
  adDataHyrosAccountId: "",
  adDataGoogleSheetsSpreadsheetId: "",
  adDataGoogleSheetsSheetName: "",
  adDataCohortId: "",
  existingPileOnSequenceFlagged: false,
  briefTriggerType: "nightly",
  videoEngagementPlatform: "none",
  videoEngagementApiKey: "",
  heroVideoId: "",
  videoEngagementWistiaVideoId: "",
  videoEngagementYoutubeChannelId: "",
  prospectResearchSourcesUsed: [],
  apolloApiKey: "",
  pdlApiKey: "",
  topCallQuestions: "",
  topObjections: "",
  prospectMeets: "founder",
  voiceSource: "scrape",
  marketingDomain: "",
  rawVoiceCorpus: "",
  bookingApiKey: "",
  emailApiKey: "",
  ghlApiKey: "",
  ghlLocationId: "",
  testimonials: [],
  discoveredPlatformName: "",
  discoveredPlatformWebsite: "",
  existingConfirmationPageUrl: "",
  rescheduleMode: "time_slots",
  recoveredFromNoShowTaggingEnabled: true,
  inboundReplyMode: "none",
  hubspotPortalId: "",
  weeklyScheduleDayOfWeek: 1,
  weeklyScheduleHour: 9,
  monthlyScheduleDayOfMonth: 1,
  leakMapTimezone: "UTC",
  auditOutputFormat: "dashboard_only",
  leakMapReportEmail: "",
  existingAuditFlagged: false,
  existingAuditDescription: "",
  notificationPackSelections: [],
  offerVertical: "",
};

// Draft persistence: survives page refresh / accidental navigation within
// the same tab. Deliberately session-scoped (not localStorage) and
// deliberately excludes API keys — secrets never touch browser storage,
// even short-lived storage, so those fields always come back empty
// after a restore and the buyer re-pastes them.
export const DRAFT_KEY = "mcs:new-engagement:draft";
export const DRAFT_STEP_KEY = "mcs:new-engagement:step";
