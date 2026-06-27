import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";
import { getSession } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "weekly") as "weekly" | "monthly";
  const urlEngagementId = searchParams.get("engagement_id");

  const session = await getSession();
  const isUserAuthenticated = !!session.whopUserId;

  if (
    process.env.NODE_ENV === "production" &&
    !isUserAuthenticated &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  // FIXED: Restrict metric evaluation boundaries to individual client spaces
  let targets = [];
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, urlEngagementId));
  } else {
    targets = await db.select().from(engagements);
  }

  const engine = new AuditEngine();
  const errors: string[] = [];

  for (const tenant of targets) {
    try {
      await engine.runAuditPipeline(tenant.engagementId, type);
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    engagementsAudited: targets.length,
    auditType: type,
    errors,
  });
}