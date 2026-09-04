import { BackLink } from "@/components/back-link";
import { Lock, Gavel } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CounterClaimPackagePage() {
  return (
    <div className="w-full max-w-3xl space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Library" />

      <div className="flex items-start gap-4">
        <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-800/80 border border-zinc-800">
          <Gavel className="w-7 h-7 text-zinc-400" />
        </div>
        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-200">Counter Claim</h1>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1 leading-relaxed max-w-xl">
            Chargeback and dispute-response automation. This is a separate future product and is not Reputation Manager.
          </p>
          <p className="text-[11px] font-mono text-zinc-600 mt-1">By Mudd Labs · v1.0.2</p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
          <Lock size={13} />
          Not available in this workspace yet
        </div>
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 leading-relaxed">Evidence packs and dispute alerts will live here when Counter Claim is ready to install.</p>
        </div>
      </div>
    </div>
  );
}
