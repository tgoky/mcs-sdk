import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";
import { getSession } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  const { searchParams } = new URL(request.url);
  const urlEngagementId = searchParams.get("engagement_id");

  // Check if request originates from an active browser session (Dashboard manual run)
  const session = await getSession();
  const isUserAuthenticated = !!session.whopUserId;

  if (
    process.env.NODE_ENV === "production" &&
    !isUserAuthenticated &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  // FIXED: Scope targeting to specific tenant when invoked by manual UI dashboard buttons
  let targets = [];
  if (urlEngagementId) {
    targets = await db
      .select()
      .from(engagements)
      .where(eq(engagements.engagementId, urlEngagementId));
  } else {
    targets = await db.select().from(engagements);
  }

  let totalBriefs = 0;
  const errors: string[] = [];

  for (const tenant of targets) {
    try {
      const count = await executeNightlyBriefingCycle(tenant);
      totalBriefs += count;
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    engagementsProcessed: targets.length,
    briefsDelivered: totalBriefs,
    errors,
  });
}