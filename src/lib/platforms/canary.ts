// src/lib/platforms/canary.ts
//
// Tier 4 #28 — synthetic canary tenant.
//
// credential-health.ts already answers "is THIS buyer's credential still
// valid" for every real tenant, daily. This answers a different question:
// "does our adapter code still correctly talk to each platform's current
// API," independent of any specific buyer's credential ever expiring or
// getting revoked. Without this, an upstream API change (a renamed field,
// a deprecated endpoint, a new required header) surfaces for the first
// time as a buyer-reported incident — possibly weeks after the platform
// actually shipped the breaking change, if the affected code path isn't
// exercised often.
//
// Mechanism: a single, real, non-buyer-facing engagement row (its
// engagementId set via CANARY_ENGAGEMENT_ID) holds the team's own
// dedicated test/sandbox credentials for whichever platforms are worth
// canarying, resolved through the exact same resolveCredential() every
// other engagement uses — no special-casing needed. A weekly cron fans
// out one check per registered CANARY_CHECKS entry (see
// src/inngest/crons.ts's canaryWeeklySweep / checkCanarySingle, mirroring
// credentialHealthCron's fan-out shape exactly) and records the result to
// canaryRuns.
//
// Scope, deliberately: this reuses ONLY the two provider checks that
// credential-health.ts has already verified against live docs
// (CalendlyClient / CalComClient's checkCredentialHealth) rather than
// inventing new "cheapest safe read-only call" guesses for every other
// provider this app integrates with. credential-health.ts's own comment
// explains why that caution matters — a wrong guess either false-flags a
// healthy integration or silently never catches a real drift. Extending
// CANARY_CHECKS to more providers is a real recovery item, but it's
// exactly as much doc-verification work per provider as adding one to
// VALIDATORS was, not a mechanical copy-paste.
import { CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { resolveCredential } from "@/lib/credentials";

export interface CanaryCheckDefinition {
  platform: "calendly" | "cal_com";
  adapterMethod: string; // human label, matches canaryRuns.adapterMethod
  run: (secret: string) => Promise<void>;
}

export const CANARY_CHECKS: CanaryCheckDefinition[] = [
  {
    platform: "calendly",
    adapterMethod: "CalendlyClient.checkCredentialHealth",
    run: (token) => new CalendlyClient(token).checkCredentialHealth(),
  },
  {
    platform: "cal_com",
    adapterMethod: "CalComClient.checkCredentialHealth",
    run: (token) => new CalComClient(token).checkCredentialHealth(),
  },
];

/**
 * The canary engagement's id — a real row in `engagements`, set up once
 * with the team's own test/sandbox credentials for whichever platforms in
 * CANARY_CHECKS are configured. Unset (the common case until an operator
 * deliberately provisions one) means the weekly sweep has nothing to do
 * and no-ops cleanly rather than erroring.
 */
export function getCanaryEngagementId(): string | null {
  return process.env.CANARY_ENGAGEMENT_ID?.trim() || null;
}

/**
 * Runs one canary check against the canary engagement's credential for
 * that platform. Returns a result rather than throwing — the caller
 * (checkCanarySingle in crons.ts) is responsible for turning "error" into
 * a canaryRuns row and an alert, same failure-isolation shape
 * credential-health.ts already uses per-credential.
 */
export async function runCanaryCheck(
  check: CanaryCheckDefinition
): Promise<{ status: "ok" | "drift_detected" | "error"; detail?: string; latencyMs: number }> {
  const engagementId = getCanaryEngagementId();
  const started = Date.now();

  if (!engagementId) {
    return { status: "error", detail: "CANARY_ENGAGEMENT_ID is not set", latencyMs: 0 };
  }

  try {
    const secret = await resolveCredential(engagementId, check.platform);
    await check.run(secret);
    return { status: "ok", latencyMs: Date.now() - started };
  } catch (e: any) {
    // Two distinct failure modes collapse into the same "needs a human
    // look" outcome here, deliberately: no credential configured on the
    // canary engagement yet (an ops setup gap) vs. checkCredentialHealth
    // throwing because the adapter genuinely can't talk to the platform
    // anymore (the thing this mechanism exists to catch). This module
    // can't tell those apart automatically — that's a judgment call for
    // whoever reviews the alert, not something to guess at silently here.
    return { status: "drift_detected", detail: e.message, latencyMs: Date.now() - started };
  }
}
