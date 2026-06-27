import { db } from "@/lib/db";
import { engagements, skillRuns } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";

export const revalidate = 0;

const SKILLS = ["pin-down", "pile-on", "pre-call-read", "win-back", "leak-map"] as const;

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
      <span className="text-[9px] font-mono text-zinc-600 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
        NOT RUN
      </span>
    );
  }

  const statusMap = {
    success: "bg-emerald-500/5 text-emerald-400 border-emerald-500/10",
    failed: "bg-rose-500/5 text-rose-400 border-rose-500/10",
    running: "bg-amber-500/5 text-amber-400 border-amber-500/10 animate-pulse",
  };

  const cls =
    statusMap[skillRun.status as keyof typeof statusMap] ??
    "bg-zinc-900 text-zinc-500 border-zinc-800";

  return (
    <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded ${cls}`}>
      {skillRun.status.toUpperCase()}
    </span>
  );
}

export default async function EngagementsPage() {
  const session = await getSession();

  const userEngagements = await db
    .select()
    .from(engagements)
    .where(eq(engagements.whopUserId, session.whopUserId!));

  const targetEngagementIds = userEngagements.map((e) => e.engagementId);

  // FIXED: Optimized database lookup using inArray bounds to restrict processing overhead
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
    <div className="space-y-6 max-w-7xl mx-auto tracking-tight p-6">
      <div className="flex flex-col space-y-3 md:flex-row md:justify-between md:items-center md:space-y-0 pb-2 border-b border-zinc-900">
        <div>
          <h1 className="text-xl font-medium tracking-tighter text-zinc-100">Active Engagements</h1>
          <p className="text-[11px] font-light text-zinc-500 mt-0.5">
            One row per buyer install. Click to view skill history and run controls.
          </p>
        </div>
        <Link
          href="/dashboard/engagements/new"
          className="inline-flex items-center px-3 py-1.5 text-[10px] font-mono font-medium bg-zinc-100 text-zinc-950 rounded hover:bg-zinc-200 transition-colors"
        >
          + NEW ENGAGEMENT
        </Link>
      </div>

      {userEngagements.length === 0 ? (
        <div className="h-48 border border-dashed border-zinc-900 rounded flex flex-col items-center justify-center space-y-3">
          <p className="text-xs font-light text-zinc-600">No engagements yet. Run Pin-Down to create your first one.</p>
          <Link href="/dashboard/engagements/new" className="text-[10px] font-mono text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
            Start Pin-Down setup →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {userEngagements.map((eng) => {
            const engRuns = allRuns.filter((r) => r.engagementId === eng.engagementId);
            const stack = eng.stack;

            return (
              <Link
                key={eng.id}
                href={`/dashboard/engagements/${eng.engagementId}`}
                className="block rounded border border-zinc-900 bg-zinc-950/40 p-4 hover:border-zinc-700 hover:bg-zinc-950/60 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-200">{eng.buyer}</p>
                    <p className="text-[10px] font-mono text-zinc-600">{eng.engagementId}</p>
                    {stack && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                          {stack.booking_platform ?? "no platform"}
                        </span>
                        <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                          {stack.email_platform ?? "no email"}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-zinc-600">{new Date(eng.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {SKILLS.map((skill) => (
                    <div key={skill} className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-zinc-600">{skill}</span>
                      <SkillStatusBadge skillName={skill} runs={engRuns} />
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}