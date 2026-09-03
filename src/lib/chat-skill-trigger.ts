// src/lib/chat-skill-trigger.ts
//
// Sibling to skill-trigger.ts, not a branch inside it — deliberately
// separate because the eligibility rules are genuinely different, not
// just a different skillName to switch on. skill-trigger.ts gates on
// isSkillEnabledForEngagement, the on/off toggle for a real, subscribed
// Showtime skill. Chat-skill-registry.ts's entries aren't that — there's
// no toggle for "extract brand voice from a URL" the way there is for
// "Call Brief, on or off" (see chat-skill-manifest.ts's header for why).
// What still applies: a paused engagement shouldn't get any background
// work dispatched against it, skill or not — that check is kept.
//
// One shared dispatch function, not one per chat skill — the first
// version of this file had only triggerVoiceExtractionForEngagement,
// but the shape (load tenant, check paused, startRun, dispatch event,
// handle a failed dispatch) is identical across all four chat skills now
// registered in chat-skill-registry.ts. Four real, simultaneous examples
// is well past this project's own standing bar for generalizing instead
// of copy-pasting a near-identical function per case.

import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { startRun, failRun } from "@/lib/run-log";
import { inngest, skillRunExecute } from "@/lib/inngest";
import { isEngagementPaused } from "@/lib/engagement-status";
import { isChatSkillId, type ChatSkillId } from "@/lib/chat-skill-manifest";
import type { ChatSkillContext } from "@/lib/chat-skill-registry";
import crypto from "crypto";

export type TriggerChatSkillResult = { ok: true; runId: string; message: string } | { ok: false; error: string };

export async function triggerChatSkillForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  skillId: ChatSkillId,
  ctx: ChatSkillContext,
  successMessage: string,
  initialPhase: string,
  initialLabel?: string
): Promise<TriggerChatSkillResult> {
  if (!isChatSkillId(skillId)) {
    // Unreachable in practice — guards against chat-skill-manifest.ts
    // ever renaming/removing an id a caller still references.
    return { ok: false, error: `${skillId} isn't a registered chat skill.` };
  }

  const [tenant] = await db
    .select({ pausedAt: engagements.pausedAt })
    .from(engagements)
    .where(and(eq(engagements.engagementId, engagementId), eq(engagements.whopUserId, whopUserId), eq(engagements.workspaceId, workspaceId)))
    .limit(1);

  if (!tenant) return { ok: false, error: "Client not found." };
  if (isEngagementPaused(tenant)) return { ok: false, error: "This client is paused — resume it before running anything for them." };

  const runId = crypto.randomUUID();
  await startRun({ id: runId, engagementId, skillName: skillId, phase: initialPhase, label: initialLabel });

  try {
    await inngest.send(skillRunExecute.create({ runId, engagementId, skillName: skillId, manualOverride: true, ...ctx }));
  } catch (dispatchErr: unknown) {
    await failRun(runId, dispatchErr);
    return { ok: false, error: "Failed to dispatch to background queue." };
  }

  return { ok: true, runId, message: successMessage };
}

// Thin, purpose-named wrappers around the shared dispatcher above — kept
// because each has a genuinely different required-input shape and
// success message, not because the dispatch logic itself differs.

export async function triggerVoiceExtractionForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  domain: string
): Promise<TriggerChatSkillResult> {
  const cleanDomain = domain.trim();
  if (!cleanDomain) return { ok: false, error: "No URL was provided." };
  return triggerChatSkillForEngagement(
    whopUserId,
    workspaceId,
    engagementId,
    "pin-down-voice",
    { voiceExtractionDomain: cleanDomain },
    `Extracting brand voice from ${cleanDomain}. This can take a minute — check back or ask for the status.`,
    "voice_scrape",
    cleanDomain
  );
}

export async function triggerScriptPackForEngagement(whopUserId: string, workspaceId: string, engagementId: string): Promise<TriggerChatSkillResult> {
  return triggerChatSkillForEngagement(
    whopUserId,
    workspaceId,
    engagementId,
    "pin-down-scripts",
    {},
    "Generating the hero and breakout video scripts. This can take a minute — check back or ask for the status.",
    "script_pack"
  );
}

export async function triggerAdCreativeBriefsForEngagement(whopUserId: string, workspaceId: string, engagementId: string): Promise<TriggerChatSkillResult> {
  return triggerChatSkillForEngagement(
    whopUserId,
    workspaceId,
    engagementId,
    "pin-down-ad-briefs",
    {},
    "Generating ad creative briefs. This can take a minute — check back or ask for the status.",
    "ad_creative_briefs"
  );
}

export async function triggerPageAuditForEngagement(
  whopUserId: string,
  workspaceId: string,
  engagementId: string,
  pageUrl: string
): Promise<TriggerChatSkillResult> {
  const cleanUrl = pageUrl.trim();
  if (!cleanUrl) return { ok: false, error: "No page URL was provided." };
  return triggerChatSkillForEngagement(
    whopUserId,
    workspaceId,
    engagementId,
    "pin-down-page-audit",
    { pageAuditUrl: cleanUrl },
    `Auditing the confirmation page at ${cleanUrl}. This can take a minute — check back or ask for the status.`,
    "existing_page_audit",
    cleanUrl
  );
}
