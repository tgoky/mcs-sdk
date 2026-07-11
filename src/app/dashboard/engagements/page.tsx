import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import {
  skillName,
  bookingPlatformLabel,
  emailPlatformLabel,
  SKILL_INFO,
  MODULE_STATUS_LABELS,
  MODULE_STATUS_COLORS,
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

function ModuleStatusPill({
  skillKey,
  runs,
}: {
  skillKey: SkillName;
  runs: { skillName: string; status: string; completedAt: Date | null }[];
}) {
  const status = deriveModuleStatus(skillKey, runs);
  const label = MODULE_STATUS_LABELS[status];
  const color = MODULE_STATUS_COLORS[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
        {SKILL_INFO[skillKey].name}
      </span>
      {/* color maps to semantic classes like text-emerald-400 or text-rose-400 */}
      <span className={`text-[11px] font-semibold font-mono ${color}`}>{label}</span>
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
    <div className="space-y-5 w-full mx-auto tracking-tight antialiased select-none px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">

      {/* Page header */}
      <div className="flex flex-col space-y-3 lg:flex-row lg:justify-between lg:items-center lg:space-y-0 border-b border-zinc-200 dark:border-zinc-900 pb-3">
        <div className="space-y-1">
          <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
            Your Clients
          </h1>
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
            Every client you've set up lives here. Click one to see what's running and trigger modules manually.
          </p>
        </div>

        <div className="flex items-center self-start lg:self-auto">
          <Link
            href="/dashboard/engagements/new"
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-mono"
          >
            + Add a New Client
          </Link>
        </div>
      </div>

      {/* Empty state view wrapper */}
      {userEngagements.length === 0 ? (
        <div className="h-40 border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-transparent rounded-lg flex flex-col items-center justify-center space-y-2 transition-colors">
          <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
            No clients set up yet.
          </p>
          <Link
            href="/dashboard/engagements/new"
            className="text-xs font-normal text-zinc-500 dark:text-zinc-400 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors font-mono"
          >
            Add your first client to get started →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {userEngagements.map((eng) => {
            const engRuns = allRuns.filter(
              (r) => r.engagementId === eng.engagementId
            );
            const stack = eng.stack as Record<string, string> | null;

            const bookingLabel = bookingPlatformLabel(stack?.booking_platform);
            const emailLabel = emailPlatformLabel(stack?.email_platform);

            const smsActive =
              stack?.sms_platform && stack.sms_platform !== "none";
            const smsLabel = smsActive
              ? "Email + SMS sequences"
              : "Email sequences only";

            return (
              <Link
                key={eng.id}
                href={`/dashboard/engagements/${eng.engagementId}`}
                className="group block rounded-lg border border-zinc-200 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-950/20 p-4 hover:border-zinc-300 dark:hover:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900/5 transition-all duration-150 w-full shadow-sm"
              >
                {/* Client name + ID + date parameters strip */}
                <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-900/40 pb-2.5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 group-hover:dark:text-zinc-100 transition-colors">
                      {eng.buyer}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                      {eng.engagementId}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                    {new Date(eng.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {/* Platform tags + module execution statuses row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2.5 gap-3 sm:gap-0">

                  {/* Connected tool tag items */}
                  <div className="flex flex-wrap gap-2 font-mono">
                    <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
                      {bookingLabel}
                    </span>
                    <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/40 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-900/60">
                      {emailLabel}
                    </span>
                    <span
                      className={`text-xs font-normal px-2 py-0.5 rounded border ${
                        smsActive
                          ? "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900/60 border-zinc-300 dark:border-zinc-800"
                          : "text-zinc-400 dark:text-zinc-600 bg-zinc-100/50 dark:bg-zinc-900/10 border-zinc-200 dark:border-zinc-900/40"
                      }`}
                    >
                      {smsLabel}
                    </span>
                  </div>

                  {/* Module health instrumentation matrix */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-200 dark:border-zinc-900/20 sm:border-t-0 pt-2.5 sm:pt-0">
                    {SKILLS.map((skill) => (
                      <ModuleStatusPill
                        key={skill}
                        skillKey={skill}
                        runs={engRuns}
                      />
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