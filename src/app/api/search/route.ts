// GET /api/search?q=<term>
//
// Backs the global search bar in top-nav.tsx (previously a dead button —
// no onClick, no listener, nothing wired up). Searches across the four
// entity types the sidebar nav already treats as first-class: Clients
// (engagements), Executions (skill runs), Projects, and Queue (the
// pending-actions/blockers/notifications merge from src/lib/queue.ts).
//
// Every query is scoped to session.whopUserId, matching the tenant-scoping
// pattern used by GET /api/skill-runs/recent and src/lib/queue.ts — this
// codebase has previously shipped unscoped queries that leaked data across
// tenants (see the dashboard-layout recentRuns / dashboard-page
// criticalAlerts bugs), so every branch here is deliberately scoped rather
// than trusting a shared helper to have done it already.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements, skillRuns, projects } from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { skillName, runStatusLabel } from "@/lib/copy";
import { getQueueItems } from "@/lib/queue";

export const runtime = "nodejs";
export const revalidate = 0;

const RESULTS_PER_CATEGORY = 6;

// jsonb path extraction, reused between the SELECT projection and the
// ILIKE filter below — can't reference a SELECT alias from WHERE in the
// same statement, so the raw expression is built once here instead of
// duplicated by hand in two places.
const offerNameExpr = sql<string>`${engagements.offerDetails}->>'name'`;

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const whopUserId = session.whopUserId;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (!q) {
      return NextResponse.json({
        query: "",
        clients: [],
        executions: [],
        projects: [],
        queue: [],
        totalCount: 0,
      });
    }

    const like = `%${q}%`;

    const [clientRows, runRows, projectRows, queueItems] = await Promise.all([
      db
        .select({
          id: engagements.engagementId,
          buyer: engagements.buyer,
          offerName: offerNameExpr,
          pausedAt: engagements.pausedAt,
        })
        .from(engagements)
        .where(
          and(
            eq(engagements.whopUserId, whopUserId),
            isNull(engagements.deletedAt),
            or(
              ilike(engagements.buyer, like),
              ilike(offerNameExpr, like),
              ilike(engagements.engagementId, like)
            )
          )
        )
        .orderBy(asc(engagements.buyer))
        .limit(RESULTS_PER_CATEGORY),

      db
        .select({
          id: skillRuns.id,
          skillNameRaw: skillRuns.skillName,
          status: skillRuns.status,
          startedAt: skillRuns.startedAt,
          buyer: engagements.buyer,
        })
        .from(skillRuns)
        .innerJoin(engagements, eq(skillRuns.engagementId, engagements.engagementId))
        .where(
          and(
            eq(engagements.whopUserId, whopUserId),
            or(
              ilike(engagements.buyer, like),
              ilike(skillRuns.skillName, like),
              ilike(skillRuns.status, like),
              ilike(skillRuns.errorMessage, like)
            )
          )
        )
        .orderBy(desc(skillRuns.startedAt))
        .limit(RESULTS_PER_CATEGORY),

      db
        .select({ id: projects.id, name: projects.name, description: projects.description })
        .from(projects)
        .where(
          and(
            eq(projects.whopUserId, whopUserId),
            isNull(projects.deletedAt),
            or(ilike(projects.name, like), ilike(projects.description, like))
          )
        )
        .orderBy(asc(projects.name))
        .limit(RESULTS_PER_CATEGORY),

      // Queue has no single backing table — it's a read-time merge of
      // pending_actions/human_blockers/notifications. Reusing the same
      // helper the Queue page and sidebar badge already call keeps this
      // in sync with however that merge logic evolves, instead of
      // re-deriving a second, competing version of it here.
      getQueueItems(whopUserId),
    ]);

    const qLower = q.toLowerCase();
    const queueMatches = queueItems.filter(
      (item) =>
        item.title.toLowerCase().includes(qLower) ||
        item.subtitle.toLowerCase().includes(qLower) ||
        (item.buyer ?? "").toLowerCase().includes(qLower)
    );

    const clients = clientRows.map((c) => ({
      id: c.id,
      title: c.buyer,
      subtitle: c.offerName || "No offer set yet",
      href: `/dashboard/engagements/${c.id}`,
      badge: c.pausedAt ? "Paused" : null,
    }));

    const executions = runRows.map((r) => ({
      id: r.id,
      title: `${skillName(r.skillNameRaw)} · ${r.buyer}`,
      subtitle: `${runStatusLabel(r.status)} · ${new Date(r.startedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`,
      href: `/dashboard/runs/${r.id}`,
      status: r.status,
    }));

    const projectResults = projectRows.map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.description || "Project",
      href: `/dashboard/projects/${p.id}`,
    }));

    const queue = queueMatches.slice(0, RESULTS_PER_CATEGORY).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      href: item.engagementId ? `/dashboard/engagements/${item.engagementId}` : "/dashboard/queue",
      category: item.category,
    }));

    const totalCount = clients.length + executions.length + projectResults.length + queue.length;

    return NextResponse.json({
      query: q,
      clients,
      executions,
      projects: projectResults,
      queue,
      totalCount,
    });
  } catch (err) {
    console.error("[search]", err);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
