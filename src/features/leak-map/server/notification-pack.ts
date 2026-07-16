import { db } from "@/lib/db";
import { activeAlerts } from "@/models/schema";
import { eq, and } from "drizzle-orm";

/**
 * Leak Map recovery gap 3 — notification pack. The OG SKILL.md shipped a
 * curated set of suggested alerts at Plan (references/notification_pack.md
 * in the Skill Pack), each shown with what it watches, the threshold, the
 * severity, and the reasoning — buyer opts in wholesale, cherry-picks,
 * adjusts thresholds, or skips entirely. Nothing runs unless activated.
 *
 * The canonical list here maps 1:1 onto the metric names
 * alert-monitor.ts's evaluator actually understands (see
 * AUDIT_METRIC_NAME_MAP there) — a pack alert for a metric nothing
 * evaluates would silently never fire, which defeats the entire point of
 * "curated and known-good." person_match_confidence is evaluated live
 * every cycle; the rest are read from the most recent completed Leak Map
 * audit run.
 */

export interface PackAlertDefinition {
  id: string;
  metricName: string;
  label: string;
  watches: string;
  defaultThreshold: number;
  comparison: "above" | "below";
  defaultSeverity: "high" | "medium" | "low";
  reasoning: string;
}

export const NOTIFICATION_PACK: PackAlertDefinition[] = [
  {
    id: "low_identity_confidence",
    metricName: "person_match_confidence",
    label: "Identity match confidence dropping",
    watches: "Average Rule 14 identity-match score across briefed calls in the last 24 hours.",
    defaultThreshold: 70,
    comparison: "below",
    defaultSeverity: "high",
    reasoning:
      "A sustained drop usually means booking-form data quality slipped (a required field got made optional, a form embed broke) — every brief below threshold is a rep walking in blind.",
  },
  {
    id: "show_rate_drop",
    metricName: "show_rate",
    label: "Booking show-rate falling",
    watches: "Show-rate on the connected booking platform, most recent Leak Map audit.",
    defaultThreshold: 50,
    comparison: "below",
    defaultSeverity: "high",
    reasoning:
      "Show-rate is usually the single highest-leverage number in the whole funnel — a drop here compounds into every downstream metric.",
  },
  {
    id: "email_open_rate_drop",
    metricName: "email_open_rate",
    label: "Email open-rate falling",
    watches: "Pile-On sequence open-rate on the connected ESP, most recent Leak Map audit.",
    defaultThreshold: 25,
    comparison: "below",
    defaultSeverity: "medium",
    reasoning:
      "A falling open-rate often means a deliverability problem (domain reputation, spam-folder placement) rather than a content problem — worth catching before it silently erodes the whole sequence's effectiveness.",
  },
  {
    id: "pipeline_win_rate_drop",
    metricName: "crm_pipeline_win_rate",
    label: "CRM pipeline win-rate falling",
    watches: "Closed-won rate on the connected CRM, most recent Leak Map audit.",
    defaultThreshold: 20,
    comparison: "below",
    defaultSeverity: "medium",
    reasoning: "Directly ties funnel health to actual revenue outcomes, not just activity metrics upstream of the close.",
  },
  {
    id: "brief_volume_drop",
    metricName: "brief_delivery_volume",
    label: "Brief delivery volume dropping",
    watches: "Total briefs delivered, current vs. prior window, most recent Leak Map audit.",
    defaultThreshold: -10,
    comparison: "below",
    defaultSeverity: "low",
    reasoning:
      "A sharp drop usually means the nightly cron or a webhook subscription silently broke, not that booking volume actually fell — this is often the first sign something upstream needs attention.",
  },
];

export function getNotificationPackDefinitions(): PackAlertDefinition[] {
  return NOTIFICATION_PACK;
}

/**
 * Activates a pack alert for an engagement. Idempotent — activating an
 * already-active pack alert for the same metric updates the threshold/
 * severity in place rather than creating a duplicate row, so re-running
 * the onboarding checklist (or an operator changing their mind) doesn't
 * pile up redundant alerts that would all fire together.
 */
export async function activateNotificationPackAlert(
  engagementId: string,
  packAlertId: string,
  thresholdOverride?: number,
  severityOverride?: "high" | "medium" | "low"
): Promise<void> {
  const def = NOTIFICATION_PACK.find((p) => p.id === packAlertId);
  if (!def) {
    throw new Error(`Unknown notification pack alert id: ${packAlertId}`);
  }

  const existing = await db
    .select({ id: activeAlerts.id })
    .from(activeAlerts)
    .where(
      and(
        eq(activeAlerts.engagementId, engagementId),
        eq(activeAlerts.metricName, def.metricName),
        eq(activeAlerts.source, "pack")
      )
    )
    .limit(1);

  const threshold = String(thresholdOverride ?? def.defaultThreshold);
  const severity = severityOverride ?? def.defaultSeverity;

  if (existing.length > 0) {
    await db
      .update(activeAlerts)
      .set({ threshold, comparison: def.comparison, severity })
      .where(eq(activeAlerts.id, existing[0].id));
    return;
  }

  await db.insert(activeAlerts).values({
    engagementId,
    metricName: def.metricName,
    threshold,
    comparison: def.comparison,
    evaluationPeriod: "rolling_24h",
    severity,
    source: "pack",
  });
}

export async function deactivateNotificationPackAlert(engagementId: string, packAlertId: string): Promise<void> {
  const def = NOTIFICATION_PACK.find((p) => p.id === packAlertId);
  if (!def) return;

  await db
    .delete(activeAlerts)
    .where(
      and(
        eq(activeAlerts.engagementId, engagementId),
        eq(activeAlerts.metricName, def.metricName),
        eq(activeAlerts.source, "pack")
      )
    );
}
