import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Playbook 5.6's own trigger config — src/inngest/whop-agent.ts's
 * membership.cancel_at_period_end_changed handler never proposes a save
 * offer unless whop_save_offer_discount_percentage/duration_months/message
 * are all set on this engagement's stack; without this route (or hand-
 * editing the stack), the skill can be toggled on and does nothing on every
 * real cancel-intent event it ever sees. min_tenure_days/cooldown_days are
 * optional — the handler already defaults those to 30/90 when unset.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  return NextResponse.json({
    discountPercentage: stack.whop_save_offer_discount_percentage ?? null,
    durationMonths: stack.whop_save_offer_duration_months ?? null,
    message: stack.whop_save_offer_message ?? "",
    minTenureDays: stack.whop_save_offer_min_tenure_days ?? null,
    cooldownDays: stack.whop_save_offer_cooldown_days ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const body = await req.json().catch(() => ({}));
  const discountPercentage = Number(body?.discountPercentage);
  const durationMonths = Number(body?.durationMonths);
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage > 100) {
    return NextResponse.json({ error: "Discount percentage must be a number between 1 and 100." }, { status: 400 });
  }
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    return NextResponse.json({ error: "Duration (months) must be a positive whole number." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "The offer message is required — Section 8.3 never proposes an offer with a guessed message." }, { status: 400 });
  }

  let minTenureDays: number | undefined;
  if (body?.minTenureDays !== undefined && body?.minTenureDays !== null && body?.minTenureDays !== "") {
    minTenureDays = Number(body.minTenureDays);
    if (!Number.isInteger(minTenureDays) || minTenureDays < 0) {
      return NextResponse.json({ error: "Minimum tenure (days) must be a whole number of 0 or more." }, { status: 400 });
    }
  }
  let cooldownDays: number | undefined;
  if (body?.cooldownDays !== undefined && body?.cooldownDays !== null && body?.cooldownDays !== "") {
    cooldownDays = Number(body.cooldownDays);
    if (!Number.isInteger(cooldownDays) || cooldownDays < 0) {
      return NextResponse.json({ error: "Cooldown (days) must be a whole number of 0 or more." }, { status: 400 });
    }
  }

  const [row] = await db
    .select({ stack: engagements.stack })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId), eq(engagements.workspaceId, activeWorkspace.workspaceId)))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);
  await db
    .update(engagements)
    .set({
      stack: {
        ...stack,
        whop_save_offer_discount_percentage: discountPercentage,
        whop_save_offer_duration_months: durationMonths,
        whop_save_offer_message: message,
        whop_save_offer_min_tenure_days: minTenureDays,
        whop_save_offer_cooldown_days: cooldownDays,
      },
      updatedAt: new Date(),
    })
    .where(eq(engagements.engagementId, id));

  return NextResponse.json({ ok: true });
}
