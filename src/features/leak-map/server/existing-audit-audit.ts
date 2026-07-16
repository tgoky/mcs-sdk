import { callClaudeWithRetry, MODEL } from "@/lib/llm";

/**
 * Leak Map recovery gap 4 — existing-audit audit. Same principle as
 * Pile-On's existing-sequence audit and Pin-Down's page audit: never
 * silently duplicate or replace something the buyer already has, produce
 * a delta doc and let the operator decide.
 *
 * Unlike Pile-On's version (which reads real flow data from the ESP's
 * API), there's no API to read an arbitrary external BI dashboard,
 * spreadsheet, or PDF report from — Leak Map's Discovery equivalent here
 * is a free-text description the operator supplies during onboarding
 * ("what does your current report cover"), scored against what this
 * app's own audit pipeline actually computes. Less precise than an API
 * read, but it's the only input that exists for this gap, and it's still
 * a real, useful comparison rather than skipping the audit entirely.
 */

const LEAK_MAP_COVERAGE = [
  "Brief delivery volume (week-over-week)",
  "Identity match accuracy (Rule 14 scoring)",
  "Booking show-rate (Calendly)",
  "Email open-rate (Klaviyo Pile-On sequence)",
  "CRM pipeline win-rate (HubSpot/GHL)",
  "Pipeline aging (deals/opportunities open past 30 days)",
  "Days-to-close (HubSpot only)",
  "Statistical-integrity gating on small samples",
  "Cross-client percentile benchmarks (once enough tenants report the same bucket)",
];

export interface ExistingAuditAuditResult {
  auditedAt: string;
  describedCoverage: string[];
  leakMapCoverage: string[];
  overlapping: string[];
  gapsLeakMapCloses: string[];
  gapsExistingCovers: string[];
  recommendation: string;
}

export async function auditExistingReport(operatorDescription: string): Promise<ExistingAuditAuditResult> {
  const now = new Date().toISOString();

  const system = `You are comparing a buyer's existing analytics/reporting setup against what
Leak Map (an automated funnel audit tool) covers, to produce a delta doc —
never a recommendation to abandon their existing report, just an honest
comparison so the operator can decide what to keep.

Leak Map's actual coverage:
${LEAK_MAP_COVERAGE.map((c) => `- ${c}`).join("\n")}

The operator's description of their existing dashboard/report/process:
"${operatorDescription}"

Extract what the described report actually covers (as a list of concrete
items, not a paraphrase of the whole description), then compare against
Leak Map's coverage list above. Never invent capabilities the operator
didn't describe.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "describedCoverage": ["specific things the existing report covers, extracted from the description"],
  "overlapping": ["items both cover"],
  "gapsLeakMapCloses": ["items only Leak Map covers"],
  "gapsExistingCovers": ["items only the existing report covers, that Leak Map doesn't"],
  "recommendation": "2-3 sentences: how the operator should think about running both, e.g. keep the existing report for X, use Leak Map for Y"
}`;

  const result = await callClaudeWithRetry({
    model: MODEL.SYNTHESIS,
    system,
    userMessage: "Produce the delta doc now.",
    maxTokens: 1200,
  });

  try {
    const cleaned = result.text.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      auditedAt: now,
      describedCoverage: parsed.describedCoverage ?? [],
      leakMapCoverage: LEAK_MAP_COVERAGE,
      overlapping: parsed.overlapping ?? [],
      gapsLeakMapCloses: parsed.gapsLeakMapCloses ?? [],
      gapsExistingCovers: parsed.gapsExistingCovers ?? [],
      recommendation: parsed.recommendation ?? "",
    };
  } catch {
    return {
      auditedAt: now,
      describedCoverage: [],
      leakMapCoverage: LEAK_MAP_COVERAGE,
      overlapping: [],
      gapsLeakMapCloses: [],
      gapsExistingCovers: [],
      recommendation: "Audit generation returned an unparseable response — review the existing report manually against Leak Map's coverage list.",
    };
  }
}
