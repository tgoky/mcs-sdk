import { NextResponse } from "next/server";
import { runCredentialHealthCheck } from "@/features/notifications/server/credential-health";
import { requireCronOrAdmin } from "@/lib/cron-auth";

/**
 * Manually-triggerable credential health check.
 * Location: src/app/api/crons/credential-health/route.ts
 *
 * credentialHealthCron in src/inngest/crons.ts is what actually runs this
 * daily via Inngest's scheduler. This endpoint is for manual re-checks
 * (e.g. right after a buyer says they reconnected a platform) and external
 * monitoring, same role the other /api/crons/* routes serve. Runs across
 * every tenant's credentials, so it's gated to CRON_SECRET or an admin
 * session only (see src/lib/cron-auth.ts) — not any logged-in customer.
 */
export async function GET(request: Request) {
  const auth = await requireCronOrAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await runCredentialHealthCheck();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[CRON CREDENTIAL HEALTH OUTAGE]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
