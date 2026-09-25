"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { WorkerId } from "@/lib/worker-registry";
import { renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { resolveBackHref } from "../../resolve-back-href";

/** Every form puts the back button on its own header's line (next to its
 * mark and title), given backHref, so this page draws no heading of its own. */
export function SetupPageClient({ engagementId, workerId }: { engagementId: string; workerId: WorkerId }) {
  const router = useRouter();
  // Back goes wherever the user came from (?from=, validated), else the client page.
  const backHref = resolveBackHref(useSearchParams(), engagementId);

  return (
    <div className="space-y-4 font-sans antialiased">
      {renderWorkerConfigForm(workerId, {
        engagementId,
        mode: "setup",
        onClose: () => router.push(backHref),
        // A setup that started a run opens it; any other reported save goes back.
        onSaved: (result) => router.push(result.runId ? `/dashboard/runs/${result.runId}` : backHref),
        backHref,
      })}
    </div>
  );
}
