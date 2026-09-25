"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { WorkerId } from "@/lib/worker-registry";
import { renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { resolveBackHref } from "../../resolve-back-href";

/** Self-headed setups (heading === null) whose own form puts the back
 * button on the same line as its own mark and title, given backHref.
 * Every other self-headed setup still gets this page's own back button,
 * stacked above its heading, until it's wired up the same way. */
const INLINE_BACK_FORMS = new Set<WorkerId>(["pin-down"]);

export function SetupPageClient({
  engagementId,
  workerId,
  heading,
  description,
}: {
  engagementId: string;
  workerId: WorkerId;
  /** Null for setups that carry their own heading. */
  heading: string | null;
  description: string | null;
}) {
  const router = useRouter();
  // Back goes wherever the user came from (?from=, validated), else the client page.
  const backHref = resolveBackHref(useSearchParams(), engagementId);
  const inlineBack = INLINE_BACK_FORMS.has(workerId);

  return (
    <div className="space-y-4 font-sans antialiased">
      {(heading || !inlineBack) && (
        <div className="flex items-start gap-3">
          <Link
            href={backHref}
            className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
            aria-label="Back"
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          {heading && (
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">{heading}</h1>
              {description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-2xl">{description}</p>}
            </div>
          )}
        </div>
      )}

      {renderWorkerConfigForm(workerId, {
        engagementId,
        mode: "setup",
        onClose: () => router.push(backHref),
        // A setup that started a run opens it; any other reported save goes back.
        onSaved: (result) => router.push(result.runId ? `/dashboard/runs/${result.runId}` : backHref),
        // Only a form in INLINE_BACK_FORMS reads this and puts the button
        // on its own header's line; everything else ignores it and keeps
        // getting the button above, rendered here.
        backHref: inlineBack ? backHref : undefined,
      })}
    </div>
  );
}
