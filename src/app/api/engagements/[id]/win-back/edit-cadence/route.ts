// src/app/api/engagements/[id]/win-back/edit-cadence/route.ts
//
// Real editability for one touchpoint in this engagement's Recovery
// Cadence — the gap flagged repeatedly this session ("edit? dude i cant
// edit it"). winBackSequenceAssetMap is engagement-level, not per-
// enrollment, and is read fresh at send time for direct-send accounts
// (processWinBackEmailSmtpSequence in src/inngest/win-back-email-smtp.ts),
// so a save here changes exactly what a future scheduled touchpoint
// actually sends for every active SMTP enrollment — not just cosmetic.
// For an ESP platform (Klaviyo/HubSpot/ActiveCampaign/GHL), day-N content
// lives in that platform's own workflow, built by the buyer — this only
// updates the reference copy shown on the run page and in the export
// bundle, which the view itself says plainly (see win-back-view.tsx's
// editNote).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const body = await req.json().catch(() => null);
    const type = body?.type === "email" || body?.type === "sms" ? body.type : null;
    const messageId = typeof body?.id === "string" ? body.id : null;
    const newBody = typeof body?.body === "string" ? body.body.trim() : null;
    const newSubject = typeof body?.subject === "string" ? body.subject.trim() : "";

    if (!type || !messageId || !newBody) {
      return NextResponse.json({ error: "type ('email' or 'sms'), id, and a non-empty body are required." }, { status: 400 });
    }
    if (type === "email" && !newSubject) {
      return NextResponse.json({ error: "Subject can't be empty for an email touchpoint." }, { status: 400 });
    }

    const [tenant] = await db
      .select({ engagementId: engagements.engagementId, winBackSequenceAssetMap: engagements.winBackSequenceAssetMap })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, engagementId),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ error: "Engagement not found or access denied." }, { status: 404 });
    }

    const assetMap = tenant.winBackSequenceAssetMap;
    if (!assetMap) {
      return NextResponse.json({ error: "No win-back cadence has been generated for this engagement yet." }, { status: 404 });
    }

    const list = type === "email" ? assetMap.emails ?? [] : assetMap.sms ?? [];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx === -1) {
      return NextResponse.json(
        { error: "That touchpoint isn't part of the current cadence anymore — it may have been regenerated." },
        { status: 404 }
      );
    }

    const nextAssetMap =
      type === "email"
        ? {
            ...assetMap,
            emails: assetMap.emails.map((e, i) => (i === idx ? { ...e, subject: newSubject, body: newBody } : e)),
          }
        : {
            ...assetMap,
            sms: assetMap.sms.map((s, i) => (i === idx ? { ...s, body: newBody } : s)),
          };

    await db.update(engagements).set({ winBackSequenceAssetMap: nextAssetMap }).where(eq(engagements.engagementId, engagementId));

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
