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
import { engagements } from "@/models/schema";
import { eq } from "drizzle-orm";
import { ProductDetailClient } from "@/components/library/product-detail-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProductDetailPage({ params }: { params: Promise<{ product: string }> }) {
  const { product } = await params;
  if (!isProductId(product)) notFound();

  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const workspace = await getActiveWorkspace(whopUserId);
  const engagementId = await getPrimaryEngagementIdForWorkspace(workspace.workspaceId);

  const [enabledWorkerIds, overview, installed, buyerName] = await Promise.all([
    engagementId ? getEnabledWorkerIdsForEngagement(engagementId) : Promise.resolve([]),
    getWorkspaceWorkerOverview(whopUserId, workspace.workspaceId),
    isPackageInstalledInWorkspace(workspace.workspaceId, product),
    engagementId
      ? db
          .select({ buyer: engagements.buyer })
          .from(engagements)
          .where(eq(engagements.engagementId, engagementId))
          .limit(1)
          .then((r) => r[0]?.buyer ?? null)
      : Promise.resolve(null),
  ]);

  const meta = WORKSPACE_PRODUCTS.find((p) => p.id === product);
  const skillIds = skillIdsForProduct(product) as WorkerId[];
  const workers = skillIds.map((id) => WORKER_REGISTRY[id]);

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
      buyerName={buyerName}
    />
  );
}
