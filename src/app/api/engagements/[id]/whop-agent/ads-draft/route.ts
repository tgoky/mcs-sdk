import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session";
import { isAuthorizedForEngagement } from "@/lib/whop-access";
import { queueAdsFlipToActive } from "@/features/whop-agent/server/whop-ads-service";
import { startRun } from "@/lib/run-log";
import { inngest, whopAdsDraftProcess } from "@/lib/inngest";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";

export const runtime = "nodejs";
export const revalidate = 0;

/** Dispatches the draft flow (pre-flight, media generate+poll, ad create)
 * through Inngest — see runWhopAdsDraft's own doc comment for why this
 * isn't synchronous. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Fix (found by this session's own Whop Agent audit): this route
  // dispatches real, billable Meta ad-media generation and previously had
  // no check that the skill is actually turned on for this client — a
  // disabled toggle in the dashboard didn't stop it. See
  // chat-whop-agent.ts's requireSkillEnabled for the full bug.
  if (!(await isSkillEnabledForEngagement(id, "whop-ads-draft-approve"))) {
    return NextResponse.json({ error: "Whop Ads Draft-and-Approve is currently turned off for this client." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.productId !== "string" || typeof body?.creativeBrief !== "string" || typeof body?.budgetCents !== "number") {
    return NextResponse.json({ error: "productId, creativeBrief, and budgetCents are required." }, { status: 400 });
  }
  if (body.budgetLevel !== "ad_group" && body.budgetLevel !== "campaign") {
    return NextResponse.json({ error: "budgetLevel must be 'ad_group' or 'campaign' — budget lives at exactly one level." }, { status: 400 });
  }

  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId: id, skillName: "whop-ads-draft-approve", phase: "social_account_preflight", label: "Whop Ads draft" });
  await inngest.send(
    whopAdsDraftProcess.create({
      runId,
      engagementId: id,
      input: { productId: body.productId, creativeBrief: body.creativeBrief, budgetCents: body.budgetCents, budgetLevel: body.budgetLevel, targeting: body.targeting },
    })
  );
  return NextResponse.json({ runId });
}

/** Queues the flip-to-active confirmation — always gated (Section 8.3). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId || !(await isAuthorizedForEngagement(session, id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSkillEnabledForEngagement(id, "whop-ads-draft-approve"))) {
    return NextResponse.json({ error: "Whop Ads Draft-and-Approve is currently turned off for this client." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.adId !== "string" || typeof body?.budgetCents !== "number") {
    return NextResponse.json({ error: "adId and budgetCents are required." }, { status: 400 });
  }
  try {
    const pendingActionId = await queueAdsFlipToActive(id, body.adId, body.budgetCents);
    return NextResponse.json({ pendingActionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue the flip-to-active action.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
