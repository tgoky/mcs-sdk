// src/app/api/engagements/[id]/workers/[workerId]/enable/route.ts
//
// The Library's "Enable" action, product-agnostic — the counterpart to
// the existing per-product toggles (skills/[skillId], skills/rep/
// [skillId]) that already assume the product is installed and the
// engagement is already looking at its own Skills panel. This route is
// what makes "click Enable on a worker card in the Library" actually
// work without a separate "install the product first" step: it installs
// the worker's product into the workspace if it isn't already (silently
// — the whole point is the user shouldn't have to think about products
// as a separate concept), then flips the worker on for this engagement.
//
// Same product-onboarding gate skills/[skillId]/route.ts and its rep/
// cold-open/whop-agent siblings all enforce (see
// src/lib/product-onboarding.ts's header for the full "why"): the whole
// product needs its own onboarding worker (pin-down/rep-onboarding/
// icp-lock/whop-connect) to have actually run before ANY of that
// product's skills means anything as a bare boolean flip — not just the
// onboarding worker's own runOnSetup flag against itself, which used to
// leave every other skill in the product enable-able with zero check.
// This route refuses those and points the caller at the onboarding
// bridge instead of pretending a plain toggle worked.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getActiveWorkspace, installPackageInWorkspace } from "@/lib/workspace";
import { isWorkerId, WORKER_REGISTRY, PRODUCT_ONBOARDING_WORKER_ID } from "@/lib/worker-registry";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { isProductOnboarded } from "@/lib/product-onboarding";

export const runtime = "nodejs";
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; workerId: string }> }
) {
  try {
    const { id, workerId } = await params;
    const session = await getSession();
    if (!session?.whopUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isWorkerId(workerId)) {
      return NextResponse.json({ error: `Unknown worker: ${workerId}` }, { status: 400 });
    }

    const worker = WORKER_REGISTRY[workerId];
    const activeWorkspace = await getActiveWorkspace(session.whopUserId);

    const [row] = await db
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

    if (!row) {
      return NextResponse.json({ error: "Engagement not found or access denied" }, { status: 404 });
    }

    if (worker.runOnSetup) {
      return NextResponse.json(
        {
          error: `${worker.name} needs its own setup before it can run — use its configure panel instead of a plain enable.`,
          bridgeHref: `/dashboard/engagements/${id}/bridges/${workerId}`,
        },
        { status: 422 }
      );
    }

    if (!(await isProductOnboarded(worker.productId, id))) {
      const onboardingWorkerId = PRODUCT_ONBOARDING_WORKER_ID[worker.productId];
      const onboardingWorker = WORKER_REGISTRY[onboardingWorkerId];
      return NextResponse.json(
        {
          error: `${onboardingWorker.name} needs to run for this client before ${worker.name} means anything.`,
          bridgeHref: `/dashboard/engagements/${id}/bridges/${onboardingWorkerId}`,
          productId: worker.productId,
          onboardingWorkerName: onboardingWorker.name,
        },
        { status: 422 }
      );
    }

    const installResult = await installPackageInWorkspace(session.whopUserId, activeWorkspace.workspaceId, worker.productId);
    if ("error" in installResult) {
      return NextResponse.json({ error: installResult.error }, { status: 400 });
    }

    await setSkillEnabledForEngagement(id, workerId, true);

    return NextResponse.json({ ok: true, workerId, name: worker.name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[workers/[workerId]/enable POST]", message);
    return NextResponse.json({ error: "Failed to enable worker." }, { status: 500 });
  }
}
