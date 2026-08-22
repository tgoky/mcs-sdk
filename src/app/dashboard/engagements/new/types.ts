// Shared types for the "New Engagement" setup wizard. Split out of page.tsx
// so step components, hooks, and validation/submit logic can all import
// the same shapes without pulling in the page component itself.

import type { RawSiteSignal } from "@/features/pin-down/server/templates/dynamic/tokens";

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
  bookingCalendarId?: string;
  ghlCalendarId?: string;     // 👈 ADD THIS
  calendarId?: string;

  recoveryAutomationId: string;
  longTermNurtureListId: string;
  emailPlatform: string;
  emailTargetListId: string;
  emailRecoveryListId: string;
  emailActiveCampaignBaseUrl: string;
  emailGhlLocationId: string;
  emailGhlTargetWorkflowId: string;
  emailGhlRecoveryWorkflowId: string;
  // Direct-send win-back email channel (email_platform === "smtp") — for
  // buyers with no ESP/CRM account at all. Two transports share this one
  // section: raw SMTP, or Resend's API for buyers who'd rather not run a
  // mail server. directSendProvider picks which; both bundle into a
  // single JSON string (emailApiKey) at submit time rather than adding
  // new stack schema columns — see the useEffect that composes it below.
  directSendProvider: "smtp" | "resend";
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  smtpFromAddress: string;
  smtpFromName: string;
  resendApiKey: string;
  hostingPlatform: string;
  publishDomain: string;
  hostingWebflowSiteId: string;
  hostingWebflowCollectionId: string;
  hostingWordpressSiteUrl: string;
  hostingVercelProjectName: string;
  hostingVercelTeamId: string;
  hostingApiKey: string;
  // Set instead of hostingApiKey when the operator reuses a saved
  // credential-vault entry rather than pasting a fresh key — see
  // credential-field.tsx and submit-payload.ts's credentialVaultLinks.
  hostingCredentialVaultId: string;
  // Set when the operator checks "save this so I can reuse it for other
  // clients" while pasting a fresh hostingApiKey — see credential-field.tsx
  // and submit-payload.ts's credentialSaveForReuse. Never set at the same
  // time as hostingCredentialVaultId (reuse mode has nothing new to save).
  hostingSaveForReuse: boolean;
  hostingReuseLabel: string;
  briefDestination: string;
  slackWebhookUrl: string;
  // Pile-On recovery gap 1 — SMS
  smsPlatform: string;
  smsApiKey: string;
  smsCredentialVaultId: string;
  smsSaveForReuse: boolean;
  smsReuseLabel: string;
  smsTwilioAccountSid: string;
  smsTwilioMessagingServiceSid: string;
  smsTwilioFromNumber: string;
  smsA2p10dlcStatus: string;
  smsComplianceFooterVariant: "standard" | "custom";
  smsComplianceFooterCustom: string;
  // Pile-On recovery gap 2 — ad-data cohort sync
  adDataPlatform: string;
  adDataApiKey: string;
  adDataCredentialVaultId: string;
  adDataSaveForReuse: boolean;
  adDataReuseLabel: string;
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
  bookingCredentialVaultId: string;
  // Set when the operator checks "save this so I can reuse it for other
  // clients" while pasting a fresh bookingApiKey — see credential-field.tsx
  // and submit-payload.ts's credentialSaveForReuse. Never set at the same
  // time as bookingCredentialVaultId (reuse mode has nothing new to save).
  bookingSaveForReuse: boolean;
  bookingReuseLabel: string;
  emailApiKey: string;
  emailCredentialVaultId: string;
  emailSaveForReuse: boolean;
  emailReuseLabel: string;
  // Single shared GoHighLevel credential pair. GHL Private Integration
  // Tokens are scoped to one sub-account and cover calendars, workflows,
  // and SMS all at once — so whenever bookingPlatform is "ghl_calendar",
  // emailPlatform is "ghl", and/or smsPlatform is "ghl_sms", the user fills
  // this in ONCE and it gets mirrored into bookingApiKey/emailApiKey/
  // smsApiKey and bookingLocationId/emailGhlLocationId (see the mirror
  // effect in use-email-integrations.ts) rather than asking for the same
  // token 2-3 times across the wizard.
  ghlApiKey: string;
  ghlCredentialVaultId: string;
  ghlSaveForReuse: boolean;
  ghlReuseLabel: string;
  ghlLocationId: string;
  testimonials: Testimonial[];
  // Pin-Down recovery gap 6 — populated when bookingPlatform or
  // hostingPlatform is "discover_from_docs".
  discoveredPlatformName: string;
  discoveredPlatformWebsite: string;
  // Pin-Down recovery gap 7 — set when the operator already knows the
  // buyer has a confirmation page live (or after running smart pre-fill,
  // gap 1, which can detect this automatically).
  existingConfirmationPageUrl: string;
  // Set by smart pre-fill's design scrape (design-scraper.ts) when the
  // buyer's own domain yields usable visual signal — passed straight
  // through to the confirmation-page template preview/build so it can
  // render each archetype in the buyer's real button/card/type/color
  // language instead of the template's static default. undefined is a
  // completely normal state (no domain yet, or the scrape found nothing
  // usable) and just means every archetype falls back to its default
  // look — never a broken preview.
  designSignal?: RawSiteSignal;
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
  confirmationPageTemplate: string;
}

// Shape returned by the Klaviyo/GHL/ActiveCampaign list & workflow lookups.
export interface RemoteOption {
  id: string;
  name: string;
}