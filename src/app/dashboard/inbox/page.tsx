import { db } from "@/lib/db";
import { notifications, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { InboxRow } from "./inbox-row";
import { MarkAllReadButton } from "./mark-all-read-button";
import type { NotificationType } from "@/lib/notify";
import { skillName } from "@/lib/copy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABS: Array<{ key: string; label: string; types: NotificationType[] | null }> = [
  { key: "all", label: "All", types: null },
  {
    key: "alerts",
    label: "Alerts",
    types: ["run_failed", "run_timed_out", "credential_invalid", "credential_check_error", "reputation_crisis_declared"],
  },
  { key: "win-back", label: skillName("win-back"), types: ["lost_deal_swept"] },
  { key: "insights", label: "Insights", types: ["weekly_metrics", "conversation_intelligence_objection_found"] },
];

function dayBucket(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDays > 300 ? "numeric" : undefined });
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const { tab: tabParam } = await searchParams;
  const activeTab = TABS.find((t) => t.key === tabParam) ?? TABS[0];

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      severity: notifications.severity,
      title: notifications.title,
      body: notifications.body,
      read: notifications.read,
      runId: notifications.runId,
      engagementId: notifications.engagementId,
      createdAt: notifications.createdAt,
      buyer: engagements.buyer,
    })
    .from(notifications)
    .leftJoin(engagements, eq(notifications.engagementId, engagements.engagementId))
    .where(eq(notifications.whopUserId, whopUserId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const filtered = activeTab.types
    ? rows.filter((r) => activeTab.types!.includes(r.type as NotificationType))
    : rows;

  const unreadTotal = rows.filter((r) => !r.read).length;

  const groups: Array<{ label: string; items: typeof filtered }> = [];
  for (const row of filtered) {
    const label = dayBucket(row.createdAt.toString());
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push(row);
    } else {
      groups.push({ label, items: [row] });
    }
  }

  return (
    <div className="w-full h-full min-h-screen pb-12 font-sans antialiased text-zinc-900 dark:text-zinc-100">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Inbox</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Everything Showtime has surfaced across your clients — run issues, win-back activity, and weekly digests.
          </p>
        </div>
        {unreadTotal > 0 && <MarkAllReadButton />}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800/80 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={tab.key === "all" ? "/dashboard/inbox" : `/dashboard/inbox?tab=${tab.key}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab.key === activeTab.key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 font-semibold"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Grouped Line-Divided Feed */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 dark:text-zinc-600 text-sm">
          Nothing in your inbox right now.
        </div>
      ) : (
        <div className="w-full space-y-8">
          {groups.map((group) => (
            <div key={group.label} className="w-full space-y-1">
              {/* Date Header */}
              <div className="py-2 border-b border-zinc-200 dark:border-zinc-800/80">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>

              {/* Line Items */}
              <div className="w-full">
                {group.items.map((item) => (
                  <InboxRow
                    key={item.id}
                    id={item.id}
                    type={item.type}
                    severity={item.severity as "info" | "warning" | "critical"}
                    title={item.title}
                    body={item.body}
                    read={item.read}
                    runId={item.runId}
                    engagementId={item.engagementId}
                    buyer={item.buyer}
                    createdAt={item.createdAt.toString()}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}