import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { AuditEngine } from "@/features/leak-map/server/audit-engine";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") ?? "weekly") as "weekly" | "monthly";

  const activeEngagements = await db.select().from(engagements);
  const engine = new AuditEngine();
  const errors: string[] = [];

  for (const tenant of activeEngagements) {
    try {
      await engine.runAuditPipeline(tenant.engagementId, type);
    } catch (err: any) {
      errors.push(`${tenant.engagementId}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    engagementsAudited: activeEngagements.length,
    auditType: type,
    errors,
  });
}