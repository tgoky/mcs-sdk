import { Target, BarChart3, Users, Gauge } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The most speculative section Anthony asked for ("we can even have a
 * strategy..."). Unlike every other new page in this pass, there's no
 * existing table behind Goals, Reporting, Resourcing, or Stats — building
 * real versions of these means deciding what a "goal" even is in this
 * product (a target metric on an engagement? a revenue number per client?
 * per project?) before there's anything to query. Shipping fabricated
 * numbers here would look done while being fake, which is worse than
 * shipping an honest shell. This page is that shell — four real anchors
 * the sidebar already routes to, each explaining what it needs to become
 * real instead of pretending it already is.
 */
const SECTIONS: Array<{ id: string; title: string; icon: LucideIcon; note: string }> = [
  {
    id: "goals",
    title: "Goals",
    icon: Target,
    note: "Needs a decision on what a goal targets — a metric on one engagement, one project, or the whole book of business — before it can be more than a page.",
  },
  {
    id: "reporting",
    title: "Reporting",
    icon: BarChart3,
    note: "Overlaps with /dashboard/analytics today. Worth deciding whether this becomes cross-client roll-up reporting (weekly/monthly) distinct from Analytics' live overview, or whether Analytics absorbs it instead.",
  },
  {
    id: "resourcing",
    title: "Resourcing",
    icon: Users,
    note: "No concept of team members, seats, or workload assignment exists in the schema yet — this is the newest idea of the four and needs the most groundwork.",
  },
  {
    id: "stats",
    title: "Stats",
    icon: Gauge,
    note: "Could reuse metricsBenchmark (already in the schema, currently unused by any page) once there's a defined set of cross-client benchmarks to show.",
  },
];

export default function StrategyPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Strategy</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">
        The newest section — not wired to real data yet. Each of these needs a product decision before it's more
        than a placeholder.
      </p>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              id={section.id}
              className="rounded-xl border border-dashed border-border p-4 scroll-mt-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h2>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">{section.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
