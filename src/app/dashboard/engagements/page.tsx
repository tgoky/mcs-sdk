import { db } from "@/lib/db";
import { engagements, skillRuns, type EngagementStack } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";
import Link from "next/link";
import { Zap, ArrowRight, Plus } from "lucide-react";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import {
  bookingPlatformLabel,
  emailPlatformLabel,
  SKILL_INFO,
  MODULE_STATUS_LABELS,
  type ModuleStatus,
  type SkillName,
  SKILLS,
} from "@/lib/copy";

export const revalidate = 0;

function deriveModuleStatus(
  skillKey: SkillName,
  runs: { skillName: string; status: string; completedAt: Date | null }[]
): ModuleStatus {
  const run = runs.find((r) => r.skillName === skillKey);
  if (!run) return "not_run";
  const s = run.status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  return "not_run";
}

export default async function EngagementsPage() {
  const session = await getSession();

  const userEngagements = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.whopUserId, session.whopUserId!), isNull(engagements.deletedAt)));

  const targetEngagementIds = userEngagements.map((e) => e.engagementId);

  const allRuns =
    targetEngagementIds.length > 0
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
    <div className="space-y-4 w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      {/* Asana Header Bar */}
      <div className="flex flex-col space-y-3 sm:flex-row sm:justify-between sm:items-center sm:space-y-0 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Client Portfolio
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Real-time module telemetry across all active client automations.
          </p>
        </div>

        <Link
          href="/dashboard/engagements/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-lg shadow-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>Add Client</span>
        </Link>
      </div>

      {/* Empty State */}
      {userEngagements.length === 0 ? (
        <div className="h-40 border border-dashed border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-transparent rounded-xl flex flex-col items-center justify-center space-y-2 transition-colors">
          <p className="text-xs font-normal text-zinc-400 dark:text-zinc-500 font-mono">
            No active client engagements found.
          </p>
          <Link
            href="/dashboard/engagements/new"
            className="text-xs font-semibold text-amber-500 hover:underline transition-colors"
          >
            Add your first client →
          </Link>
        </div>
      ) : (
        /* Asana Dense Table View Wrapper */
        <div className="w-full space-y-1.5">
          {/* Table Header Labels */}
          <div className="hidden md:flex items-center justify-between px-3 text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 pb-1">
            <span className="w-48">Client Name</span>
            <span className="flex-1 px-4">Connected Stack</span>
            <span className="w-44 text-center">Module Telemetry</span>
            <span className="w-24 text-right">Created</span>
          </div>

          {/* Slim Client Rows */}
          <div className="space-y-1.5">
            {userEngagements.map((eng) => {
              const engRuns = allRuns.filter((r) => r.engagementId === eng.engagementId);
              const stack = eng.stack as Record<string, string> | null;

              const bookingLabel = bookingPlatformLabel(stack?.booking_platform);
              const emailLabel = emailPlatformLabel(stack?.email_platform);
              const syncSetupNeeded = needsWebhookSetupNudge(eng.stack as EngagementStack | null);
              const smsActive = stack?.sms_platform && stack.sms_platform !== "none";

              return (
                <Link
                  key={eng.id}
                  href={`/dashboard/engagements/${eng.engagementId}`}
                  className="group flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 px-3.5 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-all shadow-2xs cursor-pointer"
                >
                  {/* Client Info */}
                  <div className="flex items-center gap-2.5 md:w-48 min-w-0 shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors truncate">
                          {eng.buyer}
                        </p>
                        {syncSetupNeeded && (
                          <span
                            title="Direct webhook needed"
                            className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-900/40 shrink-0"
                          >
                            <Zap size={9} strokeWidth={2.5} />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                        {eng.engagementId}
                      </p>
                    </div>
                  </div>

                  {/* Connected Platform Badges */}
                  <div className="flex-1 flex flex-wrap items-center gap-1.5 md:px-4 font-mono text-[10.5px]">
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                      {bookingLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                      {emailLabel}
                    </span>
                    {smsActive && (
                      <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
                        SMS
                      </span>
                    )}
                  </div>

                  {/* Squishy Modules Bar (Instant Telemetry) */}
                  <div className="flex items-center justify-start md:justify-center gap-1.5 md:w-44 shrink-0 py-0.5">
                    {SKILLS.map((skill) => {
                      const status = deriveModuleStatus(skill, engRuns);
                      const isLive = status === "live";
                      const isFailed = status === "failed";

                      return (
                        <div
                          key={skill}
                          className="relative"
                          title={`${SKILL_INFO[skill].name}: ${MODULE_STATUS_LABELS[status]}`}
                        >
                          <SquishySkillBadge
                            skill={skill}
                            size={24}
                            enabled={isLive || isFailed}
                          />
                          {isFailed && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950 animate-pulse" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Created Date & Hover Arrow */}
                  <div className="flex items-center justify-end gap-2 md:w-24 shrink-0 text-right">
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                      {new Date(eng.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <ArrowRight
                      size={13}
                      className="text-zinc-400 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}