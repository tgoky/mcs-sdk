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

    // Read and write under a row lock: two edits at once (or an edit
    // landing while the cadence regenerates) used to each write back their
    // own stale copy of the whole cadence, silently undoing the other.
    const outcome = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .select({ engagementId: engagements.engagementId, winBackSequenceAssetMap: engagements.winBackSequenceAssetMap })
        .from(engagements)
        .where(
          and(
            eq(engagements.engagementId, engagementId),
            eq(engagements.whopUserId, session.whopUserId),
            eq(engagements.workspaceId, activeWorkspace.workspaceId)
          )
        )
        .for("update")
        .limit(1);

      if (!tenant) return { status: 404, error: "Engagement not found or access denied." } as const;

      const assetMap = tenant.winBackSequenceAssetMap;
      if (!assetMap) return { status: 404, error: "No win-back cadence has been generated for this engagement yet." } as const;

      const list = type === "email" ? assetMap.emails ?? [] : assetMap.sms ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) {
        return { status: 404, error: "That touchpoint isn't part of the current cadence anymore. It may have been regenerated." } as const;
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

      await tx.update(engagements).set({ winBackSequenceAssetMap: nextAssetMap }).where(eq(engagements.engagementId, engagementId));
      return null;
    });

    if (outcome) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
