// src/lib/stack-options.ts
//
// Live option lists for a client's connected platforms (lists, workflows,
// sites, numbers), fetched with the credential already saved on that
// client. Pulled out of the stack-options route so the setup flow's Jev
// pickers (showtime-setup/jev-setup.ts) read the exact same lists a person
// would pick from in Edit stack settings, instead of a second copy of
// every vendor call.

import { klaviyoAuthorization } from "@/lib/klaviyo-auth";

export type StackOption = { id: string; name: string };
type Option = StackOption;

export const PROVIDER_BY_RESOURCE: Record<string, string> = {
  "klaviyo-lists": "klaviyo",
  "mailchimp-lists": "mailchimp",
  "convertkit-forms": "convertkit",
  "convertkit-tags": "convertkit",
  "activecampaign-lists": "activecampaign",
  "activecampaign-automations": "activecampaign",
  "hubspot-workflows": "hubspot",
  "webflow-sites": "webflow",
  "webflow-collections": "webflow",
  "vercel-projects": "nextjs_vercel",
  "vercel-teams": "nextjs_vercel",
  "twilio-messaging-services": "twilio",
  "twilio-phone-numbers": "twilio",
  "google-sheets-spreadsheets": "google_sheets",
  "google-sheets-tabs": "google_sheets",
};

export async function fetchStackOptions(resource: string, credential: string, params: URLSearchParams): Promise<Option[]> {
  switch (resource) {
    case "klaviyo-lists": {
      const lists: Option[] = [];
      let url: string | null = "https://a.klaviyo.com/api/lists/?page[size]=10";
      for (let page = 0; url && page < 20; page++) {
        const res: Response = await fetch(url, {
          headers: { Authorization: klaviyoAuthorization(credential), Revision: "2025-04-15", Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Klaviyo rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
        const payload: { data?: Array<{ id: string; attributes?: { name?: string } }>; links?: { next?: string | null } } = await res.json();
        for (const item of payload.data ?? []) lists.push({ id: item.id, name: item.attributes?.name ?? "Unnamed List" });
        url = payload.links?.next ?? null;
      }
      return lists;
    }

    case "hubspot-workflows": {
      const res = await fetch("https://api.hubapi.com/automation/v3/workflows", { headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`HubSpot rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { workflows?: Array<{ id: number; name?: string }> } = await res.json();
      return (data.workflows ?? []).map((w) => ({ id: String(w.id), name: w.name ?? "Unnamed Workflow" }));
    }

    case "mailchimp-lists": {
      const dc = credential.trim().split("-").pop();
      if (!dc || dc === credential.trim()) throw new Error("Saved Mailchimp key has no datacenter suffix (e.g. -us21). It may not be a valid API key.");
      const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=100&fields=lists.id,lists.name`, {
        headers: { Authorization: `Basic ${Buffer.from(`anystring:${credential}`).toString("base64")}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Mailchimp rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { lists?: Array<{ id: string; name?: string }> } = await res.json();
      return (data.lists ?? []).map((l) => ({ id: l.id, name: l.name ?? "Unnamed Audience" }));
    }

    case "convertkit-forms": {
      const res = await fetch(`https://api.convertkit.com/v3/forms?api_key=${encodeURIComponent(credential)}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`ConvertKit rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { forms?: Array<{ id: number; name?: string }> } = await res.json();
      return (data.forms ?? []).map((f) => ({ id: String(f.id), name: f.name ?? "Unnamed Form" }));
    }

    case "convertkit-tags": {
      const res = await fetch(`https://api.convertkit.com/v3/tags?api_key=${encodeURIComponent(credential)}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`ConvertKit rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { tags?: Array<{ id: number; name?: string }> } = await res.json();
      return (data.tags ?? []).map((t) => ({ id: String(t.id), name: t.name ?? "Unnamed Tag" }));
    }

    case "activecampaign-lists":
    case "activecampaign-automations": {
      const baseUrl = params.get("baseUrl")?.trim().replace(/\/+$/, "");
      if (!baseUrl) throw new Error('Enter the ActiveCampaign "Account base URL" field above first. It tells us which account to ask.');
      const path = resource === "activecampaign-lists" ? "lists" : "automations";
      const res = await fetch(`${baseUrl}/${path}?limit=100`, { headers: { "Api-Token": credential, "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(`ActiveCampaign rejected the saved key [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data = await res.json();
      const items = resource === "activecampaign-lists" ? data.lists : data.automations;
      return (items ?? []).map((item: any) => ({ id: String(item.id), name: item.name ?? "Unnamed" }));
    }

    case "webflow-sites": {
      const res = await fetch("https://api.webflow.com/v2/sites", { headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`Webflow rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { sites?: Array<{ id: string; displayName?: string }> } = await res.json();
      return (data.sites ?? []).map((s) => ({ id: s.id, name: s.displayName ?? "Unnamed Site" }));
    }

    case "webflow-collections": {
      const siteId = params.get("siteId")?.trim();
      if (!siteId) throw new Error("Choose a Webflow site above first.");
      const res = await fetch(`https://api.webflow.com/v2/sites/${encodeURIComponent(siteId)}/collections`, { headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`Webflow rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { collections?: Array<{ id: string; displayName?: string }> } = await res.json();
      return (data.collections ?? []).map((c) => ({ id: c.id, name: c.displayName ?? "Unnamed Collection" }));
    }

    case "vercel-projects": {
      const res = await fetch("https://api.vercel.com/v9/projects?limit=100", { headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`Vercel rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { projects?: Array<{ id: string; name?: string }> } = await res.json();
      return (data.projects ?? []).map((p) => ({ id: p.name ?? p.id, name: p.name ?? p.id }));
    }

    case "vercel-teams": {
      const res = await fetch("https://api.vercel.com/v2/teams?limit=100", { headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`Vercel rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { teams?: Array<{ id: string; name?: string; slug?: string }> } = await res.json();
      return (data.teams ?? []).map((t) => ({ id: t.id, name: t.name ?? t.slug ?? t.id }));
    }

    case "twilio-messaging-services": {
      const accountSid = params.get("accountSid")?.trim();
      if (!accountSid) throw new Error("Enter the Twilio Account SID field above first.");
      const res = await fetch("https://messaging.twilio.com/v1/Services?PageSize=100", {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${credential}`).toString("base64")}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Twilio rejected the saved Account SID/token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { services?: Array<{ sid: string; friendly_name?: string }> } = await res.json();
      return (data.services ?? []).map((s) => ({ id: s.sid, name: s.friendly_name ?? s.sid }));
    }

    case "twilio-phone-numbers": {
      const accountSid = params.get("accountSid")?.trim();
      if (!accountSid) throw new Error("Enter the Twilio Account SID field above first.");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=100`, {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${credential}`).toString("base64")}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Twilio rejected the saved Account SID/token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { incoming_phone_numbers?: Array<{ sid: string; phone_number: string; friendly_name?: string }> } = await res.json();
      return (data.incoming_phone_numbers ?? []).map((n) => ({ id: n.phone_number, name: n.friendly_name && n.friendly_name !== n.phone_number ? `${n.friendly_name} (${n.phone_number})` : n.phone_number }));
    }

    case "google-sheets-spreadsheets": {
      const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Google Drive rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { files?: Array<{ id: string; name?: string }> } = await res.json();
      return (data.files ?? []).map((f) => ({ id: f.id, name: f.name ?? "Unnamed Spreadsheet" }));
    }

    case "google-sheets-tabs": {
      const spreadsheetId = params.get("spreadsheetId")?.trim();
      if (!spreadsheetId) throw new Error("Choose a spreadsheet above first.");
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Google Sheets rejected the saved token [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const data: { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> } = await res.json();
      return (data.sheets ?? []).map((s) => ({ id: s.properties?.title ?? String(s.properties?.sheetId ?? ""), name: s.properties?.title ?? "Unnamed Tab" }));
    }

    default:
      throw new Error(`Unknown resource "${resource}"`);
  }
}
