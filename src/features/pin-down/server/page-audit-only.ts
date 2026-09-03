// src/features/pin-down/server/page-audit-only.ts
//
// Teammates chat's "audit an existing confirmation page" action —
// pin-down-page-audit in chat-skill-registry.ts. Reuses
// auditExistingConfirmationPage exactly as onboarding-service.ts calls
// it. Unlike the other two, this one genuinely needs a piece of input
// the engagement row doesn't already have on a bare create_client
// client — a URL to audit — so it's threaded through ctx the same way
// voiceExtractionDomain is for pin-down-voice, not read off tenant.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { auditExistingConfirmationPage } from "./discovery-prefill";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

export async function runPageAuditOnly(
  tenant: { engagementId: string; buyer: string; offerDetails?: unknown; brandVoiceProfile?: unknown },
  runId: string,
  step: StepTools | undefined,
  ctx?: { pageAuditUrl?: string }
): Promise<void> {
  const summary = emptySummary();
  const run = step ? <T,>(id: string, fn: () => Promise<T>) => step.run(id, fn) : <T,>(_id: string, fn: () => Promise<T>) => fn();

  try {
    const url = ctx?.pageAuditUrl?.trim();
    if (!url) throw new Error("No confirmation page URL was provided to audit.");

    await logStep(runId, { phase: "existing_page_audit", status: "running", label: url });
    const audit = await run("existing-page-audit", () =>
      auditExistingConfirmationPage(url, { buyer: tenant.buyer, offerDetails: tenant.offerDetails, brandVoiceProfile: tenant.brandVoiceProfile })
    );

    await run("persist", async () => {
      await db.update(engagements).set({ pinDownPageAudit: audit, updatedAt: new Date() }).where(eq(engagements.engagementId, tenant.engagementId));
    });

    await logStep(runId, {
      phase: "existing_page_audit",
      status: "success",
      detail: `${audit.existingPageStrengths.length} strengths, ${audit.existingPageWeaknesses.length} weaknesses noted`,
    });
    summary.whatWasAttempted.push(`Audited ${tenant.buyer}'s confirmation page at ${url} — ${audit.existingPageWeaknesses.length} gap(s) identified.`);
    await finishRun(runId, { summary });
  } catch (err) {
    await logStep(runId, { phase: "existing_page_audit", status: "failed", detail: err instanceof Error ? err.message : String(err) });
    await failRun(runId, err);
  }
}
