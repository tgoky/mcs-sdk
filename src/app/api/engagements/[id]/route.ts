import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq } from "drizzle-orm";

export const revalidate = 0;

/**
 * Used by the engagements/new setup flow to fetch the final result
 * (confirmationPageUrl, deployment mode, paste-ready HTML if applicable)
 * once its pin-down run finishes — see the polling logic in
 * src/app/dashboard/engagements/new/page.tsx. These fields used to come
 * back synchronously in the POST /api/engagements/setup response; now that
 * setup runs asynchronously via Inngest, the client needs a way to fetch
 * them after the fact.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [row] = await db
    .select({
      engagementId: engagements.engagementId,
      buyer: engagements.buyer,
      confirmationPageUrl: engagements.confirmationPageUrl,
      confirmationPageDeployment: engagements.confirmationPageDeployment,
      pasteReadyHtml: engagements.pasteReadyHtml,
      pasteReadyInstructions: engagements.pasteReadyInstructions,
    })
    .from(engagements)
    .where(and(eq(engagements.engagementId, id), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  return NextResponse.json({ engagement: row });
}
