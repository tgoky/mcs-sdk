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
import { isWorkerId, WORKER_REGISTRY } from "@/lib/worker-registry";
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
  return (
    <>
      <SetBreadcrumbLabel label={`${engagement.buyer} · ${worker.name}`} />
      <SetupPageClient engagementId={id} workerId={workerId} />
    </>
  );
}
