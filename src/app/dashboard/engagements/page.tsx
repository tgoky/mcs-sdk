import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";

export const revalidate = 0;

const SKILLS = ["pin-down", "pile-on", "pre-call-read", "win-back", "leak-map"] as const;

type SkillStatus = "online" | "degraded" | "standby" | "running";

function SkillStatusBadge({
  skillName,
  runs,
}: {
  skillName: string;
  runs: { skillName: string; status: string; completedAt: Date | null }[];
}) {
  const skillRun = runs.find((r) => r.skillName === skillName);

  if (!skillRun) {
    return (
      <div className="flex items-center space-x-1 select-none opacity-40">
        <span className="text-xs font-mono text-zinc-600 uppercase tracking-tight">
          [standby]
        </span>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    success: "online",
    failed: "degraded",
    running: "running",
  };

  const statusStyles: Record<string, string> = {
    success: "text-zinc-300 font-medium",
    failed: "text-zinc-500 line-through opacity-60",
    running: "text-zinc-400 font-normal italic",
  };

  const statusValue = skillRun.status.toLowerCase();

  return (
    <div className="flex items-center space-x-1">
      <span className={`text-xs font-mono uppercase tracking-tight ${statusStyles[statusValue] || "text-zinc-400"}`}>
        [{statusLabels[statusValue] || "running"}]
      </span>
    </div>
  );
}

export default async function EngagementsPage() {
  const session = await getSession();

  const userEngagements = await db
    .select()
    .from(engagements)
    .where(eq(engagements.whopUserId, session.whopUserId!));

  const targetEngagementIds = userEngagements.map((e) => e.engagementId);

  // Optimized database lookup using bounds to restrict processing overhead
  const allRuns = targetEngagementIds.length > 0
    ? await db
        .select({
          engagementId: skillRuns.engagementId,
          skillName: skillRuns.skillName,
          status: skillRuns.status,
          completedAt: skillRuns.completedAt,
        })
        .from(skillRuns)
        .where(inArray(skillRuns.engagementId, targetEngagementIds))
        .orderBy(desc(skillRuns.startedAt))
    : [];

  return (
    <div className="space-y-5 w-full mx-auto tracking-tight antialiased select-none px-1 text-zinc-400">
      
      {/* Consolidated Master Header Panel — Fonts matched exactly to Telemetry Node */}
      <div className="flex flex-col space-y-3 lg:flex-row lg:justify-between lg:items-center lg:space-y-0 border-b border-zinc-900 pb-3">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-zinc-100 tracking-tight">
            Active Accounts
          </h1>
          <p className="text-sm font-normal text-zinc-500">
            Registered customer deployment matrices. Select an account node to access manual triggers and details.
          </p>
        </div>
        
        <div className="flex items-center space-x-1.5 self-start lg:self-auto text-sm">
          <Link
            href="/dashboard/engagements/new"
            className="inline-flex items-center px-3 py-1 font-mono text-xs border border-zinc-800 text-zinc-400 rounded hover:border-zinc-600 hover:text-zinc-100 transition-colors uppercase tracking-wider"
          >
            + Initialize Node
          </Link>
        </div>
      </div>

      {/* Empty State Vector Frame */}
      {userEngagements.length === 0 ? (
        <div className="h-36 border border-dashed border-zinc-900 rounded-lg flex flex-col items-center justify-center space-y-1.5">
          <p className="text-sm font-normal text-zinc-500">No active accounts mapped yet.</p>
          <Link 
            href="/dashboard/engagements/new" 
            className="text-xs font-mono text-zinc-400 underline underline-offset-4 hover:text-zinc-200 transition-colors"
          >
            Initialize your first Pin-Down setup →
          </Link>
        </div>
      ) : (
        /* Expanded Full-Width Node List Stack */
        <div className="space-y-3 w-full">
          {userEngagements.map((eng) => {
            const engRuns = allRuns.filter((r) => r.engagementId === eng.engagementId);
            const stack = eng.stack as any;

            // GUARDRAIL 3: Ghost-Default Posture Taxonomy Mapping for Booking Services
            const bookingLabel = 
              stack?.booking_platform === "calendly" ? "Calendly Core V2" :
              stack?.booking_platform === "cal_com" ? "Cal.com Infrastructure" :
              stack?.booking_platform === "ghl_calendar" ? "GHL Calendar Engine" :
              stack?.booking_platform === "oncehub" ? "OnceHub Portal" :
              "Core Connection Pending";

            // GUARDRAIL 3: Ghost-Default Mapping for CRM Platforms
            const emailLabel = 
              stack?.email_platform 
                ? `${stack.email_platform.charAt(0).toUpperCase()}${stack.email_platform.slice(1)} Channel` 
                : "CRM Architecture Unset";

            // GUARDRAIL 3: Ghost-Default Enforcement for Optional Multi-Channel SMS Sequences
            const smsActive = stack?.sms_platform && stack.sms_platform !== "none";
            const smsLabel = smsActive ? "Multi-Channel Sequence" : "Email-Only Funnel Pipeline";

            return (
              <Link
                key={eng.id}
                href={`/dashboard/engagements/${eng.engagementId}`}
                className="group block rounded-lg border border-zinc-900 bg-zinc-950/20 p-4 hover:border-zinc-800 hover:bg-zinc-900/5 transition-all duration-150 w-full"
              >
                {/* Meta Summary Line */}
                <div className="flex items-start justify-between border-b border-zinc-900/40 pb-2.5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">
                      {eng.buyer}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 tracking-wider">
                      SYS_ID // {eng.engagementId}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">
                    {new Date(eng.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric"
                    })}
                  </span>
                </div>

                {/* Sub-Badge Stack Layout */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2.5 gap-3 sm:gap-0">
                  {/* Platform Asset Labels */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs font-mono text-zinc-400 bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-900/60">
                      🗺️ {bookingLabel}
                    </span>
                    <span className="text-xs font-mono text-zinc-400 bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-900/60">
                      🔄 {emailLabel}
                    </span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      smsActive
                        ? "text-zinc-300 font-medium bg-zinc-900/60 border-zinc-800"
                        : "text-zinc-600 font-light bg-zinc-900/10 border-zinc-900/40"
                    }`}>
                      📱 {smsLabel}
                    </span>
                  </div>

                  {/* Engine Module Grid Status Tags */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-900/20 sm:border-t-0 pt-2.5 sm:pt-0">
                    {SKILLS.map((skill) => (
                      <div key={skill} className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-zinc-500">{skill}</span>
                        <SkillStatusBadge skillName={skill} runs={engRuns} />
                      </div>
                    ))}
                  </div>
                </div>

              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}