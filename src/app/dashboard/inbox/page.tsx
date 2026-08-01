import { db } from "@/lib/db";
import { notifications, engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";
import { InboxRow } from "./inbox-row";
import { MarkAllReadButton } from "./mark-all-read-button";
import type { NotificationType } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Inbox vs. Queue: Queue (lib/queue.ts's getQueueItems) is the actionable
 * subset — approvals, blockers, alerts that need a human decision. Inbox is
 * broader: everything notifyUser() has ever fanned out for this tenant,
 * read or not, actionable or not — run failures alongside win-back sweeps,
 * weekly digests, and conversation-intelligence highlights. Two different
 * jobs ("what needs me" vs. "what happened"), so they stay two different
 * pages instead of the same feed with a different filter.
 *
 * Every type here is one of the 7 real values in lib/notify.ts's
 * NotificationType — nothing fabricated. There's no synced-email/message
 * preview tab (yet): that would need a GHL/HubSpot Conversations API
 * integration this codebase doesn't have today, so rather than fake it,
 * it's left out until that integration exists.
 */
const TABS: Array<{ key: string; label: string; types: NotificationType[] | null }> = [
  { key: "all", label: "All", types: null },
  {
    key: "alerts",
    label: "Alerts",
    types: ["run_failed", "run_timed_out", "credential_invalid", "credential_check_error"],
  },
  { key: "win-back", label: "Win-Back", types: ["lost_deal_swept"] },
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

  // Group into day buckets, preserving the newest-first order within each.
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
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Inbox</h1>
        {unreadTotal > 0 && <MarkAllReadButton />}
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-5">
        Everything Showtime has surfaced across your clients — run issues, win-back activity, and weekly digests.
      </p>

      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-900 mb-5">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={tab.key === "all" ? "/dashboard/inbox" : `/dashboard/inbox?tab=${tab.key}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab.key === activeTab.key
                ? "border-gold text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 dark:text-zinc-600 text-sm">
          Nothing here yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-600 mb-2 px-1">
                {group.label}
              </p>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-900 overflow-hidden bg-white dark:bg-zinc-900/30">
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
