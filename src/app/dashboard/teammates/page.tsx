import { Users } from "lucide-react";
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
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          <Users size={16} />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Teammates</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ask for a Call Brief or a Leak Map run in plain language — it&apos;ll ask before it guesses which
            client you mean.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-3">
        <TeammatesWorkspace
          initialThreads={threads.map((t) => ({ id: t.id, title: t.title, lastMessageAt: t.lastMessageAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
