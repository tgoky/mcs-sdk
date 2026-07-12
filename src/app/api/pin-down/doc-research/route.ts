import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { platformAdapterDrafts } from "@/models/schema";
import { desc, eq } from "drizzle-orm";

/**
 * Pin-Down recovery gap 6 — lists platform adapter research drafts for
 * admin review. GET only; drafts themselves are created automatically by
 * onboarding-service.ts whenever an operator selects "discover_from_docs"
 * for hosting or booking. Reviewing (approving/rejecting) happens at
 * POST /api/pin-down/doc-research/[draftId]/review.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session.whopUserId || !isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // optional filter: pending_review | approved | rejected

  const rows = status
    ? await db
        .select()
        .from(platformAdapterDrafts)
        .where(eq(platformAdapterDrafts.status, status))
        .orderBy(desc(platformAdapterDrafts.createdAt))
    : await db.select().from(platformAdapterDrafts).orderBy(desc(platformAdapterDrafts.createdAt));

  return NextResponse.json({ drafts: rows });
}
