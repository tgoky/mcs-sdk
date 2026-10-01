// src/app/api/admin/queue-metrics/route.ts
//
// Skill run queue wait and run time, for the operator (CRON_SECRET or an
// admin session; see src/lib/cron-auth.ts). ?hours= sets the window
// (default 24, at most a week).
import { NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { getQueueMetrics } from "@/lib/queue-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;
  const requested = Number(new URL(request.url).searchParams.get("hours"));
  const hours = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 168) : 24;
  return NextResponse.json(await getQueueMetrics(hours), { headers: { "Cache-Control": "no-store" } });
}
