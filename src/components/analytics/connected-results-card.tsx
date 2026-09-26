// src/components/analytics/connected-results-card.tsx
//
// "From first email to money": what the products a client has on did
// together (features/reports/server/connected-results.ts). Only the stages
// its products can see are shown; money is only what Whop recorded.

import type { ConnectedResults } from "@/lib/client-results-shape";

export function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString()} ${currency.toUpperCase()}`;
  }
}

/** The funnel as words: "120 emailed → 9 replied → 7 booked → 5 showed → 2 paid". */
export function funnelSteps(f: ConnectedResults["funnel"]): string[] {
  const steps: [number | undefined, string][] = [
    [f.emailed, "emailed"],
    [f.replied, "replied"],
    [f.booked, "booked"],
    [f.showed, "showed"],
    [f.paid, "paid"],
  ];
  return steps.filter(([n]) => n !== undefined).map(([n, label]) => `${n} ${label}`);
}

export function ConnectedResultsCard({ connected }: { connected: ConnectedResults }) {
  const steps = funnelSteps(connected.funnel);
  const cur = connected.money?.currency ?? "usd";
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">From first email to money</p>
      <p className="text-[15px] font-mono text-zinc-900 dark:text-zinc-100">{steps.join(" → ")}</p>

      {connected.money && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatAmount(connected.money.collected, cur)}</span> collected
          {connected.money.refunded > 0 && <> · {formatAmount(connected.money.refunded, cur)} refunded · <span className="font-semibold">{formatAmount(connected.money.kept, cur)}</span> kept</>}
          <span className="text-zinc-400"> ({connected.money.payments} Whop payment{connected.money.payments === 1 ? "" : "s"})</span>
        </p>
      )}

      <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {connected.fromColdOpen && (
          <li>
            From cold email: <b className="text-zinc-900 dark:text-zinc-100">{connected.fromColdOpen.booked} booked</b>, {connected.fromColdOpen.showed} showed
            {connected.fromColdOpen.value !== null && <>, {connected.fromColdOpen.paid} paid ({formatAmount(connected.fromColdOpen.value, cur)})</>}
          </li>
        )}
        {connected.paidAfterCall && (
          <li>
            Paid after showing up: <b className="text-zinc-900 dark:text-zinc-100">{connected.paidAfterCall.buyers}</b> buyer{connected.paidAfterCall.buyers === 1 ? "" : "s"}, {formatAmount(connected.paidAfterCall.value, cur)}
          </li>
        )}
      </ul>

      {connected.campaigns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">By campaign</p>
          <ul className="space-y-0.5 text-sm font-mono text-zinc-700 dark:text-zinc-300">
            {connected.campaigns.map((c) => (
              <li key={c.campaignId} className="truncate">
                {c.campaignId}: {c.emailed} emailed → {c.booked} booked → {c.showed} showed
                {c.value !== null && <> → {c.paid} paid · {formatAmount(c.value, cur)}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-zinc-400 dark:text-zinc-600">Last 30 days. People are matched across your tools by email. Money is Whop&apos;s own payment records, not an estimate.</p>
    </div>
  );
}
