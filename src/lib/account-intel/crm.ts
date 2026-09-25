// src/lib/account-intel/crm.ts
//
// Deep reads of an email tool or CRM: who the emails come from, what's been
// sent and how it performed, which automations already run, the audience
// lists, the sales pipeline and its won/lost history, lead sources and the
// team. One pull per vendor, same AccountIntel shape for each. Every part
// is optional; a part the connection can't see is reported as blocked.

import { mailchimpDatacenter, mailchimpApiEndpoint } from "@/lib/outbound-urls";
import { summarizeCampaigns, summarizeDeals, type CampaignRecord, type DealRecord } from "./analyze";
import { pullGhlCalendars } from "./booking";
import { AccountReader, inBatches, type Raw } from "./reader";
import type { AccountIntel, AudienceList, Automation, TeamMember } from "./types";
import { klaviyoAuthorization } from "@/lib/klaviyo-auth";

const DEAL_LOOKBACK_DAYS = 365;

function tallyList(values: (string | null | undefined)[], max = 8): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v && v.trim()) m.set(v.trim(), (m.get(v.trim()) ?? 0) + 1);
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, max);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function prettySource(s: string): string {
  // HubSpot's analytics sources come back as ORGANIC_SEARCH, PAID_SOCIAL...
  return /^[A-Z_]+$/.test(s) ? s.toLowerCase().replace(/_/g, " ") : s;
}

// ── HubSpot ──────────────────────────────────────────────────────────────

/**
 * Scopes each part needs, from HubSpot's public API specs
 * (HubSpot-public-api-spec-collection). A part is skipped, and reported as
 * not shared, when the token plainly lacks every scope that would allow it.
 */
export const HUBSPOT_PART_SCOPES: Record<string, string[]> = {
  team: ["crm.objects.owners.read"],
  pipeline: ["crm.objects.deals.read"],
  deals: ["crm.objects.deals.read"],
  contacts: ["crm.objects.contacts.read"],
  "marketing emails": ["content", "marketing.email.read"],
  workflows: ["automation"],
};

/**
 * The scopes an OAuth token (a Composio sign-in) was actually granted:
 * GET /oauth/v1/access-tokens/{token} returns them, with the portal's
 * domain. Optional scopes may be left out at install, so they're checked,
 * not assumed. Private-app tokens ("pat-...") aren't OAuth tokens; for
 * those every part is simply tried.
 */
async function hubspotGrant(token: string, r: AccountReader): Promise<{ scopes: Set<string> | null; domain: string | null }> {
  if (token.startsWith("pat-")) return { scopes: null, domain: null };
  const info = await r.json<{ scopes?: string[]; hub_domain?: string }>("token", `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(token)}`);
  return { scopes: Array.isArray(info?.scopes) ? new Set(info!.scopes) : null, domain: info?.hub_domain ?? null };
}

export async function pullHubSpot(token: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ Authorization: `Bearer ${token}` });
  const api = "https://api.hubapi.com";
  const grant = await hubspotGrant(token, r);
  const allowed = (part: string) => {
    if (!grant.scopes) return true;
    const ok = (HUBSPOT_PART_SCOPES[part] ?? []).some((s) => grant.scopes!.has(s)) || !HUBSPOT_PART_SCOPES[part];
    if (!ok) r.blocked.add(part);
    return ok;
  };
  const read = <T,>(part: string, url: string, init?: Parameters<AccountReader["json"]>[2]) => (allowed(part) ? r.json<T>(part, url, init) : Promise.resolve(null));

  const [account, owners, pipelines] = await Promise.all([
    r.json<{ portalId?: number; timeZone?: string; companyCurrency?: string }>("account", `${api}/account-info/v3/details`),
    read<{ results?: Raw[] }>("team", `${api}/crm/v3/owners?limit=100&archived=false`),
    read<{ results?: Raw[] }>("pipeline", `${api}/crm/v3/pipelines/deals`),
  ]);

  const team: TeamMember[] = (owners?.results ?? [])
    .map((o) => ({ name: [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email, email: o.email ?? null, role: o.teams?.[0]?.name ?? null }))
    .filter((t) => t.name);

  const stageLabel = new Map<string, string>();
  const pipelineStages: AccountIntel["pipelineStages"] = [];
  for (const p of pipelines?.results ?? []) {
    for (const s of p.stages ?? []) {
      stageLabel.set(String(s.id), String(s.label));
      pipelineStages.push({ pipeline: String(p.label ?? "Pipeline"), stage: String(s.label), closed: s.metadata?.isClosed === "true" });
    }
  }

  // Deals from the last year, newest first, up to 500.
  const since = String(now.getTime() - DEAL_LOOKBACK_DAYS * 86_400_000);
  const rawDeals: Raw[] = [];
  let after: string | undefined;
  for (let i = 0; i < 5 && !r.outOfTime; i++) {
    const page = await read<{ results?: Raw[]; paging?: { next?: { after?: string } } }>("deals", `${api}/crm/v3/objects/deals/search`, {
      method: "POST",
      body: {
        filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: since }] }],
        properties: ["amount", "dealname", "dealstage", "createdate", "closedate", "hs_is_closed", "hs_is_closed_won", "closed_lost_reason", "hubspot_owner_id", "hs_analytics_source"],
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
        limit: 100,
        ...(after ? { after } : {}),
      },
    });
    rawDeals.push(...(page?.results ?? []));
    after = page?.paging?.next?.after;
    if (!after) break;
  }
  const deals: DealRecord[] = rawDeals.map((d) => {
    const p = d.properties ?? {};
    return {
      amount: num(p.amount),
      createdAt: p.createdate ?? null,
      closedAt: p.closedate ?? null,
      status: p.hs_is_closed_won === "true" ? "won" : p.hs_is_closed === "true" ? "lost" : "open",
      stage: stageLabel.get(String(p.dealstage)) ?? null,
      source: p.hs_analytics_source ? prettySource(p.hs_analytics_source) : null,
      lostReason: p.closed_lost_reason ?? null,
    };
  });

  // Meetings logged with an outcome: HubSpot's own no-show record.
  const meetingsPage = await r.json<{ results?: Raw[] }>("meetings", `${api}/crm/v3/objects/meetings/search`, {
    method: "POST",
    body: {
      filterGroups: [{ filters: [{ propertyName: "hs_meeting_start_time", operator: "GTE", value: String(now.getTime() - 90 * 86_400_000) }] }],
      properties: ["hs_meeting_outcome", "hs_meeting_start_time"],
      limit: 100,
    },
  });
  const outcomes = (meetingsPage?.results ?? []).map((m) => String(m.properties?.hs_meeting_outcome ?? "").toUpperCase()).filter(Boolean);
  const completed = outcomes.filter((o) => o === "COMPLETED").length;
  const noShows = outcomes.filter((o) => o === "NO_SHOW").length;
  const canceled = outcomes.filter((o) => o === "CANCELED").length;

  // Contacts: how many, where the newest came from, lifecycle mix.
  const contactsPage = await read<{ total?: number; results?: Raw[] }>("contacts", `${api}/crm/v3/objects/contacts/search`, {
    method: "POST",
    body: { filterGroups: [], properties: ["lifecyclestage", "hs_analytics_source", "createdate"], sorts: [{ propertyName: "createdate", direction: "DESCENDING" }], limit: 100 },
  });
  const recent = contactsPage?.results ?? [];
  const cutoff30 = now.getTime() - 30 * 86_400_000;

  // Marketing emails and workflows need scopes some connections lack.
  const emails = await read<{ results?: Raw[] }>("marketing emails", `${api}/marketing/v3/emails/?limit=40&sort=-publishDate&includeStats=true&isPublished=true`);
  const sent = (emails?.results ?? []).filter((e) => e.publishDate || e.publishedAt);
  const campaigns: CampaignRecord[] = sent.map((e) => {
    const c = e.stats?.counters ?? {};
    const delivered = num(c.delivered) ?? num(c.sent);
    return {
      name: e.name ?? null,
      subject: e.subject ?? null,
      sentAt: e.publishDate ?? e.publishedAt ?? null,
      recipients: delivered,
      openRate: delivered ? (num(c.open) ?? 0) / delivered : null,
      clickRate: delivered ? (num(c.click) ?? 0) / delivered : null,
    };
  });
  const firstFrom = sent.find((e) => e.from?.fromName || e.from?.replyTo)?.from;

  const flows = await read<{ results?: Raw[] }>("workflows", `${api}/automation/v4/flows?limit=100`);
  const automations: Automation[] = (flows?.results ?? []).filter((f) => f.name).map((f) => ({ name: String(f.name), status: f.isEnabled === false ? "off" : "on", trigger: f.flowType ?? null }));

  return {
    provider: "hubspot",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    timeZone: account?.timeZone ?? null,
    currency: account?.companyCurrency ?? null,
    // The portal's own domain, unless it's a HubSpot-hosted placeholder.
    business: grant.domain && !/hubspot|hs-sites|hubspotpagebuilder/i.test(grant.domain) ? { website: grant.domain } : undefined,
    deals: deals.length ? summarizeDeals(deals, account?.companyCurrency ?? null) : undefined,
    pipelineStages: pipelineStages.length ? pipelineStages : undefined,
    meetings: outcomes.length
      ? { total: outcomes.length, completed, noShows, canceled, noShowRate: completed + noShows >= 8 ? Math.round((noShows / (completed + noShows)) * 1000) / 10 : null }
      : undefined,
    contacts: contactsPage
      ? {
          total: contactsPage.total ?? null,
          addedLast30Days: recent.length < 100 || new Date(recent[recent.length - 1]?.properties?.createdate).getTime() < cutoff30
            ? recent.filter((c) => new Date(c.properties?.createdate).getTime() >= cutoff30).length
            : null,
          lifecycle: tallyList(recent.map((c) => c.properties?.lifecyclestage)).map((x) => ({ stage: x.key, count: x.count })),
          sources: tallyList(recent.map((c) => (c.properties?.hs_analytics_source ? prettySource(c.properties.hs_analytics_source) : null))).map((x) => ({ source: x.key, count: x.count })),
        }
      : undefined,
    email: campaigns.length ? summarizeCampaigns(campaigns) : undefined,
    sender: firstFrom ? { fromName: firstFrom.fromName ?? null, replyTo: firstFrom.replyTo ?? null } : undefined,
    automations: automations.length ? automations : undefined,
    team: team.length ? team : undefined,
  };
}

// ── Klaviyo ──────────────────────────────────────────────────────────────

export async function pullKlaviyo(apiKey: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ Authorization: klaviyoAuthorization(apiKey), Revision: "2024-10-15" });
  const api = "https://a.klaviyo.com/api";

  const [accounts, listsData, flowsData, metricsData] = await Promise.all([
    r.json<{ data?: Raw[] }>("account", `${api}/accounts`),
    r.json<{ data?: Raw[] }>("lists", `${api}/lists?fields[list]=name`),
    r.json<{ data?: Raw[] }>("flows", `${api}/flows?fields[flow]=name,status,trigger_type&page[size]=50`),
    r.json<{ data?: Raw[] }>("metrics", `${api}/metrics?fields[metric]=name,integration`),
  ]);
  const attrs = accounts?.data?.[0]?.attributes ?? {};
  const contact = attrs.contact_information ?? {};

  const lists: AudienceList[] = (listsData?.data ?? []).map((l) => ({ id: String(l.id), name: String(l.attributes?.name ?? "List") }));
  await inBatches(lists.slice(0, 10), 5, async (l) => {
    const one = await r.json<{ data?: { attributes?: { profile_count?: number } } }>("list sizes", `${api}/lists/${l.id}?additional-fields[list]=profile_count`);
    l.count = one?.data?.attributes?.profile_count ?? null;
  });

  // Sent email campaigns with their messages (subject, sender).
  const filter = encodeURIComponent("and(equals(messages.channel,'email'),equals(status,'Sent'))");
  const campaignsData = await r.json<{ data?: Raw[]; included?: Raw[] }>(
    "campaigns",
    `${api}/campaigns?filter=${filter}&sort=-scheduled_at&include=campaign-messages`
  );
  const messages = new Map<string, Raw>((campaignsData?.included ?? []).filter((i) => i.type === "campaign-message").map((m) => [String(m.id), m.attributes ?? {}]));
  const campaignRows = (campaignsData?.data ?? []).slice(0, 50);

  // Performance comes from Klaviyo's reporting endpoint, which needs a
  // conversion metric; Placed Order when there is one, else Raw metric.
  const metricList = metricsData?.data ?? [];
  const conversion = metricList.find((m) => /placed order/i.test(m.attributes?.name ?? "")) ?? metricList[0];
  const stats = new Map<string, { open_rate?: number; click_rate?: number; recipients?: number }>();
  if (conversion && campaignRows.length) {
    const report = await r.json<{ data?: { attributes?: { results?: Raw[] } } }>("campaign performance", `${api}/campaign-values-reports`, {
      method: "POST",
      body: {
        data: {
          type: "campaign-values-report",
          attributes: { statistics: ["open_rate", "click_rate", "recipients"], timeframe: { key: "last_365_days" }, conversion_metric_id: conversion.id },
        },
      },
    });
    for (const row of report?.data?.attributes?.results ?? []) {
      if (row.groupings?.campaign_id) stats.set(String(row.groupings.campaign_id), row.statistics ?? {});
    }
  }

  let sender: AccountIntel["sender"] = contact.default_sender_name || contact.default_sender_email ? { fromName: contact.default_sender_name ?? null, fromEmail: contact.default_sender_email ?? null } : undefined;
  const campaigns: CampaignRecord[] = campaignRows.map((c) => {
    const msgId = c.relationships?.["campaign-messages"]?.data?.[0]?.id;
    const m = msgId ? messages.get(String(msgId)) : undefined;
    const content = m?.content ?? m?.definition?.content ?? {};
    if (!sender && (content.from_label || content.from_email)) sender = { fromName: content.from_label ?? null, fromEmail: content.from_email ?? null, replyTo: content.reply_to_email ?? null };
    const s = stats.get(String(c.id));
    return {
      name: c.attributes?.name ?? null,
      subject: content.subject ?? null,
      sentAt: c.attributes?.send_time ?? c.attributes?.scheduled_at ?? null,
      recipients: s?.recipients ?? null,
      openRate: s?.open_rate ?? null,
      clickRate: s?.click_rate ?? null,
    };
  });

  const integrations = [...new Set(metricList.map((m) => m.attributes?.integration?.name).filter((n: unknown): n is string => typeof n === "string" && n !== "Klaviyo" && n !== "API"))];

  return {
    provider: "klaviyo",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    timeZone: attrs.timezone ?? null,
    currency: attrs.preferred_currency ?? null,
    business: { name: contact.organization_name ?? null, website: contact.website_url ?? null, industry: attrs.industry ?? null },
    email: campaigns.length ? summarizeCampaigns(campaigns) : undefined,
    sender,
    lists: lists.length ? lists : undefined,
    automations: (flowsData?.data ?? []).map((f) => ({ name: String(f.attributes?.name ?? "Flow"), status: f.attributes?.status ?? null, trigger: f.attributes?.trigger_type ?? null })),
    integrations: integrations.length ? integrations : undefined,
  };
}

// ── Mailchimp ────────────────────────────────────────────────────────────

/** A pasted key ends in its datacenter ("-us6"); an OAuth token doesn't,
 * and Mailchimp's metadata endpoint says which one it lives on. */
export async function mailchimpBase(token: string): Promise<{ base: string; auth: string } | null> {
  const dc = mailchimpDatacenter(token);
  if (dc) return { base: `https://${dc}.api.mailchimp.com/3.0`, auth: `Bearer ${token}` };
  const r = new AccountReader({ Authorization: `OAuth ${token}` }, 8000);
  const meta = await r.json<{ api_endpoint?: string; dc?: string }>("account", "https://login.mailchimp.com/oauth2/metadata");
  // The metadata's endpoint is where the token gets sent next, so it's held
  // to a real <dc>.api.mailchimp.com host.
  const endpoint = mailchimpApiEndpoint(meta?.api_endpoint ?? (meta?.dc ? `https://${meta.dc}.api.mailchimp.com` : null));
  return endpoint ? { base: `${endpoint}/3.0`, auth: `Bearer ${token}` } : null;
}

export async function pullMailchimp(token: string, now = new Date()): Promise<AccountIntel> {
  const where = await mailchimpBase(token);
  const r = new AccountReader({ Authorization: where?.auth ?? `Bearer ${token}` });
  if (!where) return { provider: "mailchimp", pulledAt: now.toISOString(), coverage: { read: [], blocked: [], failed: ["account"] } };
  const api = where.base;

  const [root, listsData, campaignsData, autos] = await Promise.all([
    r.json<Raw>("account", `${api}/?fields=account_name,email,account_timezone,account_industry,contact,total_subscribers`),
    r.json<{ lists?: Raw[] }>("lists", `${api}/lists?count=50&fields=lists.id,lists.name,lists.stats.member_count,lists.campaign_defaults`),
    r.json<{ campaigns?: Raw[] }>(
      "campaigns",
      `${api}/campaigns?count=60&status=sent&sort_field=send_time&sort_dir=DESC&fields=campaigns.id,campaigns.send_time,campaigns.emails_sent,campaigns.settings.subject_line,campaigns.settings.title,campaigns.settings.from_name,campaigns.settings.reply_to,campaigns.report_summary`
    ),
    r.json<{ automations?: Raw[] }>("automations", `${api}/automations?fields=automations.id,automations.status,automations.settings.title,automations.trigger_settings`),
  ]);

  const lists: AudienceList[] = (listsData?.lists ?? []).map((l) => ({ id: String(l.id), name: String(l.name), count: l.stats?.member_count ?? null }));
  const campaigns: CampaignRecord[] = (campaignsData?.campaigns ?? []).map((c) => ({
    name: c.settings?.title ?? null,
    subject: c.settings?.subject_line ?? null,
    sentAt: c.send_time ?? null,
    recipients: c.emails_sent ?? null,
    openRate: num(c.report_summary?.open_rate),
    clickRate: num(c.report_summary?.click_rate),
  }));
  const withSender = (campaignsData?.campaigns ?? []).find((c) => c.settings?.from_name) ?? null;
  const listDefaults = (listsData?.lists ?? []).find((l) => l.campaign_defaults?.from_name)?.campaign_defaults;

  return {
    provider: "mailchimp",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    timeZone: root?.account_timezone ?? null,
    business: { name: root?.account_name || root?.contact?.company || null, email: root?.email ?? null, industry: root?.account_industry ?? null },
    contacts: typeof root?.total_subscribers === "number" ? { total: root.total_subscribers } : undefined,
    email: campaigns.length ? summarizeCampaigns(campaigns) : undefined,
    sender: withSender
      ? { fromName: withSender.settings.from_name, replyTo: withSender.settings.reply_to ?? null }
      : listDefaults
        ? { fromName: listDefaults.from_name ?? null, fromEmail: listDefaults.from_email ?? null }
        : undefined,
    lists: lists.length ? lists : undefined,
    automations: (autos?.automations ?? []).map((a) => ({ name: String(a.settings?.title ?? "Automation"), status: a.status ?? null, trigger: a.trigger_settings?.workflow_title ?? null })),
  };
}

// ── ActiveCampaign ───────────────────────────────────────────────────────

export function activeCampaignApiBase(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "").replace(/\/api\/3$/i, "")}/api/3`;
}

export async function pullActiveCampaign(apiKey: string, baseUrl: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ "Api-Token": apiKey });
  const api = activeCampaignApiBase(baseUrl);

  const [lists, campaignsData, messagesData, autos, contacts, deals, stages, users] = await Promise.all([
    r.json<{ lists?: Raw[] }>("lists", `${api}/lists?limit=50`),
    r.json<{ campaigns?: Raw[] }>("campaigns", `${api}/campaigns?limit=60&orders[sdate]=DESC&filters[status]=5`),
    r.json<{ messages?: Raw[] }>("messages", `${api}/messages?limit=60&orders[mdate]=DESC`),
    r.json<{ automations?: Raw[] }>("automations", `${api}/automations?limit=100`),
    r.json<{ meta?: { total?: string | number } }>("contacts", `${api}/contacts?limit=1`),
    r.json<{ deals?: Raw[] }>("deals", `${api}/deals?limit=100&orders[cdate]=DESC`),
    r.json<{ dealStages?: Raw[] }>("pipeline", `${api}/dealStages?limit=100`),
    r.json<{ users?: Raw[] }>("team", `${api}/users?limit=50`),
  ]);

  const campaigns: CampaignRecord[] = (campaignsData?.campaigns ?? []).map((c) => {
    const sent = num(c.send_amt);
    return {
      name: c.name ?? null,
      subject: null,
      sentAt: c.sdate ?? null,
      recipients: sent,
      openRate: sent ? (num(c.uniqueopens) ?? 0) / sent : null,
      clickRate: sent ? (num(c.uniquelinkclicks) ?? 0) / sent : null,
    };
  });
  // Subjects live on messages, which the campaign list doesn't link to, so
  // the subject lines are read from the messages themselves.
  const msgs = messagesData?.messages ?? [];
  const fromMsg = msgs.find((m) => m.fromname || m.fromemail);
  const subjects = [...new Set(msgs.map((m) => (typeof m.subject === "string" ? m.subject.trim() : "")).filter(Boolean))].slice(0, 15) as string[];
  const email = campaigns.length || subjects.length ? { ...summarizeCampaigns(campaigns), ...(subjects.length ? { recentSubjects: subjects } : {}) } : undefined;

  const stageName = new Map<string, string>((stages?.dealStages ?? []).map((s) => [String(s.id), String(s.title)]));
  const dealRecords: DealRecord[] = (deals?.deals ?? []).map((d) => ({
    amount: num(d.value) !== null ? num(d.value)! / 100 : null,
    createdAt: d.cdate ?? null,
    // mdate is the last change, which for a won or lost deal is when it
    // closed; edate isn't documented as a close date.
    closedAt: String(d.status) === "1" || String(d.status) === "2" ? (d.mdate ?? null) : null,
    status: String(d.status) === "1" ? "won" : String(d.status) === "2" ? "lost" : "open",
    stage: stageName.get(String(d.stage)) ?? null,
  }));
  const currency = (deals?.deals ?? []).find((d) => d.currency)?.currency?.toUpperCase() ?? null;

  return {
    provider: "activecampaign",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    currency,
    contacts: contacts?.meta?.total != null ? { total: num(contacts.meta.total) } : undefined,
    email,
    sender: fromMsg
      ? { fromName: fromMsg.fromname ?? null, fromEmail: fromMsg.fromemail ?? null, replyTo: fromMsg.reply2 ?? null }
      : (lists?.lists ?? []).find((l) => l.sender_name)
        ? { fromName: (lists!.lists!.find((l) => l.sender_name)!.sender_name as string) ?? null }
        : undefined,
    // Lists carry no subscriber count in ActiveCampaign's list payload.
    lists: (lists?.lists ?? []).map((l) => ({ id: String(l.id), name: String(l.name) })),
    automations: (autos?.automations ?? []).map((a) => ({ name: String(a.name ?? "Automation"), status: String(a.status) === "1" ? "on" : "off" })),
    deals: dealRecords.length ? summarizeDeals(dealRecords, currency) : undefined,
    pipelineStages: (stages?.dealStages ?? []).map((s) => ({ pipeline: String(s.group ?? "Pipeline"), stage: String(s.title), closed: false })),
    team: (users?.users ?? []).map((u) => ({ name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || String(u.username ?? ""), email: u.email ?? null })).filter((u) => u.name),
  };
}

// ── Kit (ConvertKit) ─────────────────────────────────────────────────────

export async function pullKit(apiSecret: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({});
  const api = "https://api.convertkit.com/v3";
  const q = `api_secret=${encodeURIComponent(apiSecret)}`;

  const [account, broadcasts, sequences, forms, tags, subs] = await Promise.all([
    r.json<{ name?: string; primary_email_address?: string }>("account", `${api}/account?${q}`),
    r.json<{ broadcasts?: Raw[] }>("broadcasts", `${api}/broadcasts?${q}&page=1`),
    r.json<{ courses?: Raw[] }>("sequences", `${api}/sequences?${q}`),
    r.json<{ forms?: Raw[] }>("forms", `${api}/forms?${q}`),
    r.json<{ tags?: Raw[] }>("tags", `${api}/tags?${q}`),
    r.json<{ total_subscribers?: number }>("subscribers", `${api}/subscribers?${q}&page=1`),
  ]);

  // Newest broadcasts first; stats one by one for the latest 15.
  const list = [...(broadcasts?.broadcasts ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15);
  const campaigns: CampaignRecord[] = await inBatches(list, 5, async (b) => {
    const s = await r.json<{ broadcast?: { stats?: Raw } }>("broadcast stats", `${api}/broadcasts/${b.id}/stats?${q}`);
    const stats = s?.broadcast?.stats ?? {};
    return {
      subject: b.subject ?? null,
      sentAt: b.published_at ?? b.send_at ?? b.created_at ?? null,
      recipients: num(stats.recipients),
      openRate: num(stats.open_rate) !== null ? num(stats.open_rate)! / 100 : null,
      clickRate: num(stats.click_rate) !== null ? num(stats.click_rate)! / 100 : null,
    };
  });

  return {
    provider: "convertkit",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    business: { name: account?.name ?? null, email: account?.primary_email_address ?? null },
    contacts: typeof subs?.total_subscribers === "number" ? { total: subs.total_subscribers } : undefined,
    email: campaigns.length ? summarizeCampaigns(campaigns) : undefined,
    lists: [...(forms?.forms ?? []).map((f) => ({ id: `form:${f.id}`, name: `Form: ${f.name}` })), ...(tags?.tags ?? []).map((t) => ({ id: `tag:${t.id}`, name: `Tag: ${t.name}` }))].slice(0, 40),
    automations: (sequences?.courses ?? []).map((c) => ({ name: String(c.name ?? "Sequence"), trigger: "sequence" })),
  };
}

// ── GoHighLevel (CRM side, plus its calendars) ───────────────────────────

export async function pullGhl(token: string, locationId: string, now = new Date()): Promise<AccountIntel> {
  const r = new AccountReader({ Authorization: `Bearer ${token}`, Version: "2021-07-28" });
  const base = "https://services.leadconnectorhq.com";
  const loc = encodeURIComponent(locationId);

  const [location, pipelinesData, workflows, calendars] = await Promise.all([
    r.json<{ location?: Raw }>("account", `${base}/locations/${loc}`),
    r.json<{ pipelines?: Raw[] }>("pipeline", `${base}/opportunities/pipelines?locationId=${loc}`),
    r.json<{ workflows?: Raw[] }>("workflows", `${base}/workflows/?locationId=${loc}`),
    pullGhlCalendars(token, locationId, now, r),
  ]);

  const stageName = new Map<string, string>();
  const pipelineStages: AccountIntel["pipelineStages"] = [];
  for (const p of pipelinesData?.pipelines ?? []) {
    for (const s of p.stages ?? []) {
      stageName.set(String(s.id), String(s.name));
      pipelineStages.push({ pipeline: String(p.name ?? "Pipeline"), stage: String(s.name), closed: false });
    }
  }

  const opps: Raw[] = [];
  let startAfter: string | undefined;
  let startAfterId: string | undefined;
  const cutoff = now.getTime() - DEAL_LOOKBACK_DAYS * 86_400_000;
  for (let i = 0; i < 5 && !r.outOfTime; i++) {
    const params = new URLSearchParams({ locationId, limit: "100" });
    if (startAfter) params.set("startAfter", startAfter);
    if (startAfterId) params.set("startAfterId", startAfterId);
    const page = await r.json<{ opportunities?: Raw[] }>("deals", `${base}/opportunities/search?${params.toString()}`);
    const rows = page?.opportunities ?? [];
    const fresh = rows.filter((o) => new Date(o.createdAt ?? o.dateAdded).getTime() >= cutoff);
    opps.push(...fresh);
    if (rows.length < 100 || fresh.length < rows.length) break;
    const last = rows[rows.length - 1];
    startAfter = String(new Date(last.createdAt ?? last.dateAdded).getTime());
    startAfterId = last.id;
  }
  const deals: DealRecord[] = opps.map((o) => ({
    amount: num(o.monetaryValue),
    createdAt: o.createdAt ?? o.dateAdded ?? null,
    closedAt: o.lastStatusChangeAt ?? o.updatedAt ?? null,
    status: o.status === "won" ? "won" : o.status === "lost" || o.status === "abandoned" ? "lost" : "open",
    stage: stageName.get(String(o.pipelineStageId)) ?? null,
    source: o.source ?? null,
  }));

  const l = location?.location ?? {};
  return {
    provider: "ghl",
    pulledAt: now.toISOString(),
    coverage: r.coverage(),
    timeZone: l.timezone ?? null,
    business: { name: l.business?.name ?? l.name ?? null, website: l.business?.website ?? l.website ?? null, email: l.business?.email ?? l.email ?? null },
    booking: calendars.booking,
    team: calendars.team,
    deals: deals.length ? summarizeDeals(deals, null) : undefined,
    pipelineStages: pipelineStages.length ? pipelineStages : undefined,
    automations: (workflows?.workflows ?? []).map((w) => ({ name: String(w.name ?? "Workflow"), status: w.status ?? null })),
  };
}
