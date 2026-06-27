import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { eq } from "drizzle-orm";
import { handleInboundBookingEvent } from "@/features/pile-on/server/enrollment-service";
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

    await db.insert(skillRuns).values({
      id: runId,
      engagementId: tenant.engagementId,
      skillName: "pile-on",
      phase: "webhook_received",
      status: "running",
      startedAt: new Date(),
    });

    await handleInboundBookingEvent(payload, tenant, runId);

    return NextResponse.json({ success: true, runId });
  } catch (error: any) {
    console.error("[webhook] booking-event failure:", error.message);
    await db
      .update(skillRuns)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(skillRuns.id, runId))
      .catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}