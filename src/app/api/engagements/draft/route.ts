import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { engagementDrafts } from "@/models/schema";
import { eq } from "drizzle-orm";
import { stripDraftSecrets } from "@/lib/draft-fields";

/**
 * Server-side backup for the "new engagement" wizard's in-progress state.
 *
 * The wizard's fast path is sessionStorage (see
 * src/app/dashboard/engagements/new/page.tsx) — instant, no round trip,
 * survives a same-tab refresh. This route exists for everything
 * sessionStorage doesn't survive: closing the tab, closing the app, or the
 * host frame getting torn down and recreated. One row per whopUserId.
 *
 * formData is stripped of API-key-shaped fields here even though the
 * client is supposed to have already stripped them before sending —
 * this route never trusts that. See src/lib/draft-fields.ts.
 */

export async function GET() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(engagementDrafts)
    .where(eq(engagementDrafts.whopUserId, session.whopUserId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ draft: null });
  }

  return NextResponse.json({
    draft: { step: row.step, formData: row.formData, updatedAt: row.updatedAt },
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const step = typeof body?.step === "string" ? body.step : null;
  const formData =
    body?.formData && typeof body.formData === "object" ? body.formData : null;

  if (!step || !formData) {
    return NextResponse.json(
      { error: "Missing step or formData" },
      { status: 400 }
    );
  }

  const safeFormData = stripDraftSecrets(formData);

  await db
    .insert(engagementDrafts)
    .values({
      whopUserId: session.whopUserId,
      step,
      formData: safeFormData,
    })
    .onConflictDoUpdate({
      target: engagementDrafts.whopUserId,
      set: {
        step,
        formData: safeFormData,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db
    .delete(engagementDrafts)
    .where(eq(engagementDrafts.whopUserId, session.whopUserId));

  return NextResponse.json({ success: true });
}
