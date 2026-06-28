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

interface IssuePayload {
  name: string;
  current: number;
  prior: number;
  delta: number;
  severity: "high" | "medium" | "low" | "none";
  likelyCause?: string;
  recommendedAction?: string;
  expectedImpact?: string;
  estimatedEffort?: string;
}

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

  // PRODUCT UPDATE: Count successful automation executions instead of exposing developer API spent totals
  const successfulRunsCount = recentRuns.filter((r) => r.status === "success").length;

  // GUARDRAIL 3: Ghost-Default Taxonomy Mapping for Stack Fields
  const bookingLabel =
    stack?.booking_platform === "ghl_calendar" ? "GHL Calendar Engine" :
    stack?.booking_platform === "cal_com" ? "Cal.com Infrastructure" :
    stack?.booking_platform === "calendly" ? "Calendly Core V2" :
    stack?.booking_platform === "oncehub" ? "OnceHub Portal" :
    "Unconfigured Link";

  const emailLabel = 
    stack?.email_platform 
      ? `${stack.email_platform.charAt(0).toUpperCase()}${stack.email_platform.slice(1)}` 
      : "Pipeline Omitted";

  const hostingLabel = 
    stack?.hosting_platform 
      ? `${stack.hosting_platform.replace(/_/g, " ").toUpperCase()}` 
      : "Default System Domain";

  const destinationLabel = 
    stack?.brief_landing_destination 
      ? `${stack.brief_landing_destination.toUpperCase()}` 
      : "SLACK DM";

  return (
    <div className="space-y-10 max-w-5xl mx-auto tracking-tight antialiased selection:bg-zinc-800">
      
      {/* Premium Minimalist Header */}
      <div className="pb-5 border-b border-zinc-950 flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="space-y-1">
          <h1 className="text-lg font-medium tracking-tight text-zinc-100">
            {engagement.buyer}
          </h1>
          <p className="text-[10px] font-mono text-zinc-500 tracking-wider">
            NODE_ID: {engagementId}
          </p>
        </div>
        <div className="sm:text-right space-y-0.5">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
            Automated Tasks
          </p>
          <p className="text-2xl font-light text-zinc-100 font-sans">
            {successfulRunsCount} <span className="text-xs font-mono text-zinc-500 uppercase">success</span>
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3 items-start">
        
        {/* Left Column: Stack Config, Offer, & Manual Triggers */}
        <div className="lg:col-span-1 space-y-8">
          
          {/* Stack Config Block */}
          <div className="space-y-2.5 px-1">
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Stack Config
            </h2>
            <div className="space-y-2 text-xs font-sans font-normal border border-zinc-900 bg-zinc-950/20 rounded-lg p-3.5">
              <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                <span className="text-zinc-500">Booking Engine</span>
                <span className="font-mono text-zinc-300">{bookingLabel}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                <span className="text-zinc-500">CRM Channels</span>
                <span className="font-mono text-zinc-300">{emailLabel}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                <span className="text-zinc-500">Hosting Route</span>
                <span className="font-mono text-zinc-300">{hostingLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Brief Matrix</span>
                <span className="font-mono text-zinc-300">{destinationLabel}</span>
              </div>
            </div>
          </div>

          {/* Offer Block */}
          {offer && (
            <div className="space-y-2.5 px-1">
              <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                Offer Framework
              </h2>
              <div className="space-y-2 text-xs font-sans font-normal border border-zinc-900 bg-zinc-950/20 rounded-lg p-3.5">
                <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                  <span className="text-zinc-500">Program Name</span>
                  <span className="font-normal text-zinc-200 text-right max-w-[180px] truncate">{offer.name || "—"}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                  <span className="text-zinc-500">Tier Value</span>
                  <span className="font-mono text-zinc-300">{offer.price || "—"}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-900/60 pb-1.5">
                  <span className="text-zinc-500">Funnel Heat</span>
                  <span className="font-mono text-zinc-400 capitalize">{offer.traffic_temperature || "—"}</span>
                </div>
                <div className="flex flex-col space-y-1 pt-0.5">
                  <span className="text-zinc-500">Target ICP Segment</span>
                  <p className="text-zinc-400 leading-relaxed text-[11px] font-light">
                    {offer.icp || "No customer segment parameters specified."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Manual Skill Triggers */}
          <div className="space-y-2.5 px-1">
            <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              Manual Triggers
            </h2>
            <div className="space-y-2.5">
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

        {/* Right Column: Run History, Brief History, & Expandable Leak Map Reports */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Skill Run History Table (Internal Compute Costs Removed) */}
          <div className="space-y-3 px-1">
            <h2 className="text-sm font-medium text-zinc-200">Skill Run History</h2>
            {recentRuns.length === 0 ? (
              <p className="text-xs text-zinc-600 font-light pl-1">No execution logs found.</p>
            ) : (
              <div className="w-full overflow-hidden border border-zinc-900 rounded-lg bg-zinc-950/20">
                <table className="w-full text-left border-collapse text-xs font-sans tracking-tight">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                      <th className="p-3 font-normal">Module Engine</th>
                      <th className="p-3 font-normal">Active Phase</th>
                      <th className="p-3 font-normal">Execution Status</th>
                      <th className="p-3 font-normal text-right hidden sm:table-cell">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60 font-normal text-zinc-400">
                    {recentRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-zinc-900/10 transition-colors duration-150">
                        <td className="p-3 font-mono text-zinc-200 text-xs">
                          {run.skillName}
                        </td>
                        <td className="p-3 text-zinc-400 font-mono text-[11px]">
                          {run.phase ? run.phase.replace(/_/g, " ") : "initialization"}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center space-x-2">
                            <span className={`h-1 w-1 rounded-full ${
                              run.status === "success" ? "bg-emerald-500" : run.status === "failed" ? "bg-rose-500" : "bg-amber-500 animate-pulse"
                            }`} />
                            <span className={`font-mono text-[11px] uppercase tracking-wide ${
                              run.status === "success" ? "text-zinc-300" : run.status === "failed" ? "text-rose-400/90" : "text-amber-400/90"
                            }`}>
                              {run.status}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-right text-zinc-500 text-[11px] hidden sm:table-cell">
                          {new Date(run.startedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Brief History (GUARDRAIL 1: Rule 14 Identity Honesty Enforcement) */}
          <div className="space-y-3 px-1">
            <h2 className="text-sm font-medium text-zinc-200">Brief History Summary</h2>
            {recentBriefs.length === 0 ? (
              <p className="text-xs text-zinc-600 font-light pl-1">No briefing packets delivered yet.</p>
            ) : (
              <div className="space-y-2 max-w-full">
                {recentBriefs.map((brief) => {
                  const isResearchOmitted = (brief.personMatchScore ?? 0) < 99; // Rule 14 Guardrail Threshold

                  return (
                    <div
                      key={brief.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg border border-zinc-900 bg-zinc-950/20 hover:bg-zinc-900/10 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-xs font-medium text-zinc-200">
                            {brief.prospectName ?? "Prospect Record"}
                          </p>
                          {isResearchOmitted && (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 bg-zinc-900/60 px-1.5 py-0.5 rounded border border-zinc-800/40">
                              Research Omitted
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-zinc-500">
                          {new Date(brief.callTime).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                          {" · "}
                          <span className="uppercase text-[9px]">{brief.destinationDelivered ?? "slack"}</span>
                        </p>
                      </div>
                      <div className="text-left sm:text-right mt-2 sm:mt-0">
                        <span
                          className={`inline-block font-mono text-[10px] px-2 py-0.5 rounded border ${
                            !isResearchOmitted
                              ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/10"
                              : "bg-zinc-900 text-zinc-400 border-zinc-800"
                          }`}
                          title={isResearchOmitted ? "Identity confidence below threshold — profile lookups withheld." : "Verified profile."}
                        >
                          {brief.personMatchScore ?? 0}/100 Match
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leak Map Reports (GUARDRAIL 2: Canonical 6-Field Interactive Accordions) */}
          {recentAudits.length > 0 && (
            <div className="space-y-4 px-1">
              <h2 className="text-sm font-medium text-zinc-200">Leak Map Reports</h2>
              <div className="space-y-3">
                {recentAudits.map((audit) => {
                  const issues = (audit.topIssues as IssuePayload[]) ?? [];
                  return (
                    <div key={audit.id} className="space-y-2">
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-1">
                        <span className="text-[10px] font-mono text-zinc-500 tracking-wider">
                          {audit.runType.toUpperCase()} FUNNEL AUDIT
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600">
                          {new Date(audit.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {issues.map((issue, i) => {
                        // Safe Fallbacks following non-blameful phrasing syntax rules
                        const severityColor = issue.severity === "high" ? "bg-rose-500" : issue.severity === "medium" ? "bg-amber-500" : "bg-zinc-600";
                        const severityText = issue.severity === "high" ? "text-rose-400 border-rose-500/10 bg-rose-500/5" : issue.severity === "medium" ? "text-amber-400 border-amber-500/10 bg-amber-500/5" : "text-zinc-500 border-zinc-800 bg-zinc-900";

                        return (
                          <details 
                            key={i} 
                            className="group border border-zinc-900 bg-zinc-950/10 rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden"
                          >
                            <summary className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-900/10 cursor-pointer select-none focus:outline-none">
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-2">
                                  <span className={`h-1 w-1 rounded-full ${severityColor}`} />
                                  <h4 className="text-xs font-medium text-zinc-300">{issue.name}</h4>
                                </div>
                                <p className="text-[10px] font-mono text-zinc-500">
                                  Current: {issue.current?.toFixed(1) || "—"} · Prior: {issue.prior?.toFixed(1) || "—"}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${severityText}`}>
                                  {issue.delta > 0 ? "+" : ""}{issue.delta?.toFixed(1)}% pp
                                </span>
                                <span className="text-[9px] font-mono text-zinc-600 transition-transform duration-200 group-open:rotate-180">
                                  ▼
                                </span>
                              </div>
                            </summary>

                            {/* The 6-Field Matrix Layout */}
                            <div className="border-t border-zinc-900/40 bg-zinc-950/40 p-4 space-y-4 text-[11px] font-sans text-zinc-400 border-dashed">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider block">1. Operational Issue</span>
                                  <p className="text-zinc-300 font-normal">Funnel variance deviation of {Math.abs(issue.delta).toFixed(1)} percentage points observed in execution data.</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider block">2. Severity Allocation</span>
                                  <p className={`font-medium uppercase tracking-wide text-[10px] ${
                                    issue.severity === "high" ? "text-rose-400" : issue.severity === "medium" ? "text-amber-400" : "text-zinc-500"
                                  }`}>{issue.severity || "Low"} Priority Priority</p>
                                </div>
                              </div>

                              <div className="space-y-0.5 pt-0.5">
                                <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider block">3. Observed Data Shift (Likely Cause)</span>
                                <p className="text-zinc-300 font-normal italic leading-relaxed">
                                  {issue.likelyCause || "Metric movement corresponds directly with upstream tracking latency and conversion sequence timeline drift."}
                                </p>
                              </div>

                              <div className="space-y-0.5 pt-0.5 border-t border-zinc-900/20">
                                <span className="text-[9px] font-mono uppercase text-zinc-400 tracking-wider block font-semibold">4. Recommended Correction</span>
                                <p className="text-zinc-200 font-normal leading-relaxed">
                                  {issue.recommendedAction || "Audit pipeline parameters on confirmation landing assets to maximize edge-node optimization rules."}
                                </p>
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2 pt-0.5 border-t border-zinc-900/20">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider block">5. Expected Bounds Impact</span>
                                  <p className="text-zinc-300 font-normal">{issue.expectedImpact || "Funnel equalization expected within 1-2 sequence cadence windows."}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider block">6. Estimated Operational Effort</span>
                                  <p className="text-zinc-300 font-mono font-normal">{issue.estimatedEffort || "1.0 - 2.0 hours"}</p>
                                </div>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}