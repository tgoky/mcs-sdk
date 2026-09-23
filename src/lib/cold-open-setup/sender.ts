// src/lib/cold-open-setup/sender.ts
//
// What a client's sending platform already knows: its campaigns and how
// they did, the emails in them, its mailboxes (limits, sender names,
// warm-up health) and the schedule's timezone. Endpoints and fields were
// checked against each vendor's own published client or an open-source
// connector:
//   Instantly  n8n-nodes-instantly (Instantly-ai) and the v2 CLI:
//              /campaigns, /campaigns/{id}, /campaigns/analytics,
//              /accounts, /accounts/warmup-analytics
//   SmartLead  @smartlead/cli (Smartlead-Public): /campaigns,
//              /campaigns/{id}/analytics, /campaigns/{id}/sequences, /email-accounts
//   Reply.io   Airbyte source-reply-io: /campaigns, /emailAccounts, /templates
//   Lemlist    Airbyte source-lemlist: /campaigns, /activities (its public
//              API has no mailbox or sequence reads)
// Fields a source didn't pin down are read defensively; a part that fails
// or isn't allowed is reported, never guessed.

import type { ColdOpenSendPlatformId } from "@/models/schema";
import { AccountReader, inBatches, type Raw } from "@/lib/account-intel/reader";
import type { Mailbox, SenderCampaign, SenderStep } from "./analyze";

export interface SenderIntel {
  platform: ColdOpenSendPlatformId;
  pulledAt: string;
  coverage: { read: string[]; blocked: string[]; failed: string[] };
  campaigns: SenderCampaign[];
  steps: SenderStep[];
  mailboxes: Mailbox[];
  timezone: string | null;
}

const DETAIL_CAMPAIGNS = 6;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const firstNum = (o: Raw, keys: string[]): number | null => {
  for (const k of keys) {
    const v = num(o?.[k]);
    if (v !== null) return v;
  }
  return null;
};
const arr = (data: Raw, ...keys: string[]): Raw[] => {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
};
const bySent = (a: SenderCampaign, b: SenderCampaign) => (b.sent ?? 0) - (a.sent ?? 0);

function finish(platform: ColdOpenSendPlatformId, r: AccountReader, parts: Omit<SenderIntel, "platform" | "pulledAt" | "coverage">): SenderIntel {
  return { platform, pulledAt: new Date().toISOString(), coverage: r.coverage(), ...parts };
}

// ── Instantly (API v2, Bearer) ───────────────────────────────────────────

export async function pullInstantly(key: string, baseUrl = "https://api.instantly.ai/api/v2"): Promise<SenderIntel> {
  const r = new AccountReader({ Authorization: `Bearer ${key}` });
  const api = baseUrl.replace(/\/+$/, "");

  const campaignsRaw: Raw[] = [];
  let after: string | null = null;
  for (let i = 0; i < 5 && !r.outOfTime; i++) {
    const page: Raw = await r.json("campaigns", `${api}/campaigns?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    campaignsRaw.push(...arr(page, "items", "data"));
    after = page?.next_starting_after ?? null;
    if (!after) break;
  }
  const analytics = arr(await r.json("campaign results", `${api}/campaigns/analytics`), "items", "data");
  const stats = new Map(analytics.map((a) => [String(a.campaign_id ?? a.id ?? ""), a]));
  const campaigns: SenderCampaign[] = campaignsRaw.map((c) => {
    const a = stats.get(String(c.id)) ?? {};
    return {
      id: String(c.id),
      name: String(c.name ?? a.campaign_name ?? "Campaign"),
      status: c.status != null ? String(c.status) : null,
      sent: firstNum(a, ["emails_sent_count", "sent"]),
      opens: firstNum(a, ["open_count_unique", "open_count"]),
      replies: firstNum(a, ["reply_count_unique", "reply_count"]),
      bounces: firstNum(a, ["bounced_count", "bounce_count"]),
    };
  });

  // The busiest campaigns' sequences and schedule. (Per-step results
  // exist too, /campaigns/analytics/steps, but how its step numbers line up
  // with the sequence isn't documented, so subjects are ranked by their
  // campaign's reply rate instead of guessing.)
  let timezone: string | null = null;
  const steps: SenderStep[] = [];
  await inBatches([...campaigns].sort(bySent).slice(0, DETAIL_CAMPAIGNS), 3, async (c) => {
    const detail = await r.json<Raw>("sequences", `${api}/campaigns/${encodeURIComponent(c.id)}`);
    timezone ??= detail?.campaign_schedule?.schedules?.[0]?.timezone ?? null;
    arr(detail?.sequences?.[0], "steps").forEach((st: Raw, i: number) => {
      const v = arr(st, "variants")[0];
      if (!v || (typeof v.body !== "string" && typeof v.subject !== "string")) return;
      steps.push({ campaignId: c.id, campaignName: c.name, step: i + 1, subject: String(v.subject ?? ""), body: String(v.body ?? "") });
    });
  });

  const accountsRaw: Raw[] = [];
  after = null;
  for (let i = 0; i < 5 && !r.outOfTime; i++) {
    const page: Raw = await r.json("mailboxes", `${api}/accounts?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    accountsRaw.push(...arr(page, "items", "data"));
    after = page?.next_starting_after ?? null;
    if (!after) break;
  }
  const emails = accountsRaw.map((a) => a.email).filter((e): e is string => typeof e === "string");
  const health = new Map<string, number>();
  if (emails.length) {
    const warm: Raw = await r.json("warm-up health", `${api}/accounts/warmup-analytics`, { method: "POST", body: { emails: emails.slice(0, 100) } });
    const byEmail: Raw = warm?.aggregate_data ?? warm?.data ?? warm ?? {};
    for (const e of emails) {
      const score = firstNum(byEmail?.[e], ["health_score", "score", "warmup_score"]);
      if (score !== null) health.set(e, score);
    }
  }
  const mailboxes: Mailbox[] = accountsRaw
    .filter((a) => typeof a.email === "string")
    .map((a) => ({
      email: a.email,
      fromName: [a.first_name, a.last_name].filter(Boolean).join(" ") || null,
      dailyLimit: num(a.daily_limit),
      warmupStatus: a.warmup_status != null ? String(a.warmup_status) : null,
      health: health.get(a.email) ?? firstNum(a, ["stat_warmup_score"]),
      // Instantly's numeric account statuses aren't documented in the
      // sources checked, so a mailbox is only judged by its warm-up health.
      broken: false,
    }));

  return finish("instantly", r, { campaigns, steps, mailboxes, timezone });
}

// ── SmartLead (api_key query param) ──────────────────────────────────────

export async function pullSmartlead(key: string, baseUrl = "https://server.smartlead.ai/api/v1"): Promise<SenderIntel> {
  const r = new AccountReader({});
  const api = baseUrl.replace(/\/+$/, "");
  const q = `api_key=${encodeURIComponent(key)}`;

  const list = arr(await r.json("campaigns", `${api}/campaigns?${q}`), "data");
  const campaigns: SenderCampaign[] = list.map((c) => ({ id: String(c.id), name: String(c.name ?? "Campaign"), status: c.status != null ? String(c.status) : null, sent: null, opens: null, replies: null, bounces: null }));
  // Results one campaign at a time; live and finished campaigns first.
  const order = (s: string | null) => (s === "ACTIVE" ? 0 : s === "COMPLETED" ? 1 : s === "PAUSED" ? 2 : 3);
  const toRead = [...campaigns].sort((a, b) => order(a.status) - order(b.status)).slice(0, 20);
  await inBatches(toRead, 5, async (c) => {
    const a: Raw = await r.json("campaign results", `${api}/campaigns/${encodeURIComponent(c.id)}/analytics?${q}`);
    if (!a) return;
    c.sent = firstNum(a, ["unique_sent_count", "sent_count"]);
    c.opens = firstNum(a, ["unique_open_count", "open_count"]);
    c.replies = firstNum(a, ["reply_count"]);
    c.bounces = firstNum(a, ["bounce_count"]);
  });

  const steps: SenderStep[] = [];
  await inBatches([...campaigns].sort(bySent).slice(0, DETAIL_CAMPAIGNS), 3, async (c) => {
    const seqs = arr(await r.json("sequences", `${api}/campaigns/${encodeURIComponent(c.id)}/sequences?${q}`), "data");
    for (const s of seqs) {
      const variant = arr(s, "sequence_variants", "seq_variants")[0];
      const subject = s.subject ?? variant?.subject ?? "";
      const body = s.email_body ?? variant?.email_body ?? "";
      const n = num(s.seq_number);
      if (n !== null && (subject || body)) steps.push({ campaignId: c.id, campaignName: c.name, step: n, subject: String(subject), body: String(body) });
    }
  });

  const accounts = arr(await r.json("mailboxes", `${api}/email-accounts?${q}&offset=0&limit=100`), "data");
  const mailboxes: Mailbox[] = accounts
    .filter((a) => typeof a.from_email === "string")
    .map((a) => ({
      email: a.from_email,
      fromName: a.from_name ?? null,
      dailyLimit: firstNum(a, ["message_per_day", "max_email_per_day"]),
      warmupStatus: a.warmup_details?.status ?? null,
      health: num(String(a.warmup_details?.warmup_reputation ?? "").replace("%", "")),
      broken: a.is_smtp_success === false || a.is_imap_success === false,
    }));

  return finish("smartlead", r, { campaigns, steps, mailboxes, timezone: null });
}

// ── Reply.io (x-api-key header) ──────────────────────────────────────────

export async function pullReplyIo(key: string, baseUrl = "https://api.reply.io/v1"): Promise<SenderIntel> {
  const r = new AccountReader({ "X-Api-Key": key });
  const api = baseUrl.replace(/\/+$/, "");
  const [list, accounts, templates] = await Promise.all([
    r.json<Raw>("campaigns", `${api}/campaigns`),
    r.json<Raw>("mailboxes", `${api}/emailAccounts`),
    r.json<Raw>("templates", `${api}/templates`),
  ]);
  const campaigns: SenderCampaign[] = arr(list).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? "Campaign"),
    status: c.status != null ? String(c.status) : null,
    sent: num(c.deliveriesCount),
    opens: num(c.opensCount),
    replies: num(c.repliesCount),
    bounces: num(c.bouncesCount),
  }));
  // Templates aren't tied to a campaign in this API: each is a first email.
  const steps: SenderStep[] = arr(templates)
    .filter((t) => t.subject || t.body)
    .slice(0, 20)
    .map((t) => ({ campaignId: `template:${t.id}`, campaignName: String(t.name ?? "Template"), step: 1, subject: String(t.subject ?? ""), body: String(t.body ?? "") }));
  const mailboxes: Mailbox[] = arr(accounts)
    .filter((a) => typeof a.emailAddress === "string")
    .map((a) => ({ email: a.emailAddress, fromName: a.senderName ?? null, dailyLimit: null, warmupStatus: null, health: null, broken: false }));
  return finish("reply_io", r, { campaigns, steps, mailboxes, timezone: null });
}

// ── Lemlist (Basic, empty user) ──────────────────────────────────────────

export async function pullLemlist(key: string, baseUrl = "https://api.lemlist.com/api"): Promise<SenderIntel> {
  const r = new AccountReader({ Authorization: `Basic ${Buffer.from(`:${key}`).toString("base64")}` });
  const api = baseUrl.replace(/\/+$/, "");
  const list = arr(await r.json("campaigns", `${api}/campaigns`));
  const campaigns: SenderCampaign[] = list.map((c) => ({ id: String(c._id ?? c.id), name: String(c.name ?? "Campaign"), status: null, sent: 0, opens: 0, replies: 0, bounces: 0 }));
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  // Results from the recent activity feed (a sample, not all time).
  const tally = async (type: string, field: "sent" | "opens" | "replies" | "bounces") => {
    for (let offset = 0; offset < 500 && !r.outOfTime; offset += 100) {
      const page = arr(await r.json("results", `${api}/activities?type=${type}&limit=100&offset=${offset}`));
      for (const a of page) {
        const c = byId.get(String(a.campaignId));
        if (c) c[field] = (c[field] ?? 0) + 1;
      }
      if (page.length < 100) break;
    }
  };
  await Promise.all([tally("emailsSent", "sent"), tally("emailsOpened", "opens"), tally("emailsReplied", "replies"), tally("emailsBounced", "bounces")]);
  return finish("lemlist", r, { campaigns, steps: [], mailboxes: [], timezone: null });
}

export function pullSender(platform: ColdOpenSendPlatformId, key: string, baseUrl?: string): Promise<SenderIntel> {
  switch (platform) {
    case "instantly":
      return pullInstantly(key, baseUrl);
    case "smartlead":
      return pullSmartlead(key, baseUrl);
    case "reply_io":
      return pullReplyIo(key, baseUrl);
    case "lemlist":
      return pullLemlist(key, baseUrl);
  }
}
