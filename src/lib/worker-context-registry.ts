// src/lib/worker-context-registry.ts
//
// Cross-worker blending, done the way this codebase already knows how to
// scale a "many workers" problem: WORKER_REPORT_RESOLVERS (worker-report-
// blocks.ts) proved that a shared map — each worker registers its own
// resolver, callers iterate the map generically — is what lets a new
// worker join without touching any existing worker's code. This is the
// same shape applied to a different question: not "what does this worker
// report," but "what does this worker know that another worker might
// want."
//
// A worker that wants to publish something for others registers a
// resolver here, returning whatever facts it's willing to share. A worker
// that wants to READ that calls the one generic getWorkerContext function
// — it never queries another worker's table directly, so that worker's
// schema can change freely without breaking anyone reading it through
// this registry. Adding worker #12: it registers its own entry if it
// wants to publish something, and/or calls getWorkerContext if it wants
// to read from an existing publisher — either direction, zero lines
// change in any other worker.

import { db } from "@/lib/db";
import { repIdentityGraphs, repIncidents } from "@/models/schema";
import { and, desc, eq } from "drizzle-orm";
import type { WorkerId } from "@/lib/worker-registry";

export interface CompetitorContext {
  competitors: { name: string; monitorFor: string[]; highPriority: boolean }[];
  soleAuthorityName: string;
}

export interface CrisisContext {
  hasOpenIncident: boolean;
  severityScore: number | null;
}

type WorkerContextResolver = (engagementId: string) => Promise<Record<string, unknown> | null>;

export const WORKER_CONTEXT_RESOLVERS: Partial<Record<WorkerId, WorkerContextResolver>> = {
  // Publishes competitor list + the one person allowed to approve a
  // public reputation response — both real, already-collected
  // repIdentityGraphs facts (see schema.ts) with no prior reader outside
  // Reputation Manager's own skills.
  "rep-onboarding": async (engagementId) => {
    const [row] = await db
      .select({ competitors: repIdentityGraphs.competitors, soleAuthorityName: repIdentityGraphs.soleAuthorityName })
      .from(repIdentityGraphs)
      .where(eq(repIdentityGraphs.engagementId, engagementId))
      .limit(1);
    if (!row) return null;
    const context: CompetitorContext = { competitors: row.competitors, soleAuthorityName: row.soleAuthorityName };
    return context;
  },

  // Publishes whether this engagement currently has an open reputation
  // incident — "open" only, deliberately: "acknowledged" means a human
  // has already reviewed it and the default reading is that outbound
  // activity is fine to resume, not that it should keep being held.
  "rep-crisis-response": async (engagementId) => {
    const [row] = await db
      .select({ severityScore: repIncidents.severityScore })
      .from(repIncidents)
      .where(and(eq(repIncidents.engagementId, engagementId), eq(repIncidents.status, "open")))
      .orderBy(desc(repIncidents.severityScore))
      .limit(1);
    const context: CrisisContext = { hasOpenIncident: Boolean(row), severityScore: row?.severityScore ?? null };
    return context;
  },
};

/** The one generic accessor every consumer calls — never reach into
 * another worker's table directly. Returns null when that worker
 * publishes nothing, or has nothing on file for this engagement. */
export async function getWorkerContext(engagementId: string, workerId: WorkerId): Promise<Record<string, unknown> | null> {
  const resolver = WORKER_CONTEXT_RESOLVERS[workerId];
  if (!resolver) return null;
  return resolver(engagementId);
}

/** Typed convenience wrapper — Pin-Down's copy generation is the one
 * real consumer so far; a future one calls getWorkerContext directly and
 * casts its own way rather than this file accumulating one wrapper per
 * caller. */
export async function getCompetitorContext(engagementId: string): Promise<CompetitorContext | null> {
  const context = await getWorkerContext(engagementId, "rep-onboarding");
  return context as CompetitorContext | null;
}

/** Typed convenience wrapper for the blocking-conditions registry
 * (worker-blocking-conditions.ts) — kept here rather than duplicated,
 * since it's reading the same published context, not a second concept. */
export async function getCrisisContext(engagementId: string): Promise<CrisisContext | null> {
  const context = await getWorkerContext(engagementId, "rep-crisis-response");
  return context as CrisisContext | null;
}
