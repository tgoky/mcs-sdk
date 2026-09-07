"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PinDownConfigForm } from "@/components/worker-config-forms/pin-down-config-form";

/**
 * Pin-Down's hinges panel — reachable from the launch wizard's bridge
 * selection screen (new engagements) or the engagement detail page's
 * Skills panel (enabling Pin-Down for an already-launched client). Same
 * screen either way; GET pre-fills whatever's already saved.
 */
export default function PinDownBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <PinDownConfigForm
      engagementId={id}
      onCancel={() => router.push(`/dashboard/engagements/${id}`)}
      onSaved={(result) => router.push(result.runId ? `/dashboard/runs/${result.runId}` : `/dashboard/engagements/${id}`)}
    />
  );
}
