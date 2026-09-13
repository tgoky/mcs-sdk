"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { WhopConnectConfigForm } from "@/components/worker-config-forms/whop-connect-config-form";
import { resolveBackHref } from "../../resolve-back-href";

/**
 * Whop Agent's connect flow — Section 2.3-2.6. Same hinges-panel shape as
 * pin-down's own bridge page (runOnSetup, own dedicated screen), since
 * connecting a Whop account is a real setup step with its own probe
 * results to show, not a plain config-fields form.
 */
export default function WhopConnectBridgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Connect Whop Agent</h1>
      </div>

      <WhopConnectConfigForm engagementId={id} />
    </div>
  );
}
