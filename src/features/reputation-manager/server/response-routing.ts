// src/features/reputation-manager/server/response-routing.ts
//
// thresholds.yml.template's response-routing matrix — the piece
// rep-thresholds.ts's own comment used to flag as "STILL NOT ported"
// because nothing in this product drafted a response yet. draft-response.ts
// closed half that gap (a manual, chat-triggered draft action) but had zero
// connection to severity score, signal class, or an approval queue. This
// file is the other half: crisis-response-service.ts calls loadRoutingContext
// once and routeOneFinding per contributing finding right after declaring
// an incident, and every finding gets routed to exactly one of the four
// tiers below.
//
// What "publish" means here, honestly: this app has no API for posting a
// reply to Trustpilot, Reddit, or X on the operator's behalf (see
// draft-response.ts's own header) — that's a deliberate scope boundary,
// not an oversight. So "approve" never means "post it for you." It means
// "reviewed and cleared — go paste this where it needs to go," which is
// exactly the spec's own division of labor ("the system drafts; the buyer
// publishes").
import { db } from "@/lib/db";
import { repIncidents, repIdentityGraphs, engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { queuePendingAction } from "@/lib/approval-gate";
import { notifyUser } from "@/lib/notify";
import { logAuditEvent } from "@/features/reputation-manager/server/audit-log";
import { draftResponseText, PLATFORM_LABELS } from "@/features/reputation-manager/server/draft-response";
import {
  resolveResponseTier,
  RESPONSE_POSTURES,
  type ResponseTier,
  type ResponsePostureId,
  type SignalClass,
} from "@/features/reputation-manager/rep-thresholds";
import type { EngagementStack } from "@/models/schema";

export interface RoutableFinding {
  source: "engine_panel" | "trustpilot" | "reddit" | "twitter" | "anomaly";
  excerpt: string;
  flagReason: string | null;
  compositeScore?: number;
  signalClass?: string | null;
}

function platformLabelFor(source: RoutableFinding["source"]): string {
  return PLATFORM_LABELS[source] ?? "this";
}

/** Tier 1/2: auto-draft immediately and queue it for approval — one-click
 * for tier 1, review-and-approve framing for tier 2 (same mechanics today,
 * since this app has no per-tier UI weight yet; the payload's `tier` field
 * is what a future queue-panel affordance would key off). */
async function queueDraftApproval(params: {
  engagementId: string;
  incidentId: string;
  runId: string;
  finding: RoutableFinding;
  tier: "tier1_one_click" | "tier2_review";
  operatorName: string;
  brandVoice: unknown;
}): Promise<void> {
  const platformLabel = platformLabelFor(params.finding.source);
  const draft = await draftResponseText({
    operatorName: params.operatorName,
    findingText: params.finding.excerpt,
    platformLabel,
    brandVoice: params.brandVoice,
    runId: params.runId,
  });

  const draftEventId = await logAuditEvent(params.engagementId, {
    eventType: "draft",
    payload: {
      draftClass: params.finding.source,
      draftPath: `incident:${params.incidentId}`,
      complianceCheck: "passed",
      tier: params.tier === "tier1_one_click" ? 1 : 2,
    },
  });

  const label = params.tier === "tier1_one_click" ? "one-click approve" : "review before approving";
  await queuePendingAction(
    params.engagementId,
    "rep_response_approval",
    {
      incidentId: params.incidentId,
      draftEventId,
      source: params.finding.source,
      findingExcerpt: params.finding.excerpt,
      draftText: draft,
      tier: params.tier,
      _title: `Response draft ready (${label}) — ${platformLabel}`,
    },
    `Severity ${params.finding.compositeScore ?? "n/a"}/100 on ${platformLabel}. Drafted response: "${draft}"`
  );
}

/** Tier 3: no draft. Page the operator with the evidence and the posture
 * menu — thresholds.yml.template's own rationale is that drafting first
 * anchors the operator on the wrong response, so the system refuses to
 * write until a posture is chosen (see the posture route). */
async function pageForPostureChoice(params: {
  tenant: any;
  engagementId: string;
  incidentId: string;
  finding: RoutableFinding;
  operatorName: string;
  soleAuthorityName: string;
}): Promise<void> {
  const platformLabel = platformLabelFor(params.finding.source);
  const postureList = RESPONSE_POSTURES.map((p) => `- ${p.label}`).join("\n");

  await notifyUser({
    whopUserId: params.tenant.whopUserId,
    engagementId: params.engagementId,
    type: "reputation_crisis_declared",
    severity: "critical",
    title: `Response posture needed — ${params.operatorName}`,
    body:
      `A high-severity ${platformLabel} finding needs a response posture before anything gets drafted:\n\n"${params.finding.excerpt}"\n\n` +
      `Choose one from the incident page:\n${postureList}\n\n` +
      `Sole authority on record: ${params.soleAuthorityName}. No draft exists yet — choosing a posture is what generates one.`,
    slackWebhookUrl: (params.tenant.stack as EngagementStack | null)?.slack_webhook_url,
  });
}

/** Tier 4: no draft, no posture menu — this is a legal/personal-safety
 * matter that goes outside the system entirely. Generates the evidence
 * package the operator hands to counsel or a platform's trust & safety
 * team, logs the handoff, and marks the incident as awaiting an outcome
 * the operator brings back (escalate-outcome route). */
export function buildEvidencePackage(params: {
  operatorName: string;
  soleAuthorityName: string;
  incidentId: string;
  severityScore: number;
  signalClass: string | null;
  summary: string;
  findings: RoutableFinding[];
  declaredAt: Date;
}): string {
  const lines: string[] = [
    `Evidence package — ${params.operatorName}`,
    `Incident: ${params.incidentId}`,
    `Declared: ${params.declaredAt.toISOString()}`,
    `Severity: ${params.severityScore}/100${params.signalClass ? ` (force-triggered: ${params.signalClass})` : ""}`,
    `Sole authority: ${params.soleAuthorityName}`,
    "",
    "Summary:",
    params.summary,
    "",
    "Contributing findings:",
  ];
  for (const f of params.findings) {
    lines.push(`- [${f.source}] ${f.excerpt}${f.flagReason ? ` (flagged: ${f.flagReason})` : ""}`);
  }
  lines.push("", "This package was generated for handoff to counsel or a platform's trust & safety team. Log the outcome once you have one.");
  return lines.join("\n");
}

async function escalateExternally(params: {
  tenant: any;
  engagementId: string;
  incidentId: string;
  finding: RoutableFinding;
  operatorName: string;
  soleAuthorityName: string;
  severityScore: number;
  signalClass: string | null;
  summary: string;
  allFindings: RoutableFinding[];
  declaredAt: Date;
}): Promise<void> {
  const evidencePackage = buildEvidencePackage({
    operatorName: params.operatorName,
    soleAuthorityName: params.soleAuthorityName,
    incidentId: params.incidentId,
    severityScore: params.severityScore,
    signalClass: params.signalClass,
    summary: params.summary,
    findings: params.allFindings,
    declaredAt: params.declaredAt,
  });

  await db
    .update(repIncidents)
    .set({ status: "external_escalation_pending", evidencePackage })
    .where(eq(repIncidents.id, params.incidentId));

  // engine_panel-sourced escalations get the spec's dedicated
  // ai_engine_notice event type (a vendor hallucination/spurious-output
  // notice) instead of the generic external_action — genuinely a
  // different kind of handoff (to the AI vendor, not counsel/a platform).
  if (params.finding.source === "engine_panel") {
    await logAuditEvent(params.engagementId, {
      eventType: "ai_engine_notice",
      payload: {
        vendor: "unspecified", // the scored finding doesn't carry which of the 5 engines produced it — see engine-panel-service.ts
        spuriousOutput: params.finding.excerpt,
        evidencePackagePath: `incident:${params.incidentId}`,
      },
    });
  } else {
    await logAuditEvent(params.engagementId, {
      eventType: "external_action",
      payload: { channel: params.finding.source, status: "queued" },
    });
  }

  await notifyUser({
    whopUserId: params.tenant.whopUserId,
    engagementId: params.engagementId,
    type: "reputation_crisis_declared",
    severity: "critical",
    title: `External escalation needed — ${params.operatorName}`,
    body:
      `This incident needs to go outside the system — legal counsel or the platform's own trust & safety team, not a drafted reply.\n\n` +
      `Signal: ${params.signalClass ?? "n/a"}. Severity ${params.severityScore}/100.\n\n` +
      `An evidence package has been generated on the incident page. Log the outcome there once you have one.`,
    slackWebhookUrl: (params.tenant.stack as EngagementStack | null)?.slack_webhook_url,
  });
}

export interface RoutingContext {
  operatorName: string;
  soleAuthorityName: string;
  brandVoice: unknown;
}

/** Fetched once per incident (crisis-response-service.ts wraps this in its
 * own step) and passed into every per-finding routeOneFinding call below —
 * avoids re-fetching the identity graph once per contributing finding. */
export async function loadRoutingContext(engagementId: string): Promise<RoutingContext | null> {
  const [graph] = await db
    .select({ operatorName: repIdentityGraphs.operatorName, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
    .from(repIdentityGraphs)
    .where(eq(repIdentityGraphs.engagementId, engagementId))
    .limit(1);
  if (!graph) return null;

  const [engagementRow] = await db
    .select({ brandVoiceProfile: engagements.brandVoiceProfile })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);

  return { operatorName: graph.operatorName, soleAuthorityName: graph.soleAuthorityName, brandVoice: engagementRow?.brandVoiceProfile ?? null };
}

export interface RouteOneFindingParams {
  tenant: any;
  engagementId: string;
  incidentId: string;
  runId: string;
  context: RoutingContext;
  finding: RoutableFinding;
  severityScore: number;
  declaredSignalClass: string | null;
  summary: string;
  allFindings: RoutableFinding[];
  declaredAt: Date;
}

/**
 * Routes exactly one contributing finding to its response tier and
 * executes that tier's behavior. Deliberately one finding per call, each
 * wrapped in its own step.run by the caller (crisis-response-service.ts) —
 * NOT a loop-with-one-big-step, so a mid-batch retry (an LLM drafting
 * hiccup on finding 3 of 5, say) re-runs only that finding instead of
 * re-queueing duplicate drafts/pending-actions for findings 1-2 that
 * already succeeded. Returns null for a synthetic "anomaly" entry (see
 * anomalyToFinding in crisis-response-service.ts) or any finding with no
 * real compositeScore — there's no content to route to a drafting tier.
 */
export async function routeOneFinding(params: RouteOneFindingParams): Promise<ResponseTier | null> {
  const { finding } = params;
  if (finding.source === "anomaly" || typeof finding.compositeScore !== "number") return null;

  const tier = resolveResponseTier(finding.compositeScore, (finding.signalClass as SignalClass | null) ?? null);

  switch (tier) {
    case "tier1_one_click":
    case "tier2_review":
      await queueDraftApproval({
        engagementId: params.engagementId,
        incidentId: params.incidentId,
        runId: params.runId,
        finding,
        tier,
        operatorName: params.context.operatorName,
        brandVoice: params.context.brandVoice,
      });
      return tier;
    case "tier3_pause_and_instruct":
      await pageForPostureChoice({
        tenant: params.tenant,
        engagementId: params.engagementId,
        incidentId: params.incidentId,
        finding,
        operatorName: params.context.operatorName,
        soleAuthorityName: params.context.soleAuthorityName,
      });
      return tier;
    case "tier4_external_escalation":
      await escalateExternally({
        tenant: params.tenant,
        engagementId: params.engagementId,
        incidentId: params.incidentId,
        finding,
        operatorName: params.context.operatorName,
        soleAuthorityName: params.context.soleAuthorityName,
        severityScore: params.severityScore,
        signalClass: params.declaredSignalClass,
        summary: params.summary,
        allFindings: params.allFindings,
        declaredAt: params.declaredAt,
      });
      return tier;
  }
}

/** Called from the posture-selection API route once the sole authority has
 * chosen a tier-3 posture — generates the draft NOW, to that posture, and
 * queues it for approval exactly like a tier 1/2 draft would be. */
export async function draftForChosenPosture(params: {
  engagementId: string;
  incidentId: string;
  posture: ResponsePostureId;
  runId: string;
}): Promise<void> {
  const [incident] = await db
    .select({ contributingFindings: repIncidents.contributingFindings, severityScore: repIncidents.severityScore })
    .from(repIncidents)
    .where(eq(repIncidents.id, params.incidentId))
    .limit(1);
  if (!incident) throw new Error("Incident not found.");

  const [graph] = await db
    .select({ operatorName: repIdentityGraphs.operatorName })
    .from(repIdentityGraphs)
    .where(eq(repIdentityGraphs.engagementId, params.engagementId))
    .limit(1);
  if (!graph) throw new Error("Identity graph not found.");

  const [engagementRow] = await db
    .select({ brandVoiceProfile: engagements.brandVoiceProfile })
    .from(engagements)
    .where(eq(engagements.engagementId, params.engagementId))
    .limit(1);

  const findings = incident.contributingFindings as RoutableFinding[];
  // The highest-severity real finding is what the posture is drafted
  // against — same "worst finding sets the tone" reasoning the incident's
  // own severityScore already uses.
  const worst = findings
    .filter((f) => f.source !== "anomaly")
    .reduce<RoutableFinding | null>((max, f) => (!max || (f.compositeScore ?? 0) > (max.compositeScore ?? 0) ? f : max), null);
  if (!worst) throw new Error("No draftable finding on this incident.");

  const platformLabel = platformLabelFor(worst.source);
  const draft = await draftResponseText({
    operatorName: graph.operatorName,
    findingText: worst.excerpt,
    platformLabel,
    brandVoice: engagementRow?.brandVoiceProfile ?? null,
    posture: params.posture,
    runId: params.runId,
  });

  const draftEventId = await logAuditEvent(params.engagementId, {
    eventType: "draft",
    payload: { draftClass: worst.source, draftPath: `incident:${params.incidentId}`, complianceCheck: "passed", tier: 3 },
  });

  await queuePendingAction(
    params.engagementId,
    "rep_response_approval",
    {
      incidentId: params.incidentId,
      draftEventId,
      source: worst.source,
      findingExcerpt: worst.excerpt,
      draftText: draft,
      tier: "tier3_pause_and_instruct",
      posture: params.posture,
      _title: `Response draft ready (review before approving) — ${platformLabel}`,
    },
    `Posture chosen: ${RESPONSE_POSTURES.find((p) => p.id === params.posture)?.label ?? params.posture}. Drafted response: "${draft}"`
  );
}
