// src/components/analytics/client-results-section.tsx
//
// What clients got, per product, last 30 days against the 30 before.
// Used by Analytics (the whole portfolio, plus one row per client) and by
// the client report (one client). Types only from client-results.ts, so
// this renders inside client components too.

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import type { ClientResults, Metric, Product, ProductResults, ShowRateThenNow } from "@/lib/client-results-shape";

export const PRODUCT_NAME: Record<Product, string> = {
  showtime: "Showtime",
  "cold-open": "Cold Open",
  reputation: "Reputation Manager",
  whop: "Whop Agent",
};

function fmtDuration(ms: number): string {
  const secs = ms / 1000;
  if (secs < 90) return `${Math.max(1, Math.round(secs))}s`;
  const mins = secs / 60;
  if (mins < 90) return `${Math.round(mins)}m`;
  return `${Math.round(mins / 60)}h`;
}

export function formatMetric(value: number | null, format: Metric["format"]): string {
  if (value === null) return "—";
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "rating") return `${value.toFixed(1)}★`;
  if (format === "duration") return fmtDuration(value);
  return value.toLocaleString();
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** The change against the previous window, in the metric's own terms:
 * points for a percent, stars for a rating, a plain difference otherwise. */
function Change({ metric }: { metric: Metric }) {
  const { current, previous, format, better } = metric;
  if (current === null || previous === null) {
    return <span className="text-sm text-zinc-400 dark:text-zinc-600">{previous === null && current !== null ? "new" : ""}</span>;
  }
  const diff = current - previous;
  if (diff === 0 || (format === "percent" && Math.round(diff * 100) === 0) || (format === "rating" && Math.abs(diff) < 0.05)) {
    return <span className="text-sm text-zinc-400 dark:text-zinc-600">no change</span>;
  }
  const good = better === "up" ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  let text: string;
  if (format === "percent") text = `${Math.abs(Math.round(diff * 100))} pts`;
  else if (format === "rating") text = `${Math.abs(diff).toFixed(1)}★`;
  else if (format === "duration") text = fmtDuration(Math.abs(diff));
  else text = Math.abs(diff).toLocaleString();
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-mono ${good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}

function ProductCard({ result }: { result: ProductResults }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 space-y-3">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{PRODUCT_NAME[result.product]}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {result.metrics.map((m) => (
          <div key={m.key} className="min-w-0">
            <p className="text-sm text-zinc-500 dark:text-zinc-500 truncate">{m.label}</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xl font-semibold font-mono text-zinc-900 dark:text-zinc-100">{formatMetric(m.current, m.format)}</span>
              <Change metric={m} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductResultsGrid({ products }: { products: ProductResults[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {products.map((p) => (
        <ProductCard key={p.product} result={p} />
      ))}
    </div>
  );
}

/** Show rate in the client's first month against now. The dollar figure is
 * an estimate (extra shows × the offer price) and says so. */
export function ShowRateThenNowCard({ showRate, clients }: { showRate: ShowRateThenNow; clients?: number }) {
  const lift = Math.round((showRate.current - showRate.baseline) * 100);
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 space-y-2">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Show rate, first month vs now</p>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-xl font-mono text-zinc-500 dark:text-zinc-500">{Math.round(showRate.baseline * 100)}%</span>
        <span className="text-zinc-400">→</span>
        <span className="text-2xl font-semibold font-mono text-zinc-900 dark:text-zinc-100">{Math.round(showRate.current * 100)}%</span>
        {lift !== 0 && (
          <span className={`text-sm font-mono ${lift > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {lift > 0 ? "+" : ""}
            {lift} pts
          </span>
        )}
      </div>
      {showRate.extraShows > 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {showRate.extraShows} more call{showRate.extraShows !== 1 ? "s" : ""} showed up in the last 30 days than the first-month rate would have given
          {showRate.estimatedValue !== null && (
            <>
              {" "}
              · <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMoney(showRate.estimatedValue)}</span>{" "}
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-500">
                Estimate
              </span>
            </>
          )}
        </p>
      )}
      <p className="text-sm text-zinc-400 dark:text-zinc-600">
        {clients !== undefined ? `Across ${clients} client${clients !== 1 ? "s" : ""} with at least 10 outcomes in their first month. ` : "First month = the first 30 days of recorded call outcomes. "}
        {showRate.estimatedValue !== null ? "Estimate = extra shows × the offer price on file, not closed revenue." : ""}
      </p>
    </div>
  );
}

/** The one headline per product for a client-table cell. */
const HEADLINE: Record<Product, string> = {
  showtime: "showRate",
  "cold-open": "replyRate",
  reputation: "avgRating",
  whop: "stayed",
};

export interface ClientRow {
  results: ClientResults;
  /** What to look at, from the portfolio's at-risk checks. */
  flags: string[];
}

export function ClientResultsTable({ rows }: { rows: ClientRow[] }) {
  const products = (["showtime", "cold-open", "reputation", "whop"] as Product[]).filter((p) => rows.some((r) => r.results.products.some((x) => x.product === p)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="text-left text-sm text-zinc-500 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800/80">
            <th className="py-2 pr-4 font-medium">Client</th>
            {products.map((p) => (
              <th key={p} className="py-2 pr-4 font-medium whitespace-nowrap">
                {PRODUCT_NAME[p]}
              </th>
            ))}
            <th className="py-2 font-medium">Needs a look</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
          {rows.map(({ results, flags }) => (
            <tr key={results.engagementId} className="align-top">
              <td className="py-2.5 pr-4">
                <Link href={`/dashboard/engagements/${results.engagementId}`} className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline">
                  {results.buyer}
                </Link>
              </td>
              {products.map((p) => {
                const pr = results.products.find((x) => x.product === p);
                const m = pr?.metrics.find((x) => x.key === HEADLINE[p]);
                return (
                  <td key={p} className="py-2.5 pr-4 whitespace-nowrap">
                    {m ? (
                      <div>
                        <span className="text-sm text-zinc-500 dark:text-zinc-500 mr-1.5">{m.label}</span>
                        <span className="font-mono text-zinc-900 dark:text-zinc-100">{formatMetric(m.current, m.format)}</span> <Change metric={m} />
                      </div>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-700">—</span>
                    )}
                  </td>
                );
              })}
              <td className="py-2.5 text-sm">
                {flags.length === 0 ? (
                  <span className="text-zinc-400 dark:text-zinc-600">Nothing</span>
                ) : (
                  <span className="inline-flex items-start gap-1 text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{flags.join(" · ")}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
