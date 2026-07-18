import { db } from "@/lib/db";
import { credentialsRefs, engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "@/lib/credentials";
import { CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { MailchimpClient, ConvertKitClient, SMTPClient, parseSmtpCredential } from "@/lib/platforms/email";
import { notifyUser } from "@/lib/notify";

/**
 * Providers with a verified "am I still authenticated" endpoint wired up.
 * Every entry here was checked against the provider's current, live docs
 * (see the comments on CalendlyClient.checkCredentialHealth /
 * CalComClient.checkCredentialHealth in src/lib/platforms/booking.ts, and
 * on MailchimpClient/ConvertKitClient/SMTPClient's checkCredentialHealth
 * in src/lib/platforms/email.ts) — not assumed from memory.
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
  mailchimp: (key) => new MailchimpClient(key).checkCredentialHealth(),
  convertkit: (secret) => new ConvertKitClient(secret).checkCredentialHealth(),
  smtp: (raw) => new SMTPClient(parseSmtpCredential(raw)).checkCredentialHealth(),
};

export interface CredentialHealthResult {
  checked: number;
  flagged: number;
  skippedNoValidator: number;
}

/**
 * Cheap, DB-only prep step: returns the ids of every credential row we
 * have a validator for (skipping ones we can't check at all). No network
 * calls here — this is what credentialHealthCron's single step.run() does,
 * before fanning out one credentialHealthCheckSingle event per id. See the
 * comment on that event type in src/lib/inngest.ts for why this split
 * exists: the previous version ran every provider's real API call inside
 * one step, which meant Inngest's checkpointing had no step boundary to
 * yield at until the entire loop across every tenant's credentials
 * finished.
 */
export async function findCredentialsNeedingCheck(): Promise<string[]> {
  const rows = await db.select({ id: credentialsRefs.id, provider: credentialsRefs.provider }).from(credentialsRefs);
  return rows.filter((r) => VALIDATORS[r.provider]).map((r) => r.id);
}

/**
 * The actual per-credential work: resolve the secret, call the provider,
 * record the result, and — only on the ok -> invalid transition — notify
 * the buyer. This is the one real network call per invocation, now run
 * inside its own fanned-out Inngest function (checkSingleCredentialHealthCron
 * in crons.ts) instead of inside a loop shared with every other tenant's
 * credentials.
 */
export async function checkSingleCredential(
  credentialId: string
): Promise<{ flagged: boolean; skipped: boolean }> {
  const [row] = await db.select().from(credentialsRefs).where(eq(credentialsRefs.id, credentialId)).limit(1);
  if (!row) return { flagged: false, skipped: true };

  const validate = VALIDATORS[row.provider];
  if (!validate) return { flagged: false, skipped: true };

  let secret: string;
  try {
    secret = await resolveCredential(row.engagementId, row.provider);
  } catch (e) {
    await db
      .update(credentialsRefs)
      .set({
        healthStatus: "check_failed",
        lastCheckedAt: new Date(),
        lastCheckError: e instanceof Error ? e.message.slice(0, 500) : String(e),
      })
      .where(eq(credentialsRefs.id, row.id));
    return { flagged: false, skipped: false };
  }

  try {
    await validate(secret);
    await db
      .update(credentialsRefs)
      .set({ healthStatus: "ok", lastCheckedAt: new Date(), lastCheckError: null })
      .where(eq(credentialsRefs.id, row.id));
    return { flagged: false, skipped: false };
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
        return { flagged: true, skipped: false };
      }
    }
    return { flagged: false, skipped: false };
  }
}

/**
 * Sequential, does-everything-in-one-call version — kept for the manual
 * on-demand route (/api/crons/credential-health), where a human explicitly
 * triggered it and there's no serverless-timeout concern the way there is
 * for a scheduled cron running unattended at scale. The scheduled cron
 * (credentialHealthCron) does NOT call this — it fans out via
 * findCredentialsNeedingCheck + checkSingleCredential instead.
 */
export async function runCredentialHealthCheck(): Promise<CredentialHealthResult> {
  const ids = await findCredentialsNeedingCheck();
  let flagged = 0;
  for (const id of ids) {
    const result = await checkSingleCredential(id);
    if (result.flagged) flagged++;
  }
  const totalRows = await db.select({ id: credentialsRefs.id }).from(credentialsRefs);
  return { checked: ids.length, flagged, skippedNoValidator: totalRows.length - ids.length };
}
