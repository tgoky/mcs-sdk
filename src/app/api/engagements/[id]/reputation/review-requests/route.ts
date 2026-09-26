import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, reviewRequests, type EngagementStack } from "@/models/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { resolveCredential } from "@/lib/credentials";
import { DEFAULT_REVIEW_DELAY_HOURS, DEFAULT_REVIEW_MESSAGE, DEFAULT_REVIEW_SUBJECT, parseReviewRequestSettings } from "@/features/reputation-manager/server/review-request-message";

export const runtime = "nodejs";
export const revalidate = 0;

async function owned(engagementId: string): Promise<{ stack: EngagementStack | null } | null> {
  const session = await getSession();
  if (!session?.whopUserId) return null;
  const workspace = await getActiveWorkspace(session.whopUserId);
  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, workspace.workspaceId)))
    .limit(1);
  return row ? { stack: row.stack as EngagementStack | null } : null;
}

/** Review request settings, which ways people can be reached, and the last 30 days. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await owned(id);
  if (!row) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
  const stack = row.stack ?? ({} as EngagementStack);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const counts = await db
    .select({ status: reviewRequests.status, n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.engagementId, id), gte(reviewRequests.createdAt, since)))
    .groupBy(reviewRequests.status);

  return NextResponse.json({
    link: stack.rep_review_link ?? "",
    message: stack.rep_review_request_message ?? null,
    subject: stack.rep_review_request_subject ?? null,
    delayHours: stack.rep_review_request_delay_hours ?? null,
    channel: stack.rep_review_request_channel ?? "email",
    defaults: { message: DEFAULT_REVIEW_MESSAGE, subject: DEFAULT_REVIEW_SUBJECT, delayHours: DEFAULT_REVIEW_DELAY_HOURS },
    reach: {
      email: Boolean(await resolveCredential(id, "smtp").catch(() => null)),
      sms: stack.sms_platform === "twilio" || stack.sms_platform === "ghl_sms",
    },
    last30Days: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await owned(id);
  if (!row) return NextResponse.json({ error: "Engagement not found" }, { status: 404 });

  const parsed = parseReviewRequestSettings(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });

  await patchEngagementStack(id, {
    rep_review_link: parsed.link || undefined,
    rep_review_request_message: parsed.message ?? undefined,
    rep_review_request_subject: parsed.subject ?? undefined,
    rep_review_request_delay_hours: parsed.delayHours ?? undefined,
    rep_review_request_channel: parsed.channel,
  });
  return NextResponse.json({ ok: true });
}
