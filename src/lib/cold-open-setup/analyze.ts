// src/lib/cold-open-setup/analyze.ts
//
// Pure reads over what a sending platform (and the CRM) holds: which past
// campaigns and subject lines got replies, how much the mailboxes can
// safely send, and who actually bought. The platform pulls (sender.ts,
// buyers.ts) fill these shapes; everything here is arithmetic, tested
// without any network.

export interface SenderCampaign {
  id: string;
  name: string;
  status: string | null;
  sent: number | null;
  opens: number | null;
  replies: number | null;
  bounces: number | null;
}

export interface SenderStep {
  campaignId: string;
  campaignName: string;
  /** 1-based position in the sequence. */
  step: number;
  subject: string;
  body: string;
  sent?: number | null;
  replies?: number | null;
}

export interface Mailbox {
  email: string;
  fromName: string | null;
  dailyLimit: number | null;
  warmupStatus: string | null;
  /** 0 to 100 when the platform reports one (warm-up health / reputation). */
  health: number | null;
  /** The platform says it can't send (SMTP failing, paused, errored). */
  broken: boolean;
}

export const pct = (part: number | null | undefined, whole: number | null | undefined): number | null =>
  part != null && whole ? Math.round((part / whole) * 1000) / 10 : null;

export function replyRate(c: Pick<SenderCampaign, "replies" | "sent">): number | null {
  return (c.sent ?? 0) >= 50 ? pct(c.replies, c.sent) : null;
}

/** Campaigns with enough sends to judge, best reply rate first. */
export function rankCampaigns(campaigns: SenderCampaign[]): (SenderCampaign & { replyRate: number })[] {
  return campaigns
    .map((c) => ({ ...c, replyRate: replyRate(c) }))
    .filter((c): c is SenderCampaign & { replyRate: number } => c.replyRate !== null)
    .sort((a, b) => b.replyRate - a.replyRate);
}

export function overallReplyRate(campaigns: SenderCampaign[]): number | null {
  const sent = campaigns.reduce((n, c) => n + (c.sent ?? 0), 0);
  const replies = campaigns.reduce((n, c) => n + (c.replies ?? 0), 0);
  return sent >= 50 ? pct(replies, sent) : null;
}

/** Emails a day the mailboxes can send, counting only ones that work and
 * aren't flagged as unhealthy. */
export function sendCapacity(mailboxes: Mailbox[]): number | null {
  const usable = mailboxes.filter((m) => !m.broken && (m.health == null || m.health >= 70));
  if (usable.length === 0) return mailboxes.length ? 0 : null;
  const known = usable.filter((m) => m.dailyLimit != null);
  return known.length ? known.reduce((n, m) => n + (m.dailyLimit ?? 0), 0) : null;
}

/**
 * New leads a day that fit the mailboxes. Each lead gets a sequence (about
 * three emails over the following days), so a day's sending has to cover
 * today's first emails and earlier leads' follow-ups: a third of capacity.
 * Kept within Daily Send's own 1 to 500 bounds.
 */
export function suggestDailyVolume(capacity: number | null): number | null {
  if (capacity == null) return null;
  if (capacity <= 0) return 0;
  return Math.max(1, Math.min(500, Math.floor(capacity / 3)));
}

export function mailboxDomains(mailboxes: Mailbox[]): string[] {
  const out = new Set<string>();
  for (const m of mailboxes) {
    const d = m.email.split("@")[1]?.trim().toLowerCase();
    if (d) out.add(d);
  }
  return [...out];
}

/** Plain text from an email body a platform stores as HTML. */
export function emailText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * First-email subject lines, best first: by the step's own reply rate when
 * the platform gives per-step numbers, else by its campaign's.
 */
export function rankSubjects(steps: SenderStep[], campaigns: SenderCampaign[], max = 8): { subject: string; campaign: string; replyRate: number | null }[] {
  const rate = new Map(campaigns.map((c) => [c.id, replyRate(c)]));
  const seen = new Set<string>();
  return steps
    .filter((s) => s.step === 1 && s.subject.trim())
    .map((s) => ({ subject: s.subject.trim(), campaign: s.campaignName, replyRate: (s.sent ?? 0) >= 50 ? pct(s.replies, s.sent) : (rate.get(s.campaignId) ?? null) }))
    .sort((a, b) => (b.replyRate ?? -1) - (a.replyRate ?? -1))
    .filter((s) => {
      const k = s.subject.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

export interface Touchset {
  subject: string;
  body1: string;
  body2: string;
  body3: string;
}

/**
 * The client's own sequences as Daily Send touchsets (first subject, then
 * the first three emails), best campaigns first. A two-step sequence
 * repeats its follow-up; a one-step one isn't a sequence and is skipped.
 */
export function touchsetsFromSteps(steps: SenderStep[], campaigns: SenderCampaign[], max = 5): (Touchset & { campaign: string })[] {
  const order = new Map(rankCampaigns(campaigns).map((c, i) => [c.id, i]));
  const byCampaign = new Map<string, SenderStep[]>();
  for (const s of steps) byCampaign.set(s.campaignId, [...(byCampaign.get(s.campaignId) ?? []), s]);
  const out: (Touchset & { campaign: string; rank: number })[] = [];
  for (const [id, list] of byCampaign) {
    const bySlot = new Map<number, SenderStep>();
    for (const s of list) if (!bySlot.has(s.step)) bySlot.set(s.step, s);
    const one = bySlot.get(1);
    const two = bySlot.get(2);
    if (!one || !two || !one.subject.trim()) continue;
    const three = bySlot.get(3) ?? two;
    out.push({ subject: one.subject.trim(), body1: emailText(one.body), body2: emailText(two.body), body3: emailText(three.body), campaign: one.campaignName, rank: order.get(id) ?? 999 });
  }
  return out
    .filter((t) => t.body1 && t.body2)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((t) => ({ subject: t.subject, body1: t.body1, body2: t.body2, body3: t.body3, campaign: t.campaign }));
}

// ── Who buys (won deals' companies) ──────────────────────────────────────

export interface BuyerCompany {
  name?: string | null;
  industry?: string | null;
  employees?: number | null;
}

export interface BuyerProfile {
  wonDeals: number;
  companies: number;
  industries: { industry: string; count: number }[];
  sizes: { band: string; min: number; max: number | null; count: number }[];
  /** The narrowest employee range covering most buyers, or null. */
  sweetSpot: { min: number; max: number | null; share: number } | null;
  examples: string[];
}

const BANDS: { band: string; min: number; max: number | null }[] = [
  { band: "1-10", min: 1, max: 10 },
  { band: "11-50", min: 11, max: 50 },
  { band: "51-200", min: 51, max: 200 },
  { band: "201-1,000", min: 201, max: 1000 },
  { band: "1,000+", min: 1001, max: null },
];

/** HubSpot industries come as ENUM_LIKE_VALUES. */
export function prettyIndustry(raw: string): string {
  return /^[A-Z0-9_]+$/.test(raw) ? raw.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : raw;
}

export function buyerProfile(companies: BuyerCompany[], wonDeals: number): BuyerProfile {
  const industries = new Map<string, number>();
  for (const c of companies) {
    const i = c.industry?.trim();
    if (i) industries.set(prettyIndustry(i), (industries.get(prettyIndustry(i)) ?? 0) + 1);
  }
  const sized = companies.map((c) => c.employees).filter((n): n is number => typeof n === "number" && n > 0);
  const sizes = BANDS.map((b) => ({ ...b, count: sized.filter((n) => n >= b.min && (b.max == null || n <= b.max)).length })).filter((b) => b.count > 0);

  // Smallest run of adjacent bands holding at least 70% of sized buyers.
  let sweetSpot: BuyerProfile["sweetSpot"] = null;
  if (sized.length >= 5) {
    const counts = BANDS.map((b) => sized.filter((n) => n >= b.min && (b.max == null || n <= b.max)).length);
    for (let width = 1; width <= BANDS.length && !sweetSpot; width++) {
      for (let start = 0; start + width <= BANDS.length; start++) {
        const n = counts.slice(start, start + width).reduce((a, b) => a + b, 0);
        if (n / sized.length >= 0.7) {
          sweetSpot = { min: BANDS[start].min, max: BANDS[start + width - 1].max, share: Math.round((n / sized.length) * 100) };
          break;
        }
      }
    }
  }
  return {
    wonDeals,
    companies: companies.length,
    industries: [...industries.entries()].map(([industry, count]) => ({ industry, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    sizes,
    sweetSpot,
    examples: companies.map((c) => c.name?.trim()).filter((n): n is string => Boolean(n)).slice(0, 6),
  };
}

// ── Making past emails safe for Daily Send ───────────────────────────────
//
// Daily Send puts the greeting and sign-off around the first email itself
// (copy-engine.ts applyGreetingAndSignOff) and inserts bodies as written:
// it fills no {{tokens}} inside them. So an imported first email loses its
// own greeting and sign-off, and anything still holding a field we can't
// fill is dropped, never sent with a raw {{companyName}} in it.

const GREETING = /^(hi|hey|hello|hiya|dear|good (morning|afternoon|evening))\b[^\n]{0,40}$/i;
const SIGN_OFF = /^(best|thanks|thank you|cheers|regards|kind regards|best regards|warm regards|talk soon|all the best|warmly|sincerely|speak soon)\b[^\n]{0,20}$/i;
const PLATFORM_COMPANY = /\{\{\s*(company|companyname|company_name)\s*\}\}/gi;
const ANY_TOKEN = /\{\{[^}]*\}\}|\{[a-z_]+\}/i;

/** A platform subject line in the app's token format, or null when it
 * holds a field the subject engine can't fill. */
export function platformSubject(subject: string): string | null {
  const s = subject.trim().replace(PLATFORM_COMPANY, "{company_name}");
  return ANY_TOKEN.test(s.replace(/\{company_name\}/g, "")) ? null : s;
}

function stripGreetingAndSignOff(text: string): { body: string; greeting: string | null; signOff: string | null } {
  const lines = text.split("\n");
  let greeting: string | null = null;
  let signOff: string | null = null;
  if (lines.length && GREETING.test(lines[0].trim())) {
    greeting = lines[0].trim().split(/[\s,]/)[0];
    lines.shift();
  }
  for (let i = Math.max(0, lines.length - 4); i < lines.length; i++) {
    if (SIGN_OFF.test(lines[i].trim())) {
      signOff = lines[i].trim().replace(/,$/, "");
      lines.splice(i);
      break;
    }
  }
  return { body: lines.join("\n").trim(), greeting, signOff };
}

export function importTouchset(t: Touchset): Touchset | null {
  const subject = platformSubject(t.subject);
  const first = stripGreetingAndSignOff(t.body1).body;
  if (!subject || !first) return null;
  const bodies = [first, t.body2.trim(), t.body3.trim()];
  if (bodies.some((b) => ANY_TOKEN.test(b))) return null;
  return { subject, body1: bodies[0], body2: bodies[1], body3: bodies[2] };
}

/** The greeting word and sign-off the client actually uses, most common. */
export function voiceFromSteps(steps: SenderStep[]): { greeting: string | null; signOff: string | null } {
  const count = (xs: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const read = steps.filter((s) => s.step === 1).map((s) => stripGreetingAndSignOff(emailText(s.body)));
  const greeting = count(read.map((r) => r.greeting));
  return { greeting: greeting ? greeting.charAt(0).toUpperCase() + greeting.slice(1).toLowerCase() : null, signOff: count(read.map((r) => r.signOff)) };
}
