import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listThreadsForWorkspace } from "@/lib/chat-threads";
import { TeammatesWorkspace } from "./teammates-workspace";

export const revalidate = 0;

export default async function TeammatesPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const threads = await listThreadsForWorkspace(activeWorkspace.workspaceId).catch((err) => {
    console.error("[TeammatesPage] thread list query failed:", err);
    return [];
  });

  return (
    <div className="relative h-screen w-full text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none px-1 transition-colors duration-200 overflow-hidden">
      {/* --- HYPER-MICRO TIGHT DOT GRID (0.5px / 6px grid) --- */}
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-dot-grid"
        aria-hidden="true"
      />

      {/* --- CONTENT CONTAINER --- */}
      <div className="relative z-10 h-full w-full">
        <TeammatesWorkspace
          initialThreads={threads.map((t) => ({
            id: t.id,
            title: t.title,
            lastMessageAt: t.lastMessageAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}