// src/lib/error-reporting.ts
//
// Where errors go so the owner hears about a crash before a client does.
// Every server error (instrumentation.ts onRequestError), every background
// job that finally fails (inngest/function-failed.ts) and every page crash
// a signed-in user hits (api/errors/client) comes through reportError.
//
//   SENTRY_DSN                       → sent to Sentry as an event, over its
//                                      plain HTTP envelope API (no SDK).
//   ERROR_ALERT_SLACK_WEBHOOK_URL    → a Slack message, at most one per
//                                      distinct error every 15 minutes.
//
// Neither set: logged to the console only, as before. Reporting never
// throws and never waits more than a few seconds.

import crypto from "crypto";

export interface ErrorContext {
  /** Where it happened: "request", "job", "client". */
  kind: "request" | "job" | "client";
  /** A route, a job id, a page path. */
  where: string;
  engagementId?: string | null;
  runId?: string | null;
  extra?: Record<string, unknown>;
}

export interface NormalizedError {
  name: string;
  message: string;
  stack: string | null;
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) return { name: error.name || "Error", message: error.message || "(no message)", stack: error.stack ?? null };
  if (error && typeof error === "object") {
    const o = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof o.name === "string" ? o.name : "Error",
      message: typeof o.message === "string" ? o.message : JSON.stringify(error).slice(0, 500),
      stack: typeof o.stack === "string" ? o.stack : null,
    };
  }
  return { name: "Error", message: String(error), stack: null };
}

/** Same error in the same place: numbers and ids in the message don't make
 * it a new one (a failed booking 123 and booking 456 are one problem). */
export function fingerprint(e: NormalizedError, ctx: Pick<ErrorContext, "kind" | "where">): string {
  const shape = e.message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>").replace(/\d+/g, "<n>").slice(0, 200);
  return crypto.createHash("sha1").update(`${ctx.kind}|${ctx.where}|${e.name}|${shape}`).digest("hex").slice(0, 16);
}

// ── Sentry ───────────────────────────────────────────────────────────────

export interface SentryTarget {
  endpoint: string;
  publicKey: string;
}

/** https://<key>@<host>/<project> → the project's envelope endpoint. */
export function parseSentryDsn(dsn: string | undefined): SentryTarget | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !project || !/^\d+$/.test(project.split("/").pop()!)) return null;
    const pathPrefix = project.includes("/") ? `/${project.split("/").slice(0, -1).join("/")}` : "";
    return { endpoint: `${url.protocol}//${url.host}${pathPrefix}/api/${project.split("/").pop()}/envelope/`, publicKey: url.username };
  } catch {
    return null;
  }
}

export function sentryEnvelope(e: NormalizedError, ctx: ErrorContext, fp: string, now = new Date()): string {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    fingerprint: [fp],
    exception: { values: [{ type: e.name, value: e.message }] },
    tags: { kind: ctx.kind, where: ctx.where, ...(ctx.engagementId ? { engagement: ctx.engagementId } : {}) },
    extra: { ...(ctx.extra ?? {}), ...(ctx.runId ? { runId: ctx.runId } : {}), ...(e.stack ? { stack: e.stack.slice(0, 8000) } : {}) },
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

// ── Slack, throttled ─────────────────────────────────────────────────────

const SLACK_QUIET_MS = 15 * 60 * 1000;
const lastSlackAt = new Map<string, number>();

export function shouldAlert(fp: string, now = Date.now()): boolean {
  const last = lastSlackAt.get(fp);
  if (last !== undefined && now - last < SLACK_QUIET_MS) return false;
  lastSlackAt.set(fp, now);
  if (lastSlackAt.size > 500) lastSlackAt.delete(lastSlackAt.keys().next().value!);
  return true;
}

async function post(url: string, init: RequestInit): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function reportError(error: unknown, ctx: ErrorContext): Promise<void> {
  const e = normalizeError(error);
  const fp = fingerprint(e, ctx);
  console.error(`[error:${ctx.kind}] ${ctx.where}${ctx.engagementId ? ` (${ctx.engagementId})` : ""}: ${e.name}: ${e.message}`);

  const tasks: Promise<void>[] = [];
  const sentry = parseSentryDsn(process.env.SENTRY_DSN);
  if (sentry) {
    tasks.push(
      post(sentry.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${sentry.publicKey}, sentry_client=mcs-error-reporting/1.0` },
        body: sentryEnvelope(e, ctx, fp),
      })
    );
  }
  const slack = process.env.ERROR_ALERT_SLACK_WEBHOOK_URL;
  if (slack && shouldAlert(fp)) {
    const lines = [`*${ctx.kind === "job" ? "Background job failed" : ctx.kind === "client" ? "A page crashed" : "Server error"}* in \`${ctx.where}\``, `${e.name}: ${e.message}`.slice(0, 500)];
    if (ctx.engagementId) lines.push(`Client: ${ctx.engagementId}`);
    if (ctx.runId) lines.push(`Run: ${ctx.runId}`);
    tasks.push(post(slack, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines.join("\n") }) }));
  }
  await Promise.allSettled(tasks);
}
