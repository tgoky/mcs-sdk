// src/features/reputation-manager/server/review-request-message.ts
//
// The pure half of review requests (review-requests.ts): the message, the
// channel, and how "reviewed after asking" is matched. No db imports, so
// the setup screen can preview the message too.

export type ReviewTrigger = "showed" | "paid";

export const DEFAULT_REVIEW_MESSAGE = "Hi {name}, thanks for your time with us. Would you share how it went? It takes a minute: {link}";
export const DEFAULT_REVIEW_SUBJECT = "Quick favour, {name}?";
export const DEFAULT_REVIEW_DELAY_HOURS = 2;
/** One person is asked at most once in this many days, however many triggers. */
export const ASK_AGAIN_AFTER_DAYS = 90;
/** A review counts as "after asking" when it lands within this many days. */
export const REVIEW_MATCH_DAYS = 30;

export function renderReviewRequest(template: string, name: string | null | undefined, link: string): string {
  const first = name?.trim().split(/\s+/)[0] || "there";
  return template.replaceAll("{name}", first).replaceAll("{link}", link).trim();
}

/** The client's preferred channel when it can be used, else the other one. */
export function pickReviewChannel(opts: { prefer: "email" | "sms"; emailReady: boolean; smsReady: boolean }): "email" | "sms" | null {
  const order: ("email" | "sms")[] = opts.prefer === "sms" ? ["sms", "email"] : ["email", "sms"];
  return order.find((c) => (c === "email" ? opts.emailReady : opts.smsReady)) ?? null;
}

/** Names compared the way a review shows them: lowercase letters only,
 * first and last word. "Sam  Lee-Park" and "sam lee-park" match. */
export function nameKey(name: string | null | undefined): string | null {
  const words = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 2) return null; // a first name alone matches too many people
  return `${words[0]} ${words[words.length - 1]}`;
}

/** Reviews that came from people who were asked: same full name, posted
 * after the request and within REVIEW_MATCH_DAYS. A name match, so it's
 * reported as "likely", not proven. */
export function reviewsAfterAsking(
  asked: { name: string | null; sentAt: Date }[],
  reviews: { author: string | null; postedAt: Date }[]
): number {
  const window = REVIEW_MATCH_DAYS * 24 * 60 * 60 * 1000;
  const byName = new Map<string, Date[]>();
  for (const a of asked) {
    const k = nameKey(a.name);
    if (k) byName.set(k, [...(byName.get(k) ?? []), a.sentAt]);
  }
  let n = 0;
  for (const r of reviews) {
    const sent = byName.get(nameKey(r.author) ?? "");
    if (sent?.some((s) => r.postedAt >= s && r.postedAt.getTime() - s.getTime() <= window)) n++;
  }
  return n;
}

export interface ReviewRequestSettings {
  link: string;
  message: string | null;
  subject: string | null;
  delayHours: number | null;
  channel: "email" | "sms";
}

/** Checks what the settings screen sends. The link must be a public https
 * address the client owns the review page for; nothing else is required. */
export function parseReviewRequestSettings(body: unknown): ReviewRequestSettings | { error: string; field: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const link = typeof b.link === "string" ? b.link.trim() : "";
  if (link) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return { error: "The review link isn't a web address.", field: "link" };
    }
    if (url.protocol !== "https:") return { error: "The review link must start with https://.", field: "link" };
  }
  const text = (v: unknown, max: number, field: string, label: string): string | null | { error: string; field: string } => {
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return null;
    if (typeof v !== "string") return { error: `${label} must be text.`, field };
    if (v.trim().length > max) return { error: `Keep ${label.toLowerCase()} under ${max} characters.`, field };
    return v.trim();
  };
  const message = text(b.message, 600, "message", "The message");
  if (message && typeof message === "object") return message;
  if (typeof message === "string" && !message.includes("{link}")) return { error: "Put {link} in the message so people can reach your review page.", field: "message" };
  const subject = text(b.subject, 150, "subject", "The subject");
  if (subject && typeof subject === "object") return subject;
  let delayHours: number | null = null;
  if (b.delayHours !== undefined && b.delayHours !== null && b.delayHours !== "") {
    delayHours = Number(b.delayHours);
    if (!Number.isFinite(delayHours) || delayHours < 0 || delayHours > 168) return { error: "Wait between 0 and 168 hours (a week).", field: "delayHours" };
  }
  const channel = b.channel === "sms" ? "sms" : "email";
  return { link, message: message as string | null, subject: subject as string | null, delayHours, channel };
}
