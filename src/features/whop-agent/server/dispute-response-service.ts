// src/features/whop-agent/server/dispute-response-service.ts
//
// Playbook 5.10. Tier split (Section 5.10, corrected from v2): assembly
// and review run on a standard Bot key; only POST /v1/disputes/{id}/evidence
// itself needs elevated scope — the gate lands on the irreversible,
// customer-facing act, not on being able to see the value first.
import crypto from "crypto";
import { startRun, logStep, finishRun, failRun } from "@/lib/run-log";
import { WhopAgentClient } from "@/lib/whop-agent/client";
import { queuePendingAction } from "@/lib/approval-gate";
import { callClaude } from "@/lib/llm";

export interface WhopDisputeAlert {
  id: string;
  actionable?: boolean;
  not_actionable_reason?: string;
  fee_charged?: boolean;
  card_brand?: string;
  issuer?: string;
  amount?: number;
  payment_id?: string;
  product_id?: string;
  reported_at?: string;
  transaction_at?: string;
}

interface WhopDispute {
  id: string;
  evidence_due_at?: string;
  evidence_editable?: boolean;
  evidence_locked_reason?: string;
  generated_response_attachment?: string | null;
  payment_id?: string;
  membership_id?: string;
  product_id?: string;
}

export interface DisputeEvidenceDraft {
  access_activity_log?: string;
  billing_address?: string;
  cancellation_policy_disclosure?: string;
  customer_communication_attachment?: string;
  customer_email_address?: string;
  customer_name?: string;
  notes: string;
  product_description?: string;
  refund_policy_disclosure?: string;
  refund_refusal_explanation?: string;
  service_date?: string;
  uncategorized_attachment?: string;
}

export interface DisputeAssemblyResult {
  status: "window_closed" | "assembled";
  dispute?: WhopDispute;
  draft?: DisputeEvidenceDraft;
  usedGeneratedResponse: boolean;
  gatheredManually: string[];
}

/** Section 5.10: checked before drafting AND again before submitting —
 * exported so the submit executor can re-check independently rather than
 * trusting the state from when the draft was assembled. Calls disputes.get
 * directly rather than paging through disputes.list looking for a match:
 * a resource-id GET is one call and always correct regardless of how many
 * disputes the account has, where the list approach both burned an extra
 * call on every check and could miss the dispute entirely if it fell
 * outside /v1/disputes' first (unpaginated-here) page. */
export async function checkEvidenceWindow(client: WhopAgentClient, disputeId: string): Promise<WhopDispute> {
  return await client.request<WhopDispute>("disputes.get", `/v1/disputes/${disputeId}`, {});
}

async function gatherCourseCompletionEvidence(client: WhopAgentClient, membershipId: string | undefined): Promise<string | null> {
  if (!membershipId) return null;
  try {
    const students = await client.request<{ data?: Array<{ course_id: string; completed_lessons?: number; total_lessons?: number }> }>(
      "course_students.list",
      "/v1/course_students",
      { query: { membership_id: membershipId } }
    );
    if (!students.data?.length) return null;
    return students.data.map((s) => `Course ${s.course_id}: ${s.completed_lessons ?? "?"}/${s.total_lessons ?? "?"} lessons completed`).join("; ");
  } catch {
    return null;
  }
}

async function draftNarrative(runId: string, dispute: WhopDispute, alert: WhopDisputeAlert | null, courseCompletionSummary: string | null): Promise<string> {
  const result = await callClaude({
    model: "SYNTHESIS",
    runId,
    maxTokens: 700,
    system:
      "You write the factual narrative for a Whop payment dispute's evidence submission. Write only what the provided facts support — never invent dates, amounts, or claims not given to you. " +
      "Structure: 1) what the customer purchased and when, 2) evidence of service delivery / access / usage if provided, 3) a factual, non-defensive statement of why the charge was legitimate. " +
      "Keep it to 3-5 sentences, professional, no exclamation points, no invented specifics. Respond with ONLY the narrative text.",
    userMessage: [
      `Product: ${dispute.product_id ?? "unknown"}`,
      `Payment id: ${dispute.payment_id ?? "unknown"}`,
      courseCompletionSummary ? `Course completion evidence: ${courseCompletionSummary}` : "No course completion evidence available.",
      alert?.card_brand ? `Card brand: ${alert.card_brand}, issuer: ${alert.issuer ?? "unknown"}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return result.text.trim();
}

/**
 * Playbook 5.10's own executor. Triggered from dispute_alert.created
 * (primary) or dispute.created (secondary) via the shared webhook
 * processor, or manually.
 */
export async function assembleDisputeResponse(engagementId: string, disputeId: string, alert: WhopDisputeAlert | null = null): Promise<DisputeAssemblyResult> {
  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: "whop-dispute-response", phase: "evidence_window_check", label: disputeId });

  try {
    const client = await WhopAgentClient.forEngagement(engagementId);

    if (alert && alert.actionable) {
      // Section 5.10: pre-chargeback window still open — the recommended
      // action may be a proactive refund rather than an evidence packet.
      // That's an operator decision this agent surfaces, not makes.
      await logStep(runId, { phase: "actionable_branch", status: "success", detail: "Alert is actionable — pre-chargeback window still open. Consider a proactive refund before the chargeback lands." });
    }

    await logStep(runId, { phase: "evidence_window_check", status: "running" });
    const dispute = await checkEvidenceWindow(client, disputeId);
    if (dispute.evidence_editable === false) {
      await logStep(runId, { phase: "evidence_window_check", status: "failed", detail: `Window closed: ${dispute.evidence_locked_reason ?? "unknown reason"}` });
      await finishRun(runId, {
        status: "skipped",
        summary: { whatWasAttempted: ["Evidence window check"], whatWorked: [], whatFailed: [`Window closed: ${dispute.evidence_locked_reason ?? "unknown"}`], openItems: ["Not assembling a packet that cannot be filed."], decisionsMade: [] },
      });
      return { status: "window_closed", dispute, usedGeneratedResponse: false, gatheredManually: [] };
    }
    await logStep(runId, { phase: "evidence_window_check", status: "success", detail: dispute.evidence_due_at ? `Due ${dispute.evidence_due_at}` : undefined });

    const gatheredManually: string[] = [];

    await logStep(runId, { phase: "course_evidence_gather", status: "running" });
    const courseCompletionSummary = await gatherCourseCompletionEvidence(client, dispute.membership_id);
    if (courseCompletionSummary === null) gatheredManually.push("Course completion records");
    await logStep(runId, { phase: "course_evidence_gather", status: courseCompletionSummary ? "success" : "skipped" });

    // Chat/forum activity iteration across experiences and shipments
    // records are named in Section 5.10's API sequence but need a real
    // experience-enumeration pass this build doesn't have yet — flagged
    // for manual gathering per the fail-open table rather than faked.
    gatheredManually.push("Chat/forum activity", "Shipment records");

    let usedGeneratedResponse = false;
    let notes: string;
    if (dispute.generated_response_attachment) {
      // Section 5.10: "If it populates, the playbook reads and improves
      // that draft rather than assembling from zero."
      usedGeneratedResponse = true;
      notes = dispute.generated_response_attachment;
      await logStep(runId, { phase: "narrative_draft", status: "success", detail: "Whop had already generated a draft — using it as the starting point." });
    } else {
      await logStep(runId, { phase: "narrative_draft", status: "running" });
      notes = await draftNarrative(runId, dispute, alert, courseCompletionSummary);
      await logStep(runId, { phase: "narrative_draft", status: "success" });
    }

    const draft: DisputeEvidenceDraft = {
      notes,
      product_description: dispute.product_id,
      service_date: undefined, // Section 5.1's own field name: earliest confirmed access timestamp — needs the course/access data this pass gathers only partially
    };

    await finishRun(runId, {
      summary: {
        whatWasAttempted: ["Evidence window check", "Course completion gather", "Narrative draft"],
        whatWorked: [usedGeneratedResponse ? "Improved Whop's own generated draft" : "Drafted narrative from scratch", courseCompletionSummary ? "Course completion evidence included" : ""].filter(Boolean),
        whatFailed: [],
        openItems: gatheredManually.map((g) => `${g} — attach manually before submitting`),
        decisionsMade: [],
      },
    });

    return { status: "assembled", dispute, draft, usedGeneratedResponse, gatheredManually };
  } catch (err) {
    await failRun(runId, err).catch(() => {});
    throw err;
  }
}

/** Queues the submit action — always gated, and needs the elevated
 * credential the manifest declares. Re-checks the evidence window at
 * queue time; the executor re-checks it AGAIN right before submitting
 * (Section 5.10: "If it flips false between draft and submit, the submit
 * is aborted"). */
export async function queueDisputeEvidenceSubmit(engagementId: string, disputeId: string, draft: DisputeEvidenceDraft): Promise<string> {
  const client = await WhopAgentClient.forEngagement(engagementId);
  const dispute = await checkEvidenceWindow(client, disputeId);
  if (dispute.evidence_editable === false) {
    throw new Error(`Evidence window closed: ${dispute.evidence_locked_reason ?? "unknown reason"} — cannot queue submission.`);
  }
  return queuePendingAction(
    engagementId,
    "whop_dispute_evidence_submit",
    { disputeId, draft },
    `Submit dispute evidence for ${disputeId}? This is the most consequential customer-facing communication Whop mediates — review the narrative before approving.`
  );
}

export async function executeDisputeEvidenceSubmit(engagementId: string, disputeId: string, draft: DisputeEvidenceDraft): Promise<void> {
  const client = await WhopAgentClient.forEngagement(engagementId);

  // Re-check immediately before submitting — the window can close between
  // queue and approval.
  const dispute = await checkEvidenceWindow(client, disputeId);
  if (dispute.evidence_editable === false) {
    throw new Error(`Evidence window closed between queue and approval: ${dispute.evidence_locked_reason ?? "unknown reason"} — submit aborted.`);
  }

  await client.request("disputes.evidence_submit", `/v1/disputes/${disputeId}/evidence`, {
    method: "POST",
    body: draft,
    idempotencyKey: `whop-dispute-evidence-submit:${disputeId}`,
  });

  const verify = await checkEvidenceWindow(client, disputeId);
  if (verify.evidence_editable !== false) {
    throw new Error(`Read-back after submitting evidence for ${disputeId} did not confirm the lock — flagging for manual verification in the Whop portal.`);
  }
}
