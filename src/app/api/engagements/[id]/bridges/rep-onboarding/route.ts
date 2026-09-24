import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement, isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveRepIdentityGraphIntake, type RepIntakeInput } from "@/features/reputation-manager/server/onboarding-service";
import { REP_ENGINE_IDS } from "@/features/reputation-manager/engine-models";
import type { RepEngineId } from "@/models/schema";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { getClientFact, getClientFacts, recordDossierDecisions } from "@/lib/client-facts";
import { splitFacts } from "@/lib/fact-suggestions";
import { REP_SKILL_IDS, isRepSkillId } from "@/lib/rep-skill-manifest";
import type { RepGoogleListing } from "@/models/schema";
import { afterResponse } from "@/lib/after-response";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * rep-onboarding's own hinges — mirrors bridges/pin-down/route.ts's shape
 * exactly (GET to prefill, POST to save + enable + dispatch), adapted for
 * Reputation Manager's identity-graph fields instead of Pin-Down's brand-
 * voice/confirmation-page ones.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.whopUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const [engagementRow] = await db
    .select({ buyer: engagements.buyer })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagementRow) {
    return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
  }

  // Ensure default repIdentityGraphs record exists ONLY when Reputation Manager onboarding is accessed
  await db
    .insert(repIdentityGraphs)
    .values({
      engagementId: id,
      operatorName: "",
      soleAuthorityName: "",
    })
    .onConflictDoNothing();

  // Promote any trusted, high-confidence client_facts suggestions (competitors,
  // entities, seedPanelPrompts, operatorHandles, collisions) into repIdentityGraphs before querying
  await applyResolvableFacts(id).catch((err) =>
    console.error(`[bridges/rep-onboarding] GET applyResolvableFacts failed for ${id}:`, err)
  );

  const [graph] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, id)).limit(1);
  const enabled = await isSkillEnabledForEngagement(id, "rep-onboarding");
  const primaryDomain = await getPrimaryDomainForEngagement(id);

  // Read harvested review baseline (Trustpilot rating & count) directly from client_facts
  const reviewFact = await getClientFact(id, "reviewBaseline");

  // Findings that weren't auto-filled (Jev scored them below the
  // threshold, or Jev couldn't score them) — previously invisible, so the
  // user saw an empty competitors field instead of "we found these".
  // Dropped once the graph already has a value for that field.
  const { suggestions } = splitFacts(await getClientFacts(id), ["operatorName", "competitors", "entities", "seedPanelPrompts"]);
  if (graph?.operatorName) delete suggestions.operatorName;
  if (graph?.competitors?.length) delete suggestions.competitors;
  if (graph?.entities?.length) delete suggestions.entities;
  if (graph?.seedPanelPrompts?.length) delete suggestions.seedPanelPrompts;

  return NextResponse.json({
    buyer: engagementRow.buyer,
    enabled,
    primaryDomain,
    reviewBaseline: reviewFact?.value ?? null,
    graph: graph
      ? {
          operatorName: graph.operatorName,
          operatorAliases: graph.operatorAliases,
          operatorHandles: graph.operatorHandles,
          operatorDomains: graph.operatorDomains,
          operatorEmailContacts: graph.operatorEmailContacts,
          entities: graph.entities,
          offerings: graph.offerings,
          competitors: graph.competitors,
          collisions: graph.collisions,
          trustedSources: graph.trustedSources,
          seedPanelPrompts: graph.seedPanelPrompts,
          soleAuthorityName: graph.soleAuthorityName,
          crisisThresholdOverride: graph.crisisThresholdOverride,
          activeEngines: graph.activeEngines,
          operatorPagePhone: graph.operatorPagePhone,
        }
      : null,
    suggestions,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);
    if (!(await isPackageInstalledInWorkspace(activeWorkspace.workspaceId, "reputation-manager"))) {
      return NextResponse.json({ error: "Install Reputation Manager before configuring it for a client." }, { status: 403 });
    }

    const [engagementRow] = await db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer })
      .from(engagements)
      .where(
        and(
          eq(engagements.engagementId, id),
          eq(engagements.whopUserId, session.whopUserId),
          eq(engagements.workspaceId, activeWorkspace.workspaceId)
        )
      )
      .limit(1);

    if (!engagementRow) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    // Ensure default repIdentityGraphs record exists before executing fact writebacks
    await db
      .insert(repIdentityGraphs)
      .values({
        engagementId: id,
        operatorName: "",
        soleAuthorityName: "",
      })
      .onConflictDoNothing();

    // Promote trusted suggestions into database columns before processing submitted intake
    await applyResolvableFacts(id).catch((err) =>
      console.error(`[bridges/rep-onboarding] POST applyResolvableFacts failed for ${id}:`, err)
    );

    // The save overwrites every column, but not every caller sends every
    // field (the Single Dossier sends a subset; the full IdentityGraphForm
    // sends all of them). A field missing from the body keeps its saved
    // value instead of being reset — otherwise a dossier save silently
    // wipes aliases, trusted sources, contacts, offerings, and buyer-entered
    // collisions set on the full form.
    const [saved] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, id)).limit(1);
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const savedBuyerCollisions = (saved?.collisions ?? [])
      .filter((c) => c.source === "buyer")
      .map((c) => ({ name: c.name, whoTheyAre: c.whoTheyAre, disambiguationNote: c.disambiguationNote }));

    const input: RepIntakeInput = {
      operatorName: has("operatorName") ? (typeof body.operatorName === "string" ? body.operatorName : "") : saved?.operatorName ?? "",
      operatorAliases: has("operatorAliases") ? (Array.isArray(body.operatorAliases) ? body.operatorAliases : []) : saved?.operatorAliases ?? [],
      operatorHandles: has("operatorHandles")
        ? (typeof body.operatorHandles === "object" && body.operatorHandles !== null ? body.operatorHandles : {})
        : saved?.operatorHandles ?? {},
      operatorDomains: has("operatorDomains") ? (Array.isArray(body.operatorDomains) ? body.operatorDomains : []) : saved?.operatorDomains ?? [],
      operatorEmailContacts: has("operatorEmailContacts")
        ? (Array.isArray(body.operatorEmailContacts) ? body.operatorEmailContacts : [])
        : saved?.operatorEmailContacts ?? [],
      entities: has("entities") ? (Array.isArray(body.entities) ? body.entities : []) : saved?.entities ?? [],
      offerings: has("offerings") ? (Array.isArray(body.offerings) ? body.offerings : []) : saved?.offerings ?? [],
      competitors: has("competitors") ? (Array.isArray(body.competitors) ? body.competitors : []) : saved?.competitors ?? [],
      collisions: has("collisions") ? (Array.isArray(body.collisions) ? body.collisions : []) : savedBuyerCollisions,
      trustedSources: has("trustedSources") ? (Array.isArray(body.trustedSources) ? body.trustedSources : []) : saved?.trustedSources ?? [],
      seedPanelPrompts: has("seedPanelPrompts") ? (Array.isArray(body.seedPanelPrompts) ? body.seedPanelPrompts : []) : saved?.seedPanelPrompts ?? [],
      soleAuthorityName: has("soleAuthorityName")
        ? (typeof body.soleAuthorityName === "string" ? body.soleAuthorityName : "")
        : saved?.soleAuthorityName ?? "",
      crisisThresholdOverride: has("crisisThresholdOverride")
        ? (typeof body.crisisThresholdOverride === "number" ? body.crisisThresholdOverride : null)
        : saved?.crisisThresholdOverride ?? null,
      activeEngines: has("activeEngines")
        ? Array.isArray(body.activeEngines)
          ? body.activeEngines.filter((v: unknown): v is RepEngineId => typeof v === "string" && REP_ENGINE_IDS.includes(v as RepEngineId))
          : null
        : saved?.activeEngines ?? null,
      operatorPagePhone: has("operatorPagePhone")
        ? (typeof body.operatorPagePhone === "string" ? body.operatorPagePhone : null)
        : saved?.operatorPagePhone ?? null,
    };

    const result = await saveRepIdentityGraphIntake(id, input);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await recordDossierDecisions(id, {
      operatorName: input.operatorName,
      competitors: input.competitors.map((c) => c.name),
      entities: input.entities.map((e) => e.name),
      seedPanelPrompts: input.seedPanelPrompts,
    }).catch((err) => console.error(`[bridges/rep-onboarding] recording suggestion decisions failed for ${id}:`, err));

    await setSkillEnabledForEngagement(id, "rep-onboarding", true);

    // The setup screen's Google listing (found by its website matching the
    // client's domain, then kept or removed by the person) and its skill
    // switches: exactly the listed skills on, the rest off.
    if ("googleListing" in body) {
      const listing = readGoogleListing(body.googleListing);
      await db.update(repIdentityGraphs).set({ googleListing: listing, updatedAt: new Date() }).where(eq(repIdentityGraphs.engagementId, id));
    }
    if (Array.isArray(body.skills)) {
      const on = new Set((body.skills as unknown[]).filter((s): s is string => typeof s === "string" && isRepSkillId(s)));
      for (const skill of REP_SKILL_IDS) {
        if (skill === "rep-onboarding") continue;
        await setSkillEnabledForEngagement(id, skill, on.has(skill));
      }
    }

    if (input.operatorDomains[0]) {
      const seedUrl = input.operatorDomains[0];
      afterResponse(() =>
        seedPrimaryDomainFromUrl(id, seedUrl).catch((err) =>
          console.error(`[bridges/rep-onboarding] domain seed failed for ${id}:`, err)
        )
      );
    }

    const runId = await dispatchSkillRun(id, "rep-onboarding", engagementRow.buyer);

    return NextResponse.json({ ok: true, runId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[engagements/[id]/bridges/rep-onboarding]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
/** Only a listing with a place id and a name is kept; anything else clears it. */
function readGoogleListing(value: unknown): RepGoogleListing | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 500) : null);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const placeId = str(v.placeId);
  const name = str(v.name);
  if (!placeId || !name) return null;
  return {
    placeId,
    name,
    googleId: str(v.googleId),
    address: str(v.address),
    site: str(v.site),
    rating: num(v.rating),
    reviews: num(v.reviews),
    reviewsPerScore: v.reviewsPerScore && typeof v.reviewsPerScore === "object" ? (v.reviewsPerScore as Record<string, number>) : null,
    verified: typeof v.verified === "boolean" ? v.verified : null,
    category: str(v.category),
    link: str(v.link),
  };
}
