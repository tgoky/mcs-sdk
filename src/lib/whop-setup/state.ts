// src/lib/whop-setup/state.ts
//
// Everything Whop Agent's setup screen shows, in one read.

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { engagements, whopAgentConnections, whopWebhookRegistry, type EngagementStack } from "@/models/schema";
import { getClientFact } from "@/lib/client-facts";
import { hasCredential } from "@/lib/credentials";
import { getWhopAgentEngagementSkillStates } from "@/lib/engagement-skills";
import { duplicateGroupKey } from "@/features/whop-agent/server/webhook-audit-service";
import { webhookReceiverUrl } from "@/features/whop-agent/server/webhook-subscription-service";
import { getOrCreateBridgeSigningSecret } from "@/features/whop-agent/server/bridge-manager-service";
import { buildWhopProposal } from "./proposal";
import type { WhopAccountRead, WhopSetupState } from "./types";

export const WHOP_READ_FACT = "whopAccountRead";

export async function loadWhopConnection(engagementId: string) {
  const [row] = await db.select().from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId)).limit(1);
  return row && !row.disconnectedAt ? row : null;
}

export async function loadWhopRead(engagementId: string, accountId: string | null): Promise<WhopAccountRead | null> {
  const f = await getClientFact(engagementId, WHOP_READ_FACT);
  const read = f && f.status !== "rejected" ? (f.value as WhopAccountRead) : null;
  // A read of a different Whop account than the one connected now is stale.
  return read && read.accountId === accountId ? read : null;
}

export async function loadWhopSetupState(engagementId: string): Promise<WhopSetupState | null> {
  const [row] = await db.select({ buyer: engagements.buyer, stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return null;
  const connection = await loadWhopConnection(engagementId);
  const [skills, read, agentHooks, ghl, ghlCalendar] = await Promise.all([
    getWhopAgentEngagementSkillStates(engagementId),
    connection ? loadWhopRead(engagementId, connection.whopAccountId) : Promise.resolve(null),
    db
      .select({ events: whopWebhookRegistry.events })
      .from(whopWebhookRegistry)
      .where(and(eq(whopWebhookRegistry.engagementId, engagementId), eq(whopWebhookRegistry.createdByAgent, true))),
    hasCredential(engagementId, "ghl"),
    hasCredential(engagementId, "ghl_calendar"),
  ]);
  const stack = (row.stack as Partial<EngagementStack> | null) ?? {};
  const proposal = buildWhopProposal({
    read,
    stack,
    probe: connection?.scopeProbeResults ?? null,
    agentEvents: agentHooks[0]?.events ?? null,
    receiverUrl: webhookReceiverUrl(engagementId),
    ghlConnected: ghl || ghlCalendar,
    groupKey: duplicateGroupKey,
  });

  return {
    engagementId,
    buyer: row.buyer,
    connection: {
      connected: Boolean(connection),
      accountId: connection?.whopAccountId ?? null,
      credentialType: connection?.credentialType ?? null,
      pinnedVersionDate: connection?.pinnedVersionDate ?? null,
      locked: proposal.locked,
      breakerOpen: connection?.circuitBreakerState === "open",
    },
    configured: Boolean(connection && read),
    skills,
    read,
    snapshot: proposal.snapshot,
    saveOffer: proposal.saveOffer,
    alerts: proposal.alerts,
    recovery: proposal.recovery,
    bridge: { ...proposal.bridge, signingSecret: stack.whop_bridge_destination_url ? await getOrCreateBridgeSigningSecret(engagementId).catch(() => null) : null },
    webhook: proposal.webhook,
  };
}
