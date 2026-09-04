import { db } from "@/lib/db";
import { repIdentityGraphs, type RepEntity, type RepOffering, type RepCompetitor, type RepCollision, type RepEngineId } from "@/models/schema";
import { REP_ENGINE_IDS } from "@/features/reputation-manager/engine-models";
import { eq } from "drizzle-orm";
import { callClaudeWithWebSearch } from "@/lib/llm";
import { logStep, finishRun, failRun, emptySummary } from "@/lib/run-log";
import type { GetStepTools, Inngest } from "inngest";

type StepTools = GetStepTools<Inngest.Any>;

// ── Intake (the buyer-facing save path) ─────────────────────────────────────
// Ported from counterclaim-intake's batched 10-question interview
// (mcs/cms/skills/counterclaim-intake/SKILL.md). Showtime's hinges panel
// asks these as a real form rather than a conversational interview — same
// questions, same output shape, adapted to a hosted SaaS UI instead of a
// buyer-run local Claude session. The interview's question numbers are
// kept in the comments below so the mapping back to the source skill stays
// traceable.

export type RepIntakeInput = {
  operatorName: string; // Q1
  operatorAliases: string[]; // Q1
  operatorHandles: Record<string, string>; // Q5
  operatorDomains: string[]; // Q2
  operatorEmailContacts: string[]; // not in the numbered list; carried from your-identity.yml.template's email_contacts
  entities: RepEntity[]; // Q2-3
  offerings: RepOffering[]; // Q3
  competitors: RepCompetitor[]; // Q6
  collisions: RepCollision[]; // Q4, buyer-entered half of the set
  trustedSources: string[]; // Q7
  seedPanelPrompts: string[]; // Q8
  soleAuthorityName: string; // Q10
  crisisThresholdOverride?: number | null;
  // Null (or omitted) means "no restriction — every platform-configured
  // engine runs," matching every row's behavior before this field
  // existed. See repIdentityGraphs.activeEngines' own comment.
  activeEngines?: RepEngineId[] | null;
};

const MAX_LIST_LENGTH = 50; // generous ceiling against a malformed/scripted payload, not a real-world limit
const MAX_STRING_LENGTH = 500;

function isNonEmptyTrimmed(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_STRING_LENGTH;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_LIST_LENGTH && value.every((v) => typeof v === "string" && v.length <= MAX_STRING_LENGTH);
}

function validateEntities(value: unknown): value is RepEntity[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return false;
  const validTypes = new Set(["company", "brand", "product", "service", "publication"]);
  return value.every(
    (e) =>
      e &&
      typeof e === "object" &&
      isNonEmptyTrimmed(e.name) &&
      isStringArray(e.aliases ?? []) &&
      validTypes.has(e.type) &&
      isStringArray(e.domainsOwned ?? []) &&
      typeof e.handles === "object" &&
      typeof e.highPriority === "boolean"
  );
}

function validateOfferings(value: unknown, entityNames: Set<string>): value is RepOffering[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return false;
  return value.every(
    (o) =>
      o &&
      typeof o === "object" &&
      isNonEmptyTrimmed(o.name) &&
      isStringArray(o.aliases ?? []) &&
      isStringArray(o.surfaces ?? []) &&
      isNonEmptyTrimmed(o.parentEntityName) &&
      entityNames.has(o.parentEntityName)
  );
}

function validateCompetitors(value: unknown): value is RepCompetitor[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return false;
  return value.every(
    (c) => c && typeof c === "object" && isNonEmptyTrimmed(c.name) && isStringArray(c.monitorFor ?? []) && typeof c.highPriority === "boolean"
  );
}

function validateActiveEngines(value: unknown): value is RepEngineId[] | null {
  if (value === null || value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.length <= REP_ENGINE_IDS.length &&
    value.every((v): v is RepEngineId => typeof v === "string" && REP_ENGINE_IDS.includes(v as RepEngineId))
  );
}

function validateCollisions(value: unknown): value is RepCollision[] {
  if (!Array.isArray(value) || value.length > MAX_LIST_LENGTH) return false;
  // Every entry needs a real disambiguation note — an empty one defeats
  // the point (see the source skill's Failure modes section).
  return value.every(
    (c) => c && typeof c === "object" && isNonEmptyTrimmed(c.name) && isNonEmptyTrimmed(c.whoTheyAre) && isNonEmptyTrimmed(c.disambiguationNote)
  );
}

/**
 * Validates and upserts one engagement's identity graph — the save path
 * behind the (forthcoming) rep-onboarding hinges panel, matching the
 * layering convention used elsewhere in this app (thin route, real
 * validation + persistence logic in the feature's own server module — see
 * createWorkspace in lib/workspace.ts for the same shape).
 *
 * Returns the saved row on success, or a field-level error the caller
 * (eventually an API route) can surface directly — same
 * `{ error: string } | T` contract createWorkspace/renameWorkspace use.
 */
export async function saveRepIdentityGraphIntake(
  engagementId: string,
  input: RepIntakeInput
): Promise<{ id: string } | { error: string }> {
  if (!isNonEmptyTrimmed(input.operatorName)) {
    return { error: "Operator name is required." };
  }
  if (!isNonEmptyTrimmed(input.soleAuthorityName)) {
    return {
      error:
        "Sole authority name is required — Reputation Manager never publishes or approves anything on its own, so someone has to be named as the one person who can.",
    };
  }
  if (!isStringArray(input.operatorAliases)) return { error: "Operator aliases must be a list of short strings." };
  if (!isStringArray(input.operatorDomains)) return { error: "Operator domains must be a list of short strings." };
  if (!isStringArray(input.operatorEmailContacts)) return { error: "Operator email contacts must be a list of short strings." };
  if (!isStringArray(input.trustedSources)) return { error: "Trusted sources must be a list of short strings." };
  if (!isStringArray(input.seedPanelPrompts)) return { error: "Seed panel prompts must be a list of short strings." };
  if (input.operatorHandles && typeof input.operatorHandles !== "object") {
    return { error: "Operator handles must be a platform-to-handle map." };
  }
  if (!validateEntities(input.entities)) {
    return { error: "Each entity needs a name, a valid type, and a highPriority flag." };
  }
  const entityNames = new Set(input.entities.map((e) => e.name));
  if (!validateOfferings(input.offerings, entityNames)) {
    return { error: "Each offering needs a name and a parentEntityName matching one of the entities above." };
  }
  if (!validateCompetitors(input.competitors)) {
    return { error: "Each competitor needs a name and a highPriority flag." };
  }
  if (!validateCollisions(input.collisions)) {
    return {
      error: "Each collision needs a name, who they are, and a disambiguation note — an empty note defeats the point of listing it.",
    };
  }
  if (!validateActiveEngines(input.activeEngines)) {
    return { error: "Active engines must be a list drawn from the platform's supported engine ids, or omitted for no restriction." };
  }
  if (
    input.crisisThresholdOverride !== undefined &&
    input.crisisThresholdOverride !== null &&
    (typeof input.crisisThresholdOverride !== "number" ||
      !Number.isFinite(input.crisisThresholdOverride) ||
      input.crisisThresholdOverride < 1 ||
      input.crisisThresholdOverride > 100)
  ) {
    return { error: "Crisis threshold override must be a number between 1 and 100, or omitted to use the shared default." };
  }

  const values = {
    engagementId,
    operatorName: input.operatorName.trim(),
    operatorAliases: input.operatorAliases,
    operatorHandles: input.operatorHandles ?? {},
    operatorDomains: input.operatorDomains,
    operatorEmailContacts: input.operatorEmailContacts,
    entities: input.entities,
    offerings: input.offerings,
    competitors: input.competitors,
    collisions: input.collisions.map((c) => ({ ...c, source: "buyer" as const })),
    trustedSources: input.trustedSources,
    seedPanelPrompts: input.seedPanelPrompts,
    soleAuthorityName: input.soleAuthorityName.trim(),
    crisisThresholdOverride: input.crisisThresholdOverride ?? null,
    activeEngines: input.activeEngines ?? null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(repIdentityGraphs)
    .values(values)
    .onConflictDoUpdate({
      target: repIdentityGraphs.engagementId,
      // Re-saving the form replaces the buyer-entered collisions but must
      // not discard anything the collision-check pass already found —
      // that set is additive across the buyer's own edits, so it's merged
      // rather than overwritten. sql template keeps this a single
      // round trip instead of a read-modify-write race with a concurrent
      // save.
      set: {
        operatorName: values.operatorName,
        operatorAliases: values.operatorAliases,
        operatorHandles: values.operatorHandles,
        operatorDomains: values.operatorDomains,
        operatorEmailContacts: values.operatorEmailContacts,
        entities: values.entities,
        offerings: values.offerings,
        competitors: values.competitors,
        trustedSources: values.trustedSources,
        seedPanelPrompts: values.seedPanelPrompts,
        soleAuthorityName: values.soleAuthorityName,
        crisisThresholdOverride: values.crisisThresholdOverride,
        activeEngines: values.activeEngines,
        updatedAt: values.updatedAt,
        // collisions intentionally omitted here — merged below in a
        // separate statement so a collision_check-sourced entry from a
        // prior run is never clobbered by a plain form re-save.
      },
    })
    .returning({ id: repIdentityGraphs.id });

  await mergeCollisions(engagementId, values.collisions, "replace_buyer_entries");

  return { id: row.id };
}

/**
 * Merges a set of collisions into the row's existing list.
 *
 * mode "replace_buyer_entries": used right after a form save — drops every
 * existing source:"buyer" entry (the buyer's last save is authoritative
 * for their own answers) and keeps every source:"collision_check" entry
 * untouched, then appends the new buyer entries.
 *
 * mode "append_found": used by the collision-check pass — adds newly
 * found collisions, de-duplicated by name (case-insensitive) against
 * whatever's already there from either source, so re-running the check
 * (if that ever happens) can't produce duplicate entries.
 */
async function mergeCollisions(
  engagementId: string,
  incoming: (RepCollision & { source: "buyer" | "collision_check" })[],
  mode: "replace_buyer_entries" | "append_found"
): Promise<void> {
  const [existing] = await db
    .select({ collisions: repIdentityGraphs.collisions })
    .from(repIdentityGraphs)
    .where(eq(repIdentityGraphs.engagementId, engagementId))
    .limit(1);

  const current = existing?.collisions ?? [];
  const seenNames = new Set<string>();
  const merged: (RepCollision & { source: "buyer" | "collision_check" })[] = [];

  const base = mode === "replace_buyer_entries" ? current.filter((c) => c.source !== "buyer") : current;
  for (const c of base) {
    const key = c.name.trim().toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    merged.push(c);
  }
  for (const c of incoming) {
    const key = c.name.trim().toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    merged.push(c);
  }

  await db.update(repIdentityGraphs).set({ collisions: merged, updatedAt: new Date() }).where(eq(repIdentityGraphs.engagementId, engagementId));
}

// ── Onboarding executor (the runOnSetup dispatch path) ──────────────────────

type CollisionCheckResult = { collisions: { name: string; whoTheyAre: string; disambiguationNote: string }[] };

/**
 * The one-time same-name-collision check from counterclaim-intake's
 * Failure modes section: "Buyer skips same-name collisions ('there is no
 * one else with my name'). Push once: search the open web for the
 * operator name and brand name and surface any collision the buyer
 * missed." Runs exactly once per engagement (gated by
 * collisionCheckRunAt) — this is a one-time enrichment pass over intake
 * data, not a recurring monitor; ongoing monitoring is the ai-engine-panel
 * skill's job once it exists.
 *
 * Failure handling: a malformed/unparseable model response degrades this
 * one enrichment step, not the whole onboarding run — the identity graph
 * itself was already saved successfully before this ever executes, so a
 * flaky search pass shouldn't block a client's setup from completing.
 */
async function runCollisionCheck(
  engagementId: string,
  operatorName: string,
  entityNames: string[],
  existingCollisionNames: string[],
  runId: string
): Promise<{ found: number; error?: string }> {
  const namesToCheck = [operatorName, ...entityNames].filter(Boolean);
  const searchResult = await callClaudeWithWebSearch({
    runId,
    maxSearches: 3,
    maxTokens: 1200,
    system:
      "You check for same-name collisions that could cause an AI engine to confuse two different people or " +
      "companies. Given a list of names, search the open web and identify any OTHER real, distinct person or " +
      "company that shares one of these names closely enough to cause identity confusion. Do not include the " +
      "subject themselves. Do not invent a collision that doesn't exist — an empty list is a valid, common " +
      "result. Respond with ONLY a JSON object matching this exact shape, no preamble, no markdown fences:\n" +
      '{"collisions": [{"name": "string", "whoTheyAre": "one sentence on who they actually are", ' +
      '"disambiguationNote": "one sentence distinguishing them from the subject"}]}',
    userMessage: `Names to check: ${namesToCheck.join(", ")}.\n\nAlready-known collisions to skip (don't repeat these): ${
      existingCollisionNames.length > 0 ? existingCollisionNames.join(", ") : "none"
    }.`,
  });

  let parsed: CollisionCheckResult;
  try {
    const jsonText = searchResult.text.trim().replace(/^```json\s*|\s*```$/g, "");
    parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.collisions)) throw new Error("collisions field is not an array");
  } catch (err) {
    return { found: 0, error: `Collision-check response could not be parsed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const validCollisions = parsed.collisions.filter(
    (c) => isNonEmptyTrimmed(c?.name) && isNonEmptyTrimmed(c?.whoTheyAre) && isNonEmptyTrimmed(c?.disambiguationNote)
  );

  if (validCollisions.length > 0) {
    await mergeCollisions(
      engagementId,
      validCollisions.map((c) => ({ ...c, source: "collision_check" as const })),
      "append_found"
    );
  }

  return { found: validCollisions.length };
}

/**
 * rep-onboarding's execute() — dispatched via the generic skill/run.execute
 * event same as every runOnSetup skill (see skill.ts). Requires
 * saveRepIdentityGraphIntake to have already run for this engagement (the
 * hinges panel's save endpoint calls that first, then dispatches this same
 * way Pin-Down's own bridge route does) — there is nothing for this step
 * to enrich if the identity graph doesn't exist yet.
 */
export async function runRepOnboarding(tenant: any, runId: string, step: StepTools | undefined): Promise<void> {
  const summary = emptySummary();
  const engagementId: string = tenant.engagementId;

  try {
    const graph = await (step
      ? step.run("load-identity-graph", () => loadIdentityGraph(engagementId))
      : loadIdentityGraph(engagementId));

    if (!graph) {
      throw new Error(
        "No identity graph found for this engagement — save the Reputation Manager intake form before this skill can run."
      );
    }

    summary.whatWasAttempted.push("Loaded the saved identity graph.");

    if (graph.collisionCheckRunAt) {
      await logStep(runId, {
        phase: "collision_check",
        status: "success",
        detail: "Already ran for this engagement — skipped to avoid re-searching on every dispatch.",
      });
      summary.whatWorked.push("Identity graph already had a completed collision check; nothing further to do.");
      await finishRun(runId, { summary });
      return;
    }

    await logStep(runId, { phase: "collision_check", status: "running", detail: "Searching for missed same-name collisions." });

    const entityNames = graph.entities.map((e) => e.name);
    const existingNames = graph.collisions.map((c) => c.name);

    const result = await (step
      ? step.run("collision-check", () =>
          runCollisionCheck(engagementId, graph.operatorName, entityNames, existingNames, runId)
        )
      : runCollisionCheck(engagementId, graph.operatorName, entityNames, existingNames, runId));

    // Set regardless of outcome — "push once" per the source skill's own
    // failure-mode guidance, not "keep retrying forever." A parse failure
    // here is logged as a real failure in the summary, but doesn't throw:
    // the onboarding as a whole already succeeded (the identity graph was
    // saved before this ever ran), and this step's whole purpose is
    // additive enrichment.
    await markCollisionCheckComplete(engagementId);

    if (result.error) {
      await logStep(runId, { phase: "collision_check", status: "failed", detail: result.error });
      summary.whatFailed.push(result.error);
      summary.openItems.push("Re-run the collision check manually if you want another attempt — it won't fire again on its own.");
    } else if (result.found > 0) {
      await logStep(runId, {
        phase: "collision_check",
        status: "success",
        detail: `Found ${result.found} same-name collision${result.found === 1 ? "" : "s"} not already on file.`,
      });
      summary.whatWorked.push(`Found ${result.found} same-name collision${result.found === 1 ? "" : "s"} the buyer hadn't listed.`);
      summary.decisionsMade.push("Added them to the identity graph tagged as system-found, distinct from the buyer's own entries.");
    } else {
      await logStep(runId, { phase: "collision_check", status: "success", detail: "No additional collisions found." });
      summary.whatWorked.push("Searched for same-name collisions — none found beyond what the buyer already listed.");
    }

    await finishRun(runId, { summary });
  } catch (err) {
    await failRun(runId, err, { summary }).catch(() => {});
    throw err;
  }
}

async function loadIdentityGraph(engagementId: string) {
  const [row] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1);
  return row ?? null;
}

async function markCollisionCheckComplete(engagementId: string): Promise<void> {
  await db.update(repIdentityGraphs).set({ collisionCheckRunAt: new Date(), updatedAt: new Date() }).where(eq(repIdentityGraphs.engagementId, engagementId));
}
