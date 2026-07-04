import { NextResponse } from "next/server";
import { runCredentialHealthCheck } from "@/features/notifications/server/credential-health";
import { getSession } from "@/lib/session";

/**
 * Manually-triggerable credential health check.
 * Location: src/app/api/crons/credential-health/route.ts
 *
 * credentialHealthCron in src/inngest/crons.ts is what actually runs this
 * daily via Inngest's scheduler. This endpoint is for manual re-checks
 * (e.g. right after a buyer says they reconnected a platform) and external
 * monitoring, same role the other /api/crons/* routes serve.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

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
    const result = await runCredentialHealthCheck();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[CRON CREDENTIAL HEALTH OUTAGE]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
