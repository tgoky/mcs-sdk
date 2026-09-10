import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { PortfolioAccountOutcome } from "@/features/reports/server/portfolio-outcomes";

/**
 * "Which accounts need attention right now" — the primary, action-
 * oriented view of Analytics, ahead of the automation-health stats
 * further down the page. Only ever lists accounts with something real
 * to flag this week; a portfolio with nothing at risk renders nothing
 * here rather than an empty section.
 */
export function PortfolioOutcomesSection({ accounts }: { accounts: PortfolioAccountOutcome[] }) {
  const flagged = accounts
    .filter((a) => a.atRiskBlocks.length > 0 || a.correlationFlags.length > 0)
    // Both fronts at once first — that's the case a single-product tool
    // could never surface — then by how many blocks are at risk.
    .sort((a, b) => {
      const aBoth = a.correlationFlags.length > 0 ? 1 : 0;
      const bBoth = b.correlationFlags.length > 0 ? 1 : 0;
      if (aBoth !== bBoth) return bBoth - aBoth;
      return b.atRiskBlocks.length - a.atRiskBlocks.length;
    });

  if (flagged.length === 0) {
    return (
      <div className="p-4 flex items-center gap-3">
        <CircleCheck className="w-5 h-5 shrink-0" style={{ color: "var(--success)" }} />
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Portfolio — all clear
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            Nothing needs attention this week across {accounts.length} engagement{accounts.length !== 1 ? "s" : ""}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <TriangleAlert className="w-5 h-5 shrink-0" style={{ color: "var(--error)" }} />
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Portfolio — accounts to check first
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {flagged.length} of {accounts.length} engagements have something real to look at this week.
          </p>
        </div>
      </div>

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
        {flagged.map((account) => (
          <Link
            key={account.engagementId}
            href={`/dashboard/engagements/${account.engagementId}`}
            className="group flex items-start justify-between gap-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] -mx-2 px-2 rounded-lg transition-colors"
          >
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {account.buyer}
              </p>
              {account.correlationFlags.length > 0 ? (
                account.correlationFlags.map((flag, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    <TriangleAlert className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{flag.message}</span>
                  </p>
                ))
              ) : (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {account.atRiskBlocks.map((b) => `${b.label}: ${b.displayValue}`).join(" · ")}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
