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

  // The negative margins cancel <main>'s own padding (shell-layout.tsx) so
  // the thread rail starts flush with the top-left of the page instead of
  // floating inset in the middle of it.
  return (
    <div className="relative -mx-4 -mt-5 -mb-28 sm:-mx-6 sm:-mt-6 md:-m-8 h-[calc(100vh-3.5rem)] w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] md:w-[calc(100%+4rem)] text-zinc-600 dark:text-zinc-400 font-sans tracking-tight antialiased select-none transition-colors duration-200 overflow-hidden">
      {/* Dot-grid texture dropped — plain solid background instead, same
          as the Apps page, which read as cleaner/more mature next to it. */}

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