import { NextResponse } from "next/server";
import { evaluateActiveAlertMonitor } from "@/features/leak-map/server/alert-monitor";
import { requireCronOrAdmin } from "@/lib/cron-auth";

/**
 * Automated Active Alert Monitor Cron Router
 * Location: src/app/api/crons/alert-monitor/route.ts
 * Executed every 6 hours per the root vercel.json configurations
 */
export async function GET(request: Request) {
  // evaluateActiveAlertMonitor() runs globally across every tenant's
  // active alerts — gated to CRON_SECRET or an admin session only, not
  // "anyone with a session" (see src/lib/cron-auth.ts for why).
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const actionCount = await evaluateActiveAlertMonitor();
    return NextResponse.json({
      success: true,
      alertsEvaluated: true,
      actionsTriggered: actionCount,
    });
  } catch (error: any) {
    console.error("[CRON ALERT MONITOR OUTAGE]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}