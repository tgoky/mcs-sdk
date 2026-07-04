import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { credentialsRefs, engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { getSession } from "@/lib/session";

/**
 * Same verified-endpoint set as runCredentialHealthCheck() in
 * src/features/notifications/server/credential-health.ts — see the
 * comment there for why this list isn't just "every provider we support."
 */
const VALIDATORS: Record<string, (secret: string) => Promise<void>> = {
  calendly: (token) => new CalendlyClient(token).checkCredentialHealth(),
  cal_com: (token) => new CalComClient(token).checkCredentialHealth(),
};

/**
 * "Test connection" button on the credentials page — lets a buyer confirm
 * a key works right after pasting it in, instead of waiting for tomorrow's
 * daily credentialHealthCron to find out for them.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { engagementId, provider } = await request.json();
  if (!engagementId || !provider) {
    return NextResponse.json({ error: "Missing engagementId or provider" }, { status: 400 });
  }

  const validate = VALIDATORS[provider];
  if (!validate) {
    return NextResponse.json(
      { error: `No verified connection test available for "${provider}" yet.` },
      { status: 400 }
    );
  }

  // Ownership check — same pattern as the credentials save route.
  const [owned] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, session.whopUserId)))
    .limit(1);
  if (!owned) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  try {
    const secret = await resolveCredential(engagementId, provider);
    await validate(secret);

    await db
      .update(credentialsRefs)
      .set({ healthStatus: "ok", lastCheckedAt: new Date(), lastCheckError: null })
      .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)));

    return NextResponse.json({ ok: true, status: "ok" });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(credentialsRefs)
      .set({ healthStatus: "invalid", lastCheckedAt: new Date(), lastCheckError: message.slice(0, 500) })
      .where(and(eq(credentialsRefs.engagementId, engagementId), eq(credentialsRefs.provider, provider)));

    return NextResponse.json({ ok: false, status: "invalid", error: message }, { status: 200 });
  }
}
