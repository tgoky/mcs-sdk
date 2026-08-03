import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { briefedCallsLog, engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";
import { deliverBrief } from "@/lib/platforms/email";

export const runtime = "nodejs";

/**
 * Backs the run-detail page's "Re-send Brief to Slack" control
 * (src/app/dashboard/runs/[id]/views/pre-call-read-view.tsx). Previously
 * that button only flipped local component state — clicking it never
 * called any endpoint, because none existed. deliverBrief() itself has
 * always supported being called more than once; the gap was purely that
 * nothing on the operator-facing side let you call it again for a
 * specific already-briefed call.
 *
 * Deliberately Slack-only, matching what the button actually says. A
 * general "redeliver to whatever destination this was configured for"
 * route would need the prospect's email for the crm_note case and for
 * the Slack interactive-button context — briefed_calls_log doesn't store
 * it (see the module comment on that table in schema.ts), so silently
 * degrading a resend for a non-Slack engagement, or reconstructing a
 * fake email, would be worse than failing loudly here.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select({
        id: briefedCallsLog.id,
        briefText: briefedCallsLog.briefText,
        stack: engagements.stack,
      })
      .from(briefedCallsLog)
      .innerJoin(engagements, eq(briefedCallsLog.engagementId, engagements.engagementId))
      .where(and(eq(briefedCallsLog.id, id), eq(engagements.whopUserId, session.whopUserId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Briefed call not found." }, { status: 404 });
    }

    if (!row.briefText) {
      return NextResponse.json(
        { error: "No brief text has been generated for this call yet." },
        { status: 400 }
      );
    }

    const stack = row.stack as EngagementStack | null;
    if (!stack?.slack_webhook_url) {
      return NextResponse.json(
        { error: "This engagement doesn't have a Slack webhook configured." },
        { status: 422 }
      );
    }

    await deliverBrief("slack", row.briefText, "", stack.slack_webhook_url);

    const [updated] = await db
      .update(briefedCallsLog)
      .set({ briefDeliveredAt: new Date(), destinationDelivered: "slack" })
      .where(eq(briefedCallsLog.id, id))
      .returning({
        briefDeliveredAt: briefedCallsLog.briefDeliveredAt,
        destinationDelivered: briefedCallsLog.destinationDelivered,
      });

    return NextResponse.json({ success: true, ...updated });
  } catch (err) {
    console.error("[pre-call-read/calls/[id]/resend]", err);
    return NextResponse.json({ error: "Failed to resend brief to Slack." }, { status: 500 });
  }
}
