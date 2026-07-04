import { db } from "@/lib/db";
import { credentialsRefs, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { notifyUser } from "@/lib/notify";

/**
 * Providers with a verified "am I still authenticated" endpoint wired up.
 * Every entry here was checked against the provider's current, live docs
 * (see the comments on CalendlyClient.checkCredentialHealth /
 * CalComClient.checkCredentialHealth in src/lib/platforms/booking.ts) —
 * not assumed from memory.
 *
 * Deliberately NOT including klaviyo, hubspot, activecampaign, or ghl yet:
 * adding a provider here without first confirming its real validation
 * endpoint would risk flagging a healthy credential as broken (a false
 * "reconnect this" alert is its own trust problem) or silently never
 * catching a real outage. Extend this map only after doing that same
 * doc-check for the new provider.
 */
const VALIDATORS: Record<string, (secret: string) => Promise<void>> = {
  calendly: (token) => new CalendlyClient(token).checkCredentialHealth(),
  cal_com: (token) => new CalComClient(token).checkCredentialHealth(),
};

export interface CredentialHealthResult {
  checked: number;
  flagged: number;
  skippedNoValidator: number;
}

/**
 * Runs once daily (see credentialHealthCron in src/inngest/crons.ts).
 * For every credential we CAN validate: calls the provider, records the
 * result, and — only on the ok -> invalid transition — notifies the buyer.
 * Re-checking a credential that's already known-invalid does NOT re-notify
 * every day; that would just be daily spam for a problem the buyer already
 * knows about and hasn't fixed yet.
 */
export async function runCredentialHealthCheck(): Promise<CredentialHealthResult> {
  const rows = await db.select().from(credentialsRefs);

  let checked = 0;
  let flagged = 0;
  let skippedNoValidator = 0;

  for (const row of rows) {
    const validate = VALIDATORS[row.provider];
    if (!validate) {
      skippedNoValidator++;
      continue;
    }
    checked++;

    let secret: string;
    try {
      secret = await resolveCredential(row.engagementId, row.provider);
    } catch (e) {
      // Can't decrypt — treat as a check failure, not a hard "invalid",
      // since this could be a transient decryption/env issue rather than
      // a genuinely bad credential.
      await db
        .update(credentialsRefs)
        .set({
          healthStatus: "check_failed",
          lastCheckedAt: new Date(),
          lastCheckError: e instanceof Error ? e.message.slice(0, 500) : String(e),
        })
        .where(eq(credentialsRefs.id, row.id));
      continue;
    }

    try {
      await validate(secret);
      await db
        .update(credentialsRefs)
        .set({ healthStatus: "ok", lastCheckedAt: new Date(), lastCheckError: null })
        .where(eq(credentialsRefs.id, row.id));
    } catch (err: any) {
      const wasHealthyOrUnknown = row.healthStatus !== "invalid";

      await db
        .update(credentialsRefs)
        .set({
          healthStatus: "invalid",
          lastCheckedAt: new Date(),
          lastCheckError: err.message?.slice(0, 500) ?? String(err),
        })
        .where(eq(credentialsRefs.id, row.id));

      if (wasHealthyOrUnknown) {
        const [tenant] = await db
          .select({ whopUserId: engagements.whopUserId, stack: engagements.stack })
          .from(engagements)
          .where(eq(engagements.engagementId, row.engagementId))
          .limit(1);

        if (tenant) {
          await notifyUser({
            whopUserId: tenant.whopUserId,
            engagementId: row.engagementId,
            type: "credential_invalid",
            severity: "critical",
            title: `${row.provider} connection needs attention`,
            body: `Your ${row.provider} credential stopped working (${err.message}). Runs that depend on it — bookings, briefs, reschedule links — will fail until it's reconnected in Credentials.`,
            slackWebhookUrl: (tenant.stack as EngagementStack | null)?.slack_webhook_url,
          });
          flagged++;
        }
      }
    }
  }

  return { checked, flagged, skippedNoValidator };
}
