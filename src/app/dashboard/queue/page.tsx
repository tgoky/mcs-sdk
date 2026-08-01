import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { QueuePanel } from "../queue-panel";
import { QUEUE_COPY as copy } from "@/lib/copy";
import { eq, and, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Full-page version of the queue panel embedded on the dashboard
 * overview. Same component, same data source (getQueueItems), same
 * polling — this page exists so the sidebar's "Queue" nav item (and its
 * badge count) has a focused destination of its own instead of always
 * bouncing back to the dashboard overview.
 */
export default async function QueuePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const [items, clientRows] = await Promise.all([
    getQueueItems(whopUserId),
    // Full client roster (not just clients with something in queue right
    // now) — the "Clients" rail lists every client so an empty queue for
    // one is visible confirmation, not an absence.
    db
      .select({ engagementId: engagements.engagementId, buyer: engagements.buyer, pausedAt: engagements.pausedAt })
      .from(engagements)
      .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.deletedAt))),
  ]);

  const clients = clientRows.map((c) => ({
    engagementId: c.engagementId,
    buyer: c.buyer,
    pausedAt: c.pausedAt ? c.pausedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-5 w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200">
      <div className="border-b border-zinc-200 dark:border-zinc-900 pb-3">
        <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 tracking-tight">
          {copy.sectionTitle}
        </h1>
        <p className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
          {copy.sectionSubtitle}
        </p>
      </div>

      <QueuePanel initialItems={items}  />
    </div>
  );
}
