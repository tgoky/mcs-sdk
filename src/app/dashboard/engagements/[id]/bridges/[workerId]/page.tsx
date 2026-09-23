// src/app/dashboard/engagements/[id]/bridges/[workerId]/page.tsx
//
// One setup page for every worker with a config form: title, one
// sentence, the form. Replaces seven near-identical per-worker pages
// (pin-down, win-back, leak-map, pre-call-read, icp-lock, rep-onboarding,
// whop-connect) at the same URLs, so every existing link, "Finish setup"
// button and Composio return path keeps working.

import { notFound } from "next/navigation";
import { isWorkerId, WORKER_REGISTRY } from "@/lib/worker-registry";
import { SetBreadcrumbLabel } from "@/components/breadcrumbs/breadcrumb-context";
import { loadOwnedEngagement } from "../../owned-engagement";
import { SetupPageClient } from "./setup-page-client";

export const revalidate = 0;

/** Headings that don't read as "Configure <name>". */
const SETUP_HEADINGS: Partial<Record<string, string>> = {
  "whop-connect": "Connect your Whop account",
};

/** Setups that introduce themselves (their own heading and copy), so the
 * page only adds the way back. */
const SELF_HEADED_SETUPS = new Set(["pin-down"]);

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
      <SetupPageClient
        engagementId={id}
        workerId={workerId}
        heading={SELF_HEADED_SETUPS.has(workerId) ? null : SETUP_HEADINGS[workerId] ?? `Configure ${worker.name}`}
        description={SELF_HEADED_SETUPS.has(workerId) ? null : worker.description}
      />
    </>
  );
}
