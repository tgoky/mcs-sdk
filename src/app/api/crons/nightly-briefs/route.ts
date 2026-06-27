import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { executeNightlyBriefingCycle } from "@/features/pre-call-read/server/brief-service";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const activeEngagements = await db.select().from(engagements);
  let totalBriefs = 0;
  const errors: string[] = [];

  for (const tenant of activeEngagements) {
    try {
      const count = await executeNightlyBriefingCycle(tenant);
      totalBriefs += count;
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    engagementsProcessed: activeEngagements.length,
    briefsDelivered: totalBriefs,
    errors,
  });
}