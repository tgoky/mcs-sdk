// src/app/dashboard/engagements/[id]/bridges/[workerId]/page.tsx
//
// One setup page for every worker with a config form. Replaces seven
// near-identical per-worker pages (pin-down, win-back, leak-map,
// pre-call-read, icp-lock, rep-onboarding, whop-connect) at the same URLs,
// so every existing link, "Finish setup" button and Composio return path
// keeps working. Every form carries its own heading (a product's setup,
// or one skill's settings), so the page adds only the breadcrumb and hands
// the form the way back.

import { notFound } from "next/navigation";
import { isWorkerId, WORKER_REGISTRY, PRODUCT_ONBOARDING_WORKER_ID, workersForProduct, type WorkerId } from "@/lib/worker-registry";
import { getEnabledWorkerIdsForEngagement } from "@/lib/engagement-skills";
import { hasSkillSettings, settingsBeyondSetup } from "@/lib/skill-settings/schema";
import { SetupSkillSettings, type SetupSkillBlock } from "@/components/skill-settings/setup-skill-settings";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { loadOwnedEngagement } from "../../owned-engagement";
import { SetupPageClient } from "./setup-page-client";

export const revalidate = 0;

export default async function WorkerSetupPage({ params }: { params: Promise<{ id: string; workerId: string }> }) {
  const { id, workerId } = await params;
  // hasHingesPanel is the registry's "has a config form" flag, kept equal to
  // config-form-registry.tsx's list by tests/unit/config-form-registry.test.tsx.
  if (!isWorkerId(workerId) || !WORKER_REGISTRY[workerId].hasHingesPanel) notFound();

  const engagement = await loadOwnedEngagement(id);
  if (!engagement) notFound();

  const worker = WORKER_REGISTRY[workerId];

  // Setups that list their skills with switches put each skill's gear
  // beside its switch (skill-switch.tsx); Cold Open's setup has no such
  // list, so its skills with more to set get a short list of their own.
  const isProductSetup = PRODUCT_ONBOARDING_WORKER_ID[worker.productId] === workerId && worker.productId === "cold-open";
  let blocks: SetupSkillBlock[] = [];
  if (isProductSetup) {
    const enabled = new Set<WorkerId>(await getEnabledWorkerIdsForEngagement(id).catch(() => []));
    blocks = workersForProduct(worker.productId)
      .filter((w) => (enabled.has(w.id) || w.id === workerId) && hasSkillSettings(w.id))
      .map((w) => ({ skillId: w.id, name: w.name, only: settingsBeyondSetup(w.id, worker.productId) }))
      .filter((b) => b.only.length > 0);
  }

  return (
    <>
      <SetBreadcrumbLabel label={`${engagement.buyer} · ${worker.name}`} />
      <SetupPageClient engagementId={id} workerId={workerId} />
      {blocks.length > 0 && <SetupSkillSettings engagementId={id} blocks={blocks} />}
    </>
  );
}
