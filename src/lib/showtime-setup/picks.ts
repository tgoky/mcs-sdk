// src/lib/showtime-setup/picks.ts
//
// Which account-specific ids Showtime needs once an email or hosting tool
// is chosen, and which live list each one is picked from. Client-safe: the
// setup screen uses it to know which "Change" pickers to offer, the
// activation route uses it to know what to ask Jev.

import type { PickSlot } from "./types";

export interface PickTarget {
  slot: PickSlot;
  provider: string;
  resource: string;
  params?: Record<string, string>;
  /** What the id is for, in the words shown to Jev and to the user. */
  purpose: string;
}

const LIST_RESOURCES: Record<string, { target?: string; recovery?: string }> = {
  klaviyo: { target: "klaviyo-lists", recovery: "klaviyo-lists" },
  mailchimp: { target: "mailchimp-lists", recovery: "mailchimp-lists" },
  convertkit: { target: "convertkit-forms", recovery: "convertkit-tags" },
  activecampaign: { target: "activecampaign-lists", recovery: "activecampaign-lists" },
};

export const PICK_PURPOSE: Record<PickSlot, string> = {
  target_list_id:
    "Pile-On adds every newly booked call to this list, so the lead gets the follow-up emails that keep them warm before the call.",
  recovery_list_id:
    "Win-Back adds anyone who misses their booked call to this list, so they get the rebooking and win-back sequence.",
  recovery_workflow_id: "Win-Back enrolls anyone who misses their booked call into this workflow, so they get the rebooking sequence.",
  webflow_site_id: "Pin-Down publishes the confirmation page to this Webflow site.",
  vercel_project_name: "Pin-Down publishes the confirmation page to this Vercel project.",
};

export function showtimePickTargets(opts: {
  emailPlatform: string | null;
  hostingPlatform: string | null;
  activecampaignBaseUrl?: string | null;
}): PickTarget[] {
  const out: PickTarget[] = [];
  const email = opts.emailPlatform;
  if (email && LIST_RESOURCES[email]) {
    // ActiveCampaign can't be asked for its lists without the account URL.
    const params = email === "activecampaign" ? (opts.activecampaignBaseUrl ? { baseUrl: opts.activecampaignBaseUrl } : null) : undefined;
    if (params !== null) {
      const r = LIST_RESOURCES[email];
      if (r.target) out.push({ slot: "target_list_id", provider: email, resource: r.target, params, purpose: PICK_PURPOSE.target_list_id });
      if (r.recovery) out.push({ slot: "recovery_list_id", provider: email, resource: r.recovery, params, purpose: PICK_PURPOSE.recovery_list_id });
    }
  }
  if (email === "hubspot") {
    out.push({ slot: "recovery_workflow_id", provider: "hubspot", resource: "hubspot-workflows", purpose: PICK_PURPOSE.recovery_workflow_id });
  }
  if (opts.hostingPlatform === "webflow") {
    out.push({ slot: "webflow_site_id", provider: "webflow", resource: "webflow-sites", purpose: PICK_PURPOSE.webflow_site_id });
  }
  if (opts.hostingPlatform === "nextjs_vercel") {
    out.push({ slot: "vercel_project_name", provider: "nextjs_vercel", resource: "vercel-projects", purpose: PICK_PURPOSE.vercel_project_name });
  }
  return out;
}
