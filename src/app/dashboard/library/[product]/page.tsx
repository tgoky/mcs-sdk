// src/app/dashboard/library/[product]/page.tsx
//
// One Worker's own Library page — replaces the old static
// library/showtime/page.tsx (Showtime-only, backed by the narrower
// per-user package-overview.ts) with one dynamic route for any product,
// backed by the same workspace-scoped worker-analytics.ts rollup the
// rest of the app already uses. This is where a Skill actually gets
// enabled/configured, once its Worker (this page) is installed.

import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  getActiveWorkspace,
  getPrimaryEngagementIdForWorkspace,
  isPackageInstalledInWorkspace,
} from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { getWorkspaceWorkerOverview } from "@/lib/worker-analytics";
import { isProductId, skillIdsForProduct } from "@/lib/product-catalog";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { db } from "@/lib/db";
import { engagements, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { ProductDetailClient } from "@/components/library/product-detail-client";
import { isProductOnboarded, isProductOnboardingSkipDismissed } from "@/lib/product-onboarding";
import { getWorkerCompletenessSummaries } from "@/lib/worker-capability-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProductDetailPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!isProductId(product)) notFound();

  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const workspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);
  const skillIds = skillIdsForProduct(product) as WorkerId[];

  const [enabledWorkerIds, overview, installed, engagementRow, productOnboarded, completenessById] = await Promise.all([
    engagementId ? getEnabledWorkerIdsForEngagement(engagementId) : Promise.resolve([]),
    getWorkspaceWorkerOverview(whopUserId, workspace.workspaceId),
    isPackageInstalledInWorkspace(workspace.workspaceId, product),
    engagementId
      ? db
          .select({ buyer: engagements.buyer, stack: engagements.stack })
          .from(engagements)
          .where(eq(engagements.engagementId, engagementId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    engagementId ? isProductOnboarded(product, engagementId) : Promise.resolve(true),
    // Found missing by this session's own follow-up review: a worker's
    // card showed a flat green "Enabled" badge whether it was actually
    // fully configured or not — this feeds the card the same real
    // completeness data its own Dossier already computes, so the badge
    // can tell the two states apart.
    engagementId ? getWorkerCompletenessSummaries(skillIds, engagementId) : Promise.resolve(new Map()),
  ]);

  const meta = WORKSPACE_PRODUCTS.find((p) => p.id === product);
  const workers = skillIds.map((id) => WORKER_REGISTRY[id]);
  // Plain object, not the Map itself — a server component's props to a
  // client component have to survive RSC serialization.
  const completenessByWorkerId = Object.fromEntries(completenessById);

  return (
    <ProductDetailClient
      productId={product}
      name={meta?.name ?? product}
      description={meta?.description ?? ""}
      image={meta?.image ?? ""}
      installed={installed}
      workers={workers}
      enabledWorkerIds={enabledWorkerIds}
      workerStats={overview.workers.filter((w) => (skillIds as string[]).includes(w.workerId))}
      engagementId={engagementId}
      buyerName={engagementRow?.buyer ?? null}
      productOnboarded={productOnboarded}
      productOnboardingSkipDismissed={isProductOnboardingSkipDismissed(engagementRow?.stack as EngagementStack | null, product)}
      completenessByWorkerId={completenessByWorkerId}
    />
  );
}
