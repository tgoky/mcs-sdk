"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { WhopBridgeManagerConfigForm } from "@/components/worker-config-forms/whop-bridge-manager-config-form";

export function BridgeManagerConsole({ engagementId }: { engagementId: string }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <WhopBridgeManagerConfigForm
        engagementId={engagementId}
        onCancel={() => router.push(`/dashboard/engagements/${engagementId}`)}
        cancelLabel="Back to client"
      />

      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1">
        <Link href={`/dashboard/engagements/${engagementId}/skills/whop-webhook-audit`} className="flex items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:underline">
          Webhook fleet health <ArrowUpRight className="w-3 h-3" />
        </Link>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Gap replay after an outage is bounded to 30 days and runs automatically once a disabled subscription passes a health probe and is re-enabled there.</p>
      </div>
    </div>
  );
}
