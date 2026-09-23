// src/lib/showtime-setup/catalog.ts
//
// The tools Showtime's setup offers, grouped the way the stack stores them
// (booking_platform / email_platform / hosting_platform). Client-safe: no
// server imports, so the setup screen and the setup routes read the same
// list. Provider keys are the same strings those stack fields hold and the
// credential vault is keyed by (see syncMarkersForChosenPlatforms), so a
// tool connected here is the same connection Settings → Apps shows.

import { isComposioManagedProvider } from "@/lib/composio-providers";

export type ToolGroupId = "booking" | "email" | "hosting";

export interface SetupTool {
  provider: string;
  label: string;
  group: ToolGroupId;
  /** Sign-in through Composio is offered (a pasted key still works). */
  composio: boolean;
  /** False for choices with nothing to connect (no publish API). */
  needsKey: boolean;
  keyPlaceholder?: string;
  keyHowTo?: string;
  /** One extra value some platforms need beside the key. */
  extraField?: { key: "activecampaignBaseUrl"; label: string; placeholder: string };
  /** Shown in the tool's card when it has nothing to connect. */
  noKeyNote?: string;
}

const tool = (t: Omit<SetupTool, "composio" | "needsKey"> & { needsKey?: boolean }): SetupTool => ({
  needsKey: true,
  ...t,
  composio: isComposioManagedProvider(t.provider),
});

export const SHOWTIME_TOOL_GROUPS: { id: ToolGroupId; label: string; hint: string; tools: SetupTool[] }[] = [
  {
    id: "booking",
    label: "Booking",
    hint: "Where calls get booked",
    tools: [
      tool({ provider: "calendly", label: "Calendly", group: "booking" }),
      tool({ provider: "cal_com", label: "Cal.com", group: "booking", keyPlaceholder: "cal_live_…", keyHowTo: "Cal.com → Settings → Developer → API Keys" }),
      tool({ provider: "ghl_calendar", label: "GoHighLevel", group: "booking", keyPlaceholder: "Private Integration Token", keyHowTo: "GoHighLevel → Settings → Private Integrations" }),
      tool({ provider: "oncehub", label: "OnceHub", group: "booking", keyPlaceholder: "API key", keyHowTo: "OnceHub → Admin → Integrations → API keys" }),
    ],
  },
  {
    id: "email",
    label: "Email & CRM",
    hint: "Where follow-ups are sent",
    tools: [
      tool({ provider: "hubspot", label: "HubSpot", group: "email", keyPlaceholder: "Private app access token", keyHowTo: "HubSpot → Settings → Integrations → Private Apps" }),
      tool({ provider: "klaviyo", label: "Klaviyo", group: "email", keyPlaceholder: "pk_…", keyHowTo: "Klaviyo → Settings → API keys → Create private key" }),
      tool({ provider: "mailchimp", label: "Mailchimp", group: "email", keyPlaceholder: "…-us21", keyHowTo: "Mailchimp → Profile → Extras → API keys" }),
      tool({ provider: "ghl", label: "GoHighLevel", group: "email", keyPlaceholder: "Private Integration Token", keyHowTo: "GoHighLevel → Settings → Private Integrations" }),
      tool({
        provider: "activecampaign",
        label: "ActiveCampaign",
        group: "email",
        keyPlaceholder: "API key",
        keyHowTo: "ActiveCampaign → Settings → Developer",
        extraField: { key: "activecampaignBaseUrl", label: "Account URL", placeholder: "https://youraccount.api-us1.com/api/3" },
      }),
      tool({ provider: "convertkit", label: "Kit", group: "email", keyPlaceholder: "API secret", keyHowTo: "Kit → Settings → Advanced → API" }),
      tool({ provider: "smtp", label: "SMTP", group: "email", keyPlaceholder: "smtp://user:pass@host:587", keyHowTo: "Your mail server's details as one connection string" }),
    ],
  },
  {
    id: "hosting",
    label: "Page hosting",
    hint: "Where the confirmation page lives",
    tools: [
      tool({ provider: "webflow", label: "Webflow", group: "hosting", keyPlaceholder: "API token", keyHowTo: "Webflow → Site settings → Apps & integrations → API access" }),
      tool({ provider: "wordpress", label: "WordPress", group: "hosting", keyPlaceholder: "username:application-password", keyHowTo: "WordPress → Users → Profile → Application Passwords" }),
      tool({ provider: "nextjs_vercel", label: "Vercel", group: "hosting", keyPlaceholder: "Vercel token", keyHowTo: "Vercel → Account settings → Tokens" }),
      tool({ provider: "lovable", label: "Lovable", group: "hosting", needsKey: false, noKeyNote: "Nothing to connect. We host the page and give you the link to use in Lovable." }),
      tool({ provider: "plain_html", label: "Any website", group: "hosting", needsKey: false, noKeyNote: "Nothing to connect. We host the page for you and hand you the link." }),
    ],
  },
];

export const SHOWTIME_TOOLS: SetupTool[] = SHOWTIME_TOOL_GROUPS.flatMap((g) => g.tools);

export function findShowtimeTool(provider: string, group?: ToolGroupId): SetupTool | undefined {
  return SHOWTIME_TOOLS.find((t) => t.provider === provider && (!group || t.group === group));
}

/** Email platforms Pre-Call Read can leave a note on, and Pile-On can tag
 * booked leads in without a separate ad-data tool (derived-suggestions.ts). */
export const CRM_NOTE_PLATFORMS = new Set(["hubspot", "klaviyo", "ghl"]);
