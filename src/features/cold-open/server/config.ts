// src/features/cold-open/server/config.ts
//
// Read/write/precondition-check for coldOpenConfig — the hosted mirror of
// the Cold Open skill pack's coldopen.config.md (see that file's own
// header in the source pack, and schema.ts's coldOpenConfig table
// comment). One Postgres row per engagement instead of one markdown file;
// "single writer per section" is enforced the same way rep-onboarding's
// onboarding-service.ts enforces it — each skill's own save function only
// ever sets its own columns.

import { db } from "@/lib/db";
import { coldOpenConfig, type ColdOpenPhaseKey, type ColdOpenPhaseState } from "@/models/schema";
import { eq } from "drizzle-orm";

export type ColdOpenConfigRow = typeof coldOpenConfig.$inferSelect;

export async function getColdOpenConfig(engagementId: string): Promise<ColdOpenConfigRow | null> {
  const [row] = await db.select().from(coldOpenConfig).where(eq(coldOpenConfig.engagementId, engagementId)).limit(1);
  return row ?? null;
}

/** Upserts a section of coldOpenConfig for this engagement. `patch` should
 * only ever carry the calling skill's own columns — same single-writer-
 * per-section convention the source pack's config.py documents. Creates
 * the row (with every phase not_started) on first write. */
export async function upsertColdOpenConfig(
  engagementId: string,
  patch: Partial<Omit<ColdOpenConfigRow, "id" | "engagementId" | "createdAt" | "updatedAt">>
): Promise<ColdOpenConfigRow> {
  const [row] = await db
    .insert(coldOpenConfig)
    .values({ engagementId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: coldOpenConfig.engagementId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function setColdOpenPhaseState(engagementId: string, key: ColdOpenPhaseKey, state: ColdOpenPhaseState): Promise<void> {
  const existing = await getColdOpenConfig(engagementId);
  const phaseState = { ...(existing?.phaseState ?? {}), [key]: state } as Record<ColdOpenPhaseKey, ColdOpenPhaseState>;
  await upsertColdOpenConfig(engagementId, { phaseState });
}

// Which config section each operational skill needs before it may run —
// direct port of config.py's SKILL_PRECONDITIONS. icp-lock is the seeder
// and requires nothing.
const SKILL_PRECONDITIONS: Record<string, { field: keyof ColdOpenConfigRow; owner: string; label: string }[]> = {
  "voice-capture": [{ field: "icps", owner: "icp-lock", label: "ICPs" }],
  "source-connect": [{ field: "icps", owner: "icp-lock", label: "ICPs" }],
  "send-connect": [{ field: "icps", owner: "icp-lock", label: "ICPs" }],
  "daily-send": [
    { field: "icps", owner: "icp-lock", label: "ICPs" },
    { field: "productIdentity", owner: "icp-lock", label: "product identity" },
    { field: "voiceProfile", owner: "voice-capture", label: "voice profile" },
    { field: "leadSources", owner: "source-connect", label: "lead sources" },
    { field: "sendPlatform", owner: "send-connect", label: "sending platform" },
    { field: "campaignMap", owner: "send-connect", label: "campaign map" },
  ],
  "reply-sort": [{ field: "sendPlatform", owner: "send-connect", label: "sending platform" }],
  "send-report": [{ field: "lastRunAt", owner: "daily-send", label: "at least one completed run" }],
};

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  // A Date has zero enumerable own properties (Object.keys(new Date())
  // is always []), so the generic object branch below would misreport
  // any set Date — e.g. lastRunAt — as empty regardless of its value.
  // Reaching here at all means the field is set to a real timestamp.
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** The gate every operational Cold Open skill runs first. Returns []
 * when clear, else human-readable failures naming the skill to run
 * first — same contract as config.py's precondition_check. */
export async function preconditionCheck(engagementId: string, skill: string): Promise<string[]> {
  const requirements = SKILL_PRECONDITIONS[skill];
  if (!requirements) return [];

  const config = await getColdOpenConfig(engagementId);
  if (!config) {
    return [`No Cold Open config found for this engagement — run ICP Lock first.`];
  }

  const failures: string[] = [];
  for (const req of requirements) {
    if (isEmpty(config[req.field])) {
      failures.push(`${req.label} missing — run ${req.owner} first.`);
    }
  }
  return failures;
}
