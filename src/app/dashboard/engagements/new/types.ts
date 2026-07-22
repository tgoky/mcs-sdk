// Shared types for the "New Engagement" setup wizard. Split out of page.tsx
// so step components, hooks, and validation/submit logic can all import
// the same shapes without pulling in the page component itself.

export type Step = "offer" | "stack" | "credentials" | "voice" | "confirm";

export interface Testimonial {
  name: string;
  role: string;
  company: string;
  quote: string;
}

export interface ValidationError {
  step: Step;
  stepLabel: string;
  issue: string;
}

export interface FormData {
  engagementId: string;
  buyerName: string;
  offerName: string;
  offerPrice: string;
  offerIcp: string;
  trafficTemperature: "cold" | "warm" | "hot";
  hybridMode: boolean;
  bookingPlatform: string;
  bookingLocationId: string;
  bookingStandingLink: string;

  recoveryAutomationId: string;
  longTermNurtureListId: string;
  emailPlatform: string;
  emailTargetListId: string;
  emailRecoveryListId: string;
  emailActiveCampaignBaseUrl: string;
  emailGhlLocationId: string;
  emailGhlTargetWorkflowId: string;
  emailGhlRecoveryWorkflowId: string;
  // Custom SMTP — direct-send win-back email channel. Bundled into a
  // single JSON string (emailApiKey) at submit time rather than adding
  // new stack schema columns — see the useEffect that composes it below.
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromAddress: string;
  smtpFromName: string;
  hostingPlatform: string;
  publishDomain: string;
  hostingWebflowSiteId: string;
  hostingWebflowCollectionId: string;
  hostingWordpressSiteUrl: string;
  hostingVercelProjectName: string;
  hostingVercelTeamId: string;
  hostingApiKey: string;
  briefDestination: string;
  slackWebhookUrl: string;
  // Pile-On recovery gap 1 — SMS
  smsPlatform: string;
  smsApiKey: string;
  smsTwilioAccountSid: string;
  smsTwilioMessagingServiceSid: string;
  smsTwilioFromNumber: string;
  smsA2p10dlcStatus: string;
  smsComplianceFooterVariant: "standard" | "custom";
  smsComplianceFooterCustom: string;
  // Pile-On recovery gap 2 — ad-data cohort sync
  adDataPlatform: string;
  adDataApiKey: string;
  adDataHyrosAccountId: string;
  adDataGoogleSheetsSpreadsheetId: string;
  adDataGoogleSheetsSheetName: string;
  adDataCohortId: string;
  // Pile-On recovery gap 4 — existing-sequence audit
  existingPileOnSequenceFlagged: boolean;
  // Pre-Call Read recovery gap 1 — dynamic trigger
  briefTriggerType: "nightly" | "dynamic_webhook";
  // Pre-Call Read recovery gap 3 — video engagement
  videoEngagementPlatform: string;
  videoEngagementApiKey: string;
  heroVideoId: string;
  videoEngagementWistiaVideoId: string;
  videoEngagementYoutubeChannelId: string;
  // Pre-Call Read recovery gap 5 — Apollo/PDL BYOK
  prospectResearchSourcesUsed: string[];
  apolloApiKey: string;
  pdlApiKey: string;
  topCallQuestions: string;
  topObjections: string;
  prospectMeets: string;
  voiceSource: "scrape" | "manual";
  marketingDomain: string;
  rawVoiceCorpus: string;
  bookingApiKey: string;
  emailApiKey: string;
  testimonials: Testimonial[];
  // Pin-Down recovery gap 6 — populated when bookingPlatform or
  // hostingPlatform is "discover_from_docs".
  discoveredPlatformName: string;
  discoveredPlatformWebsite: string;
  // Pin-Down recovery gap 7 — set when the operator already knows the
  // buyer has a confirmation page live (or after running smart pre-fill,
  // gap 1, which can detect this automatically).
  existingConfirmationPageUrl: string;
  // Win-Back recovery gaps 3, 4, 6
  rescheduleMode: "fresh_link" | "time_slots";
  recoveredFromNoShowTaggingEnabled: boolean;
  inboundReplyMode: "native" | "forwarding" | "none";
  hubspotPortalId: string;
  // Leak Map recovery gaps 1, 2, 3, 4, 7
  weeklyScheduleDayOfWeek: number;
  weeklyScheduleHour: number;
  monthlyScheduleDayOfMonth: number;
  leakMapTimezone: string;
  auditOutputFormat: "email" | "slack" | "dashboard_only";
  leakMapReportEmail: string;
  existingAuditFlagged: boolean;
  existingAuditDescription: string;
  notificationPackSelections: string[];
  offerVertical: string;
}

// Shape returned by the Klaviyo/GHL/ActiveCampaign list & workflow lookups.
export interface RemoteOption {
  id: string;
  name: string;
}
