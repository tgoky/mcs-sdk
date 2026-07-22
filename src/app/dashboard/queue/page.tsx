import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { QueuePanel } from "../queue-panel";
import { QUEUE_COPY as copy } from "@/lib/copy";

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

  const items = await getQueueItems(whopUserId);

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

      <QueuePanel initialItems={items} />
    </div>
  );
}
