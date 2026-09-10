"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { IcpLockConfigForm } from "@/components/worker-config-forms/icp-lock-config-form";
import { WORKER_REGISTRY } from "@/lib/worker-registry";
import { resolveBackHref } from "../../resolve-back-href";

/**
 * ICP Lock's hinges panel for a client that already exists — mirrors
 * bridges/rep-onboarding/page.tsx's own shape exactly: GET pre-fills
 * whatever's already saved, POST saves + enables the skill + dispatches
 * the confirmation run.
 */
export default function IcpLockBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const backHref = resolveBackHref(useSearchParams(), id);

  return (
    <div className="space-y-4 font-sans antialiased">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          className="flex items-center justify-center w-8 h-8 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/80 dark:bg-zinc-900/80 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors shrink-0"
          aria-label="Back"
          title="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Configure {WORKER_REGISTRY["icp-lock"].name}</h1>
      </div>

      <IcpLockConfigForm
        engagementId={id}
        onCancel={() => router.push(backHref)}
        onSaved={(result) => (result.runId ? router.push(`/dashboard/runs/${result.runId}`) : router.push(backHref))}
      />
    </div>
  );
}
