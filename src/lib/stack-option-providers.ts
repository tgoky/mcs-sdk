// src/lib/stack-option-providers.ts
//
// Which connected tool each live option list (stack-options.ts) is read
// through. Client-safe, so a skill's Configure knows which connection a
// picker needs before it asks for the list.

export const PROVIDER_BY_RESOURCE: Record<string, string> = {
  "klaviyo-lists": "klaviyo",
  "mailchimp-lists": "mailchimp",
  "convertkit-forms": "convertkit",
  "convertkit-tags": "convertkit",
  "activecampaign-lists": "activecampaign",
  "activecampaign-automations": "activecampaign",
  "hubspot-workflows": "hubspot",
  "ghl-workflows": "ghl",
  "webflow-sites": "webflow",
  "webflow-collections": "webflow",
  "vercel-projects": "nextjs_vercel",
  "vercel-teams": "nextjs_vercel",
  "twilio-messaging-services": "twilio",
  "twilio-phone-numbers": "twilio",
  "google-sheets-spreadsheets": "google_sheets",
  "google-sheets-tabs": "google_sheets",
};
