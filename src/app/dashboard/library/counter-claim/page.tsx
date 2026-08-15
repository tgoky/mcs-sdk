import { BackLink } from "@/components/back-link";
import { Gavel, Lock, FileWarning, Bell, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const WHATS_COMING = [
  {
    icon: FileWarning,
    title: "Evidence packs",
    body: "Generated automatically as a chargeback comes in, pulling together whatever this workspace already has on that transaction.",
  },
  {
    icon: Bell,
    title: "Dispute alerts",
    body: "A notification the moment a dispute is filed, instead of finding out from your payment processor's dashboard days later.",
  },
  {
    icon: ShieldCheck,
    title: "One place, not five tabs",
    body: "Runs alongside Showtime in the same workspace — same clients, same login, no separate account to manage.",
  },
];

export default function CounterClaimPackagePage() {
  return (
    <div className="w-full max-w-3xl space-y-8 px-6 py-6 font-sans">
      <BackLink href="/dashboard/library" label="Library" />

      <div className="flex items-start gap-4">
        <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/90 dark:bg-amber-500/90 opacity-80">
          <Gavel size={26} className="text-zinc-950 stroke-[2.3px]" />
        </div>
        <div className="min-w-0 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-zinc-200">Counter Claim</h1>
            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1 leading-relaxed max-w-xl">
            Automated dispute responses for chargebacks — evidence packs and alerts generated as
            disputes come in.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
          <Lock size={13} />
          Not available in this workspace yet
        </div>
        <div className="space-y-4">
          {WHATS_COMING.map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <item.icon size={16} className="text-zinc-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-zinc-300">{item.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
