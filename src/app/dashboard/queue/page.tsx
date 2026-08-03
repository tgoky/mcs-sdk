import { db } from "@/lib/db";
import { engagements } from "@/models/schema";
import { getSession } from "@/lib/session";
import { getQueueItems } from "@/lib/queue";
import { QueuePanel } from "../queue-panel";
import { eq, and, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QueuePage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;

  const [items, clientRows] = await Promise.all([
    getQueueItems(whopUserId),
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
    <div className="relative min-h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden pb-10">
      
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(#cbd5e1_0.5px,transparent_0.5px)] dark:bg-[radial-gradient(#3f3f46_0.5px,transparent_0.5px)] [background-size:6px_6px] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_30%,#000_50%,transparent_100%)] opacity-70" 
        aria-hidden="true"
      />

      {/* --- PAGE CONTENT --- */}
      <div className="relative z-10 space-y-5">
        <QueuePanel initialItems={items} clients={clients} title="Queue" />
      </div>
    </div>
  );
}