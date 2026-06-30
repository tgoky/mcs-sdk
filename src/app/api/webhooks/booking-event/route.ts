import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { handleInboundBookingEvent, classifyBookingEvent } from "@/features/pile-on/server/enrollment-service";
import { startRun, failRun } from "@/lib/run-log";
import crypto from "crypto";

export async function POST(request: Request) {
  const runId = crypto.randomUUID();

  try {
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText);

    const { searchParams } = new URL(request.url);
    const engagementId =
      searchParams.get("engagement_id") ?? payload.engagement_id;

    if (!engagementId) {
      return new Response("Missing engagement_id parameter", { status: 400 });
    }

    const tenant = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, engagementId))
      .then((r) => r[0]);

    if (!tenant) {
      return new Response("Engagement not found", { status: 404 });
    }

    // FIXED: classify the event BEFORE startRun so the correct skillName
    // ("pile-on" vs "win-back") is set on the very first row insert. This
    // used to be hardcoded to "pile-on" here and "corrected" mid-run by
    // enrollment-service via a rename side-channel whenever the event
    // turned out to be a cancellation — two separate event-type checks
    // that could drift apart, plus a brief window where every win-back run
    // was mislabeled as pile-on in the dashboard.
    const eventKind = classifyBookingEvent(payload);
    const skillName = eventKind === "cancelled" ? "win-back" : "pile-on";

    await startRun({
      id: runId,
      engagementId: tenant.engagementId,
      skillName,
      phase: "webhook_received",
      label: payload.event ?? payload.trigger ?? "booking event",
    });

    await handleInboundBookingEvent(payload, tenant, runId, eventKind);

    return NextResponse.json({ success: true, runId });
  } catch (error: any) {
    console.error("[webhook] booking-event failure:", error.message);
    await failRun(runId, error, {
      summary: {
        whatWasAttempted: ["Process inbound booking webhook event."],
        whatWorked: [],
        whatFailed: [error.message],
        openItems: ["This booking event was not enrolled in any sequence — check the payload shape against the configured booking platform."],
        decisionsMade: [],
      },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}