import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, repIdentityGraphs } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateSchemaJsonLd, generateWikidataStatements } from "@/features/reputation-manager/server/offensive/schema-wikidata";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Move A's generation endpoint. Stateless by design — the JSON-LD graph
 * and Wikidata statements are recomputed fresh from the current identity
 * graph on every GET rather than cached/persisted, so an edit to the
 * intake form (a new domain, a new handle) shows up here immediately with
 * nothing to invalidate.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.whopUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeWorkspace = await getActiveWorkspace(session.whopUserId);
  const [engagementRow] = await db
    .select({ engagementId: engagements.engagementId })
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, id),
        eq(engagements.whopUserId, session.whopUserId),
        eq(engagements.workspaceId, activeWorkspace.workspaceId)
      )
    )
    .limit(1);

  if (!engagementRow) return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });

  const [graph] = await db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, id)).limit(1);
  if (!graph) {
    return NextResponse.json(
      { error: "No identity graph found for this client yet — complete Reputation Manager's identity setup first." },
      { status: 404 }
    );
  }

  const jsonLd = generateSchemaJsonLd({
    operatorName: graph.operatorName,
    operatorAliases: graph.operatorAliases,
    operatorHandles: graph.operatorHandles,
    operatorDomains: graph.operatorDomains,
    entities: graph.entities,
    offerings: graph.offerings,
  });

  const wikidataStatements = generateWikidataStatements({
    operatorDomains: graph.operatorDomains,
    operatorHandles: graph.operatorHandles,
    entities: graph.entities,
    collisions: graph.collisions,
  });

  return NextResponse.json({ jsonLd, wikidataStatements });
}
