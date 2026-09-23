// src/lib/showtime-setup/tool-states.ts
//
// What a product's setup screen knows about each tool it offers: attached
// to this client now, connections already saved in the workspace (so a
// person picks one instead of pasting a key again) and whether the linked
// account looks like this business's.

import type { ClientFact } from "@/lib/client-facts";
import { hasCredential, listEngagementsUsingVaultCredential, listVaultCredentials } from "@/lib/credentials";
import { factTier } from "@/lib/fact-trust";
import type { SetupTool } from "./catalog";
import type { ToolState } from "./types";

export async function loadToolStates(engagementId: string, workspaceId: string, tools: SetupTool[], facts: Record<string, ClientFact>): Promise<ToolState[]> {
  const vault = await listVaultCredentials(workspaceId);
  const out: ToolState[] = [];
  for (const t of tools) {
    const savedHere = vault.filter((v) => v.provider === t.provider);
    const matchFact = facts[`vaultMatch:${t.provider}`];
    const saved = await Promise.all(
      savedHere.map(async (v) => ({
        vaultId: v.id,
        label: v.label,
        healthStatus: v.healthStatus,
        usedBy: (await listEngagementsUsingVaultCredential(v.id)).length,
        bestMatch: savedHere.length === 1 || (matchFact?.value === v.id && factTier(matchFact) !== "ask"),
      }))
    );
    saved.sort((a, b) => Number(b.bestMatch) - Number(a.bestMatch));
    const check = facts[`accountCheck:${t.provider}`]?.value as { matches?: boolean; probability?: number } | undefined;
    out.push({
      provider: t.provider,
      group: t.group,
      linked: await hasCredential(engagementId, t.provider),
      seenOnSite: false,
      saved,
      accountCheck: check && typeof check.matches === "boolean" ? { matches: check.matches, probability: check.probability ?? 0 } : null,
    });
  }
  return out;
}
