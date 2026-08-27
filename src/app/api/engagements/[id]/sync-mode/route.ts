import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import { buildWebhookReceiverUrl } from "@/lib/booking-sync-status";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Lets a buyer control their own booking_platform's sync mode from
 * Settings → Booking Sync (or the engagement detail page), instead of it
 * being fixed forever at whatever onboarding picked. This is the backend
 * for the "auto-polling vs direct webhook" choice — same two-option
 * pattern this app already offers, just made explicit and switchable.
 *
 * Body: { mode?: "webhook" | "polling"; pollIntervalMinutes?: number; dismissSetupNudge?: boolean }
 *
 * Switching TO "webhook" is always safe to do before the buyer has
 * actually pasted the URL into their platform — nothing is destructive,
 * and switching back to "polling" is one click away. Switching away from
 * "polling" takes effect on the buyer's very next 5-minute cron tick:
 * findEngagementsDueForPoll() (booking-poller.ts) filters at the SQL level
 * on webhook_receiver_mode = 'polling', so a "webhook" engagement simply
 * stops being selected — no separate stop/cleanup step needed.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const dismissSetupNudge = body?.dismissSetupNudge === true;
    // Lets an existing polling-mode engagement's cadence actually be
    // changed — the ?? fallback below only ever applies when the field
    // has never been set, so without this, an engagement already stuck
    // on some prior default (30, or an even older 5) has no way to move
    // off it short of a direct DB edit.
    const pollIntervalMinutes = body?.pollIntervalMinutes;
    if (
      pollIntervalMinutes !== undefined &&
      (typeof pollIntervalMinutes !== "number" || !Number.isFinite(pollIntervalMinutes) || pollIntervalMinutes < 1)
    ) {
      return NextResponse.json({ error: "pollIntervalMinutes must be a positive number." }, { status: 400 });
    }

    if (mode !== undefined && mode !== "webhook" && mode !== "polling") {
      return NextResponse.json({ error: "mode must be 'webhook' or 'polling'." }, { status: 400 });
    }

    const [row] = await db
      .select({ engagementId: engagements.engagementId, stack: engagements.stack })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const stack = (row.stack as EngagementStack | null) ?? ({} as EngagementStack);

    if (!stack.booking_platform || !stack.booking_platform_credentials_ref) {
      return NextResponse.json(
        { error: "Connect a booking platform in Settings → Credentials before changing sync mode." },
        { status: 409 }
      );
    }

    const nextStack: EngagementStack = { ...stack };

    if (mode === "webhook") {
      // Generate a signing secret if this engagement somehow doesn't have
      // one yet (older engagements onboarded before this was pre-generated
      // — see onboarding-service.ts). Never overwrite an existing secret:
      // the buyer may have already pasted the current one into their
      // platform's workflow.
      if (!nextStack.webhook_signing_secret) {
        nextStack.webhook_signing_secret = crypto.randomBytes(32).toString("hex");
      }
      nextStack.webhook_receiver_mode = "webhook";
    } else if (mode === "polling") {
      nextStack.webhook_receiver_mode = "polling";
      nextStack.webhook_poll_interval_minutes =
        pollIntervalMinutes ?? nextStack.webhook_poll_interval_minutes ?? 25;
      // First cycle after switching back looks one interval behind
      // instead of from whatever stale watermark was left over, same
      // "don't backfill the buyer's entire history" reasoning
      // pollBookingsForEngagement uses for a brand-new polling tenant.
      nextStack.webhook_receiver_last_polled_at = new Date(
        Date.now() - nextStack.webhook_poll_interval_minutes * 60_000
      ).toISOString();
    } else if (pollIntervalMinutes !== undefined && stack.webhook_receiver_mode === "polling") {
      // Already in polling mode and only the interval is changing — same
      // watermark-rewind logic as above, without requiring the caller to
      // also re-send mode: "polling".
      nextStack.webhook_poll_interval_minutes = pollIntervalMinutes;
      nextStack.webhook_receiver_last_polled_at = new Date(
        Date.now() - pollIntervalMinutes * 60_000
      ).toISOString();
    }

    if (dismissSetupNudge) {
      nextStack.webhook_receiver_setup_dismissed = true;
    } else if (mode === "webhook") {
      // Switching TO webhook mode is itself an explicit resolution of the
      // nudge — clear any stale dismissal so a future switch back to
      // polling shows the nudge fresh again instead of staying silently
      // suppressed forever.
      nextStack.webhook_receiver_setup_dismissed = false;
    }

    await db
      .update(engagements)
      .set({ stack: nextStack, updatedAt: new Date() })
      .where(eq(engagements.engagementId, id));

    return NextResponse.json({
      ok: true,
      mode: nextStack.webhook_receiver_mode ?? null,
      pollIntervalMinutes: nextStack.webhook_poll_interval_minutes ?? null,
      webhookUrl: buildWebhookReceiverUrl(id),
      // Only ever returned right after it's (re)generated or on request —
      // this is a shared secret the buyer needs to configure their
      // platform's workflow with, not a one-time-reveal token, so it's
      // fine to keep returning it on every call here (the settings UI
      // masks it behind a reveal toggle the same way credential values are
      // masked elsewhere in this app).
      signingSecret: nextStack.webhook_signing_secret ?? null,
      dismissed: Boolean(nextStack.webhook_receiver_setup_dismissed),
    });
  } catch (err) {
    console.error("[engagements/[id]/sync-mode PATCH]", err);
    return NextResponse.json({ error: "Failed to update sync mode." }, { status: 500 });
  }
}