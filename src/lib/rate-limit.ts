// src/lib/rate-limit.ts
//
// Stops floods and runaway costs: a webhook address hammered by a replay
// or a misconfigured tool, a signed-in user clicking an action that calls
// AI models over and over. Counted in Postgres (rate_limit_buckets) so the
// limit holds across every server instance, in fixed windows: the first
// request after a window ends starts a new one.
//
// If the count can't be read (database hiccup), the request is let
// through: a limiter must never be the thing that takes the app down.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimitBuckets } from "@/models/schema";

export interface RateLimitRule {
  /** What's being limited, e.g. "twilio-inbound". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/** The caller's address, from the proxy's headers. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function hitRateLimit(rule: RateLimitRule, subject: string, now = new Date()): Promise<RateLimitResult> {
  const key = `${rule.name}:${subject}`;
  const windowFloor = new Date(now.getTime() - rule.windowSeconds * 1000);
  try {
    // One atomic statement: start a new window if the old one has ended,
    // otherwise count this request in it.
    const [row] = await db
      .insert(rateLimitBuckets)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: {
          count: sql`case when ${rateLimitBuckets.windowStart} <= ${windowFloor} then 1 else ${rateLimitBuckets.count} + 1 end`,
          windowStart: sql`case when ${rateLimitBuckets.windowStart} <= ${windowFloor} then ${now} else ${rateLimitBuckets.windowStart} end`,
        },
      })
      .returning({ count: rateLimitBuckets.count, windowStart: rateLimitBuckets.windowStart });
    const count = row?.count ?? 1;
    const started = row?.windowStart ? new Date(row.windowStart).getTime() : now.getTime();
    const retryAfterSeconds = Math.max(1, Math.ceil((started + rule.windowSeconds * 1000 - now.getTime()) / 1000));
    return { allowed: count <= rule.limit, count, retryAfterSeconds };
  } catch (err) {
    console.error(`[rate-limit] couldn't count ${key}; letting it through:`, err instanceof Error ? err.message : err);
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }
}

/** For route handlers: null to carry on, or the 429 to return. */
export async function rateLimitResponse(rule: RateLimitRule, subject: string, message = "Too many requests. Try again shortly."): Promise<NextResponse | null> {
  const result = await hitRateLimit(rule, subject);
  if (result.allowed) return null;
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}

/** Old windows, for the daily clean-up. */
export async function deleteExpiredRateLimitBuckets(olderThanSeconds = 24 * 60 * 60, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanSeconds * 1000);
  const deleted = await db.delete(rateLimitBuckets).where(sql`${rateLimitBuckets.windowStart} < ${cutoff}`).returning({ key: rateLimitBuckets.key });
  return deleted.length;
}

// ── The limits ───────────────────────────────────────────────────────────
// Generous for real use, tight enough to stop a flood or a cost runaway.

export const RATE_LIMITS = {
  /** Per client: Twilio posts one request per text and status change. */
  twilioWebhook: { name: "twilio-webhook", limit: 600, windowSeconds: 60 },
  /** Per client: forwarded email replies. */
  inboundReply: { name: "inbound-reply", limit: 120, windowSeconds: 60 },
  /** Per user: setup "activate" reads a site and calls AI models. */
  setupActivate: { name: "setup-activate", limit: 20, windowSeconds: 10 * 60 },
  /** Per user: a manual skill run. */
  skillTrigger: { name: "skill-trigger", limit: 30, windowSeconds: 10 * 60 },
  /** Per IP: sign-in redirects. */
  authLogin: { name: "auth-login", limit: 30, windowSeconds: 60 },
  /** Per user: page-crash reports. */
  clientErrors: { name: "client-errors", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;
