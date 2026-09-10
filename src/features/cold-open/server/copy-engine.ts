// src/features/cold-open/server/copy-engine.ts
//
// Assembles the 3-touch subject/body copy Daily Send pushes, in either of
// two modes:
//   - "upload": rotate through the buyer's own body-variant pool
//     (body-variants.ts) and subject pool (subject-variants.ts) — fully
//     deterministic, zero LLM cost.
//   - "generate": one LLM call per lead, grounded in the client's product
//     identity, voice profile, and the lead's own facts.
//
// This is a scoped-down v1 of the Cold Open skill pack's
// copy_engine/assembler.py + copy_engine/voice.py + personalize/engines.py
// — those add site-scraping-driven personalization angles and a
// confidence-scored fallback ladder (personalization_confidence.py) this
// pass does not port. "generate" mode here is real (a genuine per-lead
// LLM call using this app's own callClaude helper, not a template with
// find-and-replace), just simpler than the source pipeline's — flagged
// honestly rather than claimed as a byte-for-byte port.

import { callClaude } from "@/lib/llm";
import { resolvePool, pickBodyVariant, type BodyTouchset } from "./body-variants";
import { subjectFor } from "./subject-variants";
import type { LeadRow } from "./fetchers/base";
import type { ColdOpenConfigRow } from "./config";

// Picked rather than the full ColdOpenConfigRow on purpose: callers load
// this config through an Inngest step.run() (see daily-send.ts), whose
// own typing marks Date fields (createdAt/updatedAt) as possibly
// serialized to strings on replay — irrelevant here since this module
// never reads either, but passing the *whole* row would force a type
// mismatch on fields this function doesn't use. Picking only the fields
// this function actually reads sidesteps that without an unsafe cast.
type CopyEngineConfig = Pick<ColdOpenConfigRow, "bodyVariantPools" | "subjectVariants" | "voiceProfile" | "dailySendSettings" | "productIdentity">;

export interface AssembledCopy {
  subject: string;
  body1: string;
  body2: string;
  body3: string;
}

function applyGreetingAndSignOff(body: string, greeting: string, signOff: string, firstName: string): string {
  const opener = firstName ? `${greeting} ${firstName},` : `${greeting} there,`;
  return `${opener}\n\n${body}\n\n${signOff}`;
}

function assembleUpload(config: CopyEngineConfig, lead: LeadRow): AssembledCopy | null {
  const pool = resolvePool(config.bodyVariantPools, lead.icp);
  if (pool.length === 0) return null;
  const touchset: BodyTouchset = pickBodyVariant(lead.email, pool);
  const subject = subjectFor(config.subjectVariants, lead.email, lead.companyName) || touchset.subject;
  const voice = config.voiceProfile;
  return {
    subject,
    body1: applyGreetingAndSignOff(touchset.body1, voice?.greeting ?? "Hi", voice?.signOff ?? "Best", lead.firstName),
    body2: touchset.body2,
    body3: touchset.body3,
  };
}

async function assembleGenerate(config: CopyEngineConfig, lead: LeadRow): Promise<AssembledCopy | null> {
  const pid = config.productIdentity;
  const voice = config.voiceProfile;
  if (!pid || !voice) return null;

  const system =
    `You write a 3-touch cold outbound email sequence for a B2B seller. Voice: ${voice.tone}. ` +
    `Greeting style: "${voice.greeting}". Sign-off: "${voice.signOff}". ` +
    `Never use em/en dashes, exclamation points, or emoji. Keep each body under 120 words. ` +
    `Return STRICT JSON only: {"subject": "...", "body1": "...", "body2": "...", "body3": "..."}`;
  const userMessage =
    `SELLER: ${pid.name} — ${pid.valueProp} (${pid.url})\n` +
    `PROSPECT: ${lead.firstName || "there"} at ${lead.companyName}${lead.title ? `, ${lead.title}` : ""}${lead.city ? `, ${lead.city}` : ""}\n` +
    `ICP: ${lead.icp}\n\n` +
    `Write touch 1 (the opener, references the prospect's company by name), touch 2 (a follow-up with a different angle), ` +
    `and touch 3 (a brief breakup message). JSON only.`;

  try {
    const result = await callClaude({ model: "FAST", system, userMessage, maxTokens: 700 });
    const jsonText = result.text.trim().replace(/^```json\s*|\s*```$/g, "");
    const data = JSON.parse(jsonText);
    if (!data.subject || !data.body1 || !data.body2 || !data.body3) return null;
    return { subject: String(data.subject), body1: String(data.body1), body2: String(data.body2), body3: String(data.body3) };
  } catch {
    return null;
  }
}

/** Assemble one lead's copy per the engagement's configured copy mode.
 * Returns null when there's nothing to assemble from (no body-variant
 * pool for this ICP in upload mode; missing product identity/voice
 * profile in generate mode) — the caller skips the lead with a clear
 * reason rather than pushing empty merge fields. */
export async function assembleCopyForLead(config: CopyEngineConfig, lead: LeadRow): Promise<AssembledCopy | null> {
  if (config.dailySendSettings?.copyMode === "generate") {
    return assembleGenerate(config, lead);
  }
  return assembleUpload(config, lead);
}
