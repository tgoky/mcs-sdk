import { NextResponse } from "next/server";
import { evaluateActiveAlertMonitor } from "@/features/leak-map/server/alert-monitor";
import { getSession } from "@/lib/session";

/**
 * Automated Active Alert Monitor Cron Router
 * Location: src/app/api/crons/alert-monitor/route.ts
 * Executed every 6 hours per the root vercel.json configurations
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allows session-authenticated dashboard bypass for manual testing hooks
  const session = await getSession();
  const isUserAuthenticated = !!session.whopUserId;

  if (
    process.env.NODE_ENV === "production" &&
    !isUserAuthenticated &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized Access Denied", { status: 401 });
  }

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