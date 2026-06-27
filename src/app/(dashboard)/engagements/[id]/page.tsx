import { db } from "@/lib/db";
import {
  engagements,
  skillRuns,
  briefedCallsLog,
  auditRunsLog,
} from "@/models/schema";
import { getSession } from "@/lib/session";
import { and, eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TriggerSkillButton } from "./trigger-skill-button";

export const revalidate = 0;

export default async function EngagementDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  const engagementId = params.id;

  const engagement = await db
    .select()
    .from(engagements)
    .where(
      and(
        eq(engagements.engagementId, engagementId),
        eq(engagements.whopUserId, session.whopUserId!)
      )
    )
    .then((r) => r[0]);

  if (!engagement) notFound();

  const recentRuns = await db
    .select()
    .from(skillRuns)
    .where(eq(skillRuns.engagementId, engagementId))
    .orderBy(desc(skillRuns.startedAt))
    .limit(20);

  const recentBriefs = await db
    .select()
    .from(briefedCallsLog)
    .where(eq(briefedCallsLog.engagementId, engagementId))
    .orderBy(desc(briefedCallsLog.createdAt))
    .limit(10);

  const recentAudits = await db
    .select()
    .from(auditRunsLog)
    .where(eq(auditRunsLog.engagementId, engagementId))
    .orderBy(desc(auditRunsLog.createdAt))
    .limit(5);

  const stack = engagement.stack as any;
  const offer = engagement.offerDetails as any;

  const totalCost = recentRuns.reduce((acc, r) => acc + (r.costInCents ?? 0), 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto tracking-tight">
      {/* Header */}
      <div className="pb-2 border-b border-zinc-900 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium tracking-tighter text-zinc-100">
            {engagement.buyer}
          </h1>
          <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
            {engagementId}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono text-zinc-500">
            Total API spend
          </p>
          <p className="text-lg font-light font-sans text-zinc-200">
            ${(totalCost / 100).toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Config summary */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-3">
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              Stack Config
            </h2>
            <div className="space-y-1.5 text-[11px]">
              {[
                ["Booking", stack?.booking_platform],
                ["Email", stack?.email_platform],
                ["Hosting", stack?.hosting_platform],
                ["Brief destination", stack?.brief_landing_destination ?? "slack"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-zinc-600">{label}</span>
                  <span className="font-mono text-zinc-300">
                    {value ?? "not set"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {offer && (
            <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-3">
              <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Offer
              </h2>
              <div className="space-y-1.5 text-[11px]">
                {[
                  ["Name", offer.name],
                  ["Price", offer.price],
                  ["ICP", offer.icp],
                  ["Traffic", offer.traffic_temperature],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-zinc-600">{label}</span>
                    <span className="font-mono text-zinc-300">
                      {value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual skill triggers */}
          <div className="rounded border border-zinc-900 bg-zinc-950/40 p-4 space-y-3">
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
              Manual Triggers
            </h2>
            <div className="space-y-2">
              <TriggerSkillButton
                label="Run Pre-Call Read"
                endpoint={`/api/crons/nightly-briefs?engagement_id=${engagementId}`}
              />
              <TriggerSkillButton
                label="Run Weekly Audit"
                endpoint={`/api/crons/leak-map-audit?type=weekly&engagement_id=${engagementId}`}
              />
            </div>
          </div>
        </div>

        {/* Run history + briefs + audits */}
        <div className="lg:col-span-2 space-y-5">
          {/* Recent skill runs */}
          <div className="rounded border border-zinc-900 bg-zinc-950/10 p-4 space-y-3">
            <h2 className="text-sm font-medium text-zinc-300">Skill Run History</h2>
            {recentRuns.length === 0 ? (
              <p className="text-xs text-zinc-600 font-light">No runs yet.</p>
            ) : (
              <table className="w-full text-[11px] font-sans">
                <thead>
                  <tr className="border-b border-zinc-900 text-zinc-500 font-mono text-[10px] uppercase">
                    <th className="text-left p-2 font-normal">Skill</th>
                    <th className="text-left p-2 font-normal">Phase</th>
                    <th className="text-left p-2 font-normal">Status</th>
                    <th className="text-left p-2 font-normal">Cost</th>
                    <th className="text-left p-2 font-normal hidden sm:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 text-zinc-400">
                  {recentRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-zinc-900/20">
                      <td className="p-2 font-mono text-zinc-200">{run.skillName}</td>
                      <td className="p-2">
                        <span className="bg-zinc-900 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-800 font-mono text-[10px]">
                          {run.phase ?? "init"}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                            run.status === "success"
                              ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
                              : run.status === "failed"
                              ? "bg-rose-500/5 text-rose-400 border-rose-500/10"
                              : "bg-amber-500/5 text-amber-400 border-amber-500/10 animate-pulse"
                          }`}
                        >
                          {run.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-[10px] text-zinc-300">
                        {run.costInCents ? `$${(run.costInCents / 100).toFixed(2)}` : "$0.00"}
                      </td>
                      <td className="p-2 text-zinc-600 font-mono text-[10px] hidden sm:table-cell">
                        {new Date(run.startedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Briefed calls */}
          <div className="rounded border border-zinc-900 bg-zinc-950/10 p-4 space-y-3">
            <h2 className="text-sm font-medium text-zinc-300">Brief History</h2>
            {recentBriefs.length === 0 ? (
              <p className="text-xs text-zinc-600 font-light">
                No briefs delivered yet.
              </p>
            ) : (
              <div className="space-y-1">
                {recentBriefs.map((brief) => (
                  <div
                    key={brief.id}
                    className="flex items-center justify-between p-2 rounded border border-zinc-900 bg-zinc-950"
                  >
                    <div>
                      <p className="text-[11px] text-zinc-300">
                        {brief.prospectName ?? "Unknown"}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-600">
                        {new Date(brief.callTime).toLocaleDateString()} ·{" "}
                        {brief.destinationDelivered ?? "slack"}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                          (brief.personMatchScore ?? 0) >= 99
                            ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
                            : "bg-amber-500/5 text-amber-400 border-amber-500/10"
                        }`}
                      >
                        {brief.personMatchScore ?? 0}/100
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit reports */}
          {recentAudits.length > 0 && (
            <div className="rounded border border-zinc-900 bg-zinc-950/10 p-4 space-y-3">
              <h2 className="text-sm font-medium text-zinc-300">
                Leak Map Reports
              </h2>
              {recentAudits.map((audit) => {
                const issues = (audit.topIssues as any[]) ?? [];
                return (
                  <div
                    key={audit.id}
                    className="rounded border border-zinc-900 bg-zinc-950 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-zinc-400">
                        {audit.runType.toUpperCase()} AUDIT
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600">
                        {new Date(audit.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {issues.map((issue: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="text-zinc-400">{issue.name}</span>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                            issue.severity === "high"
                              ? "bg-rose-500/5 text-rose-400 border-rose-500/10"
                              : issue.severity === "medium"
                              ? "bg-amber-500/5 text-amber-400 border-amber-500/10"
                              : "bg-zinc-900 text-zinc-500 border-zinc-800"
                          }`}
                        >
                          {issue.delta > 0 ? "+" : ""}
                          {typeof issue.delta === "number"
                            ? issue.delta.toFixed(1)
                            : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}