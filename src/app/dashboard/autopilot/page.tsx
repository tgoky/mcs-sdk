import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { getAutopilotClients } from "@/lib/autopilot-clients";
import { Bot } from "lucide-react";
import { AutopilotTable } from "./autopilot-table";

export const revalidate = 0;

export default async function AutopilotPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const activeWorkspace = await getActiveWorkspace(whopUserId);
  const clients = await getAutopilotClients(whopUserId, activeWorkspace.workspaceId);

  return (
    <div className="flex flex-col h-full w-full mx-auto tracking-tight antialiased font-sans px-1 text-zinc-600 dark:text-zinc-400 transition-colors duration-200">
      <div className="shrink-0 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{ background: "var(--accent-dim)", color: "var(--text-secondary)" }}
        >
          <Bot size={16} />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Autopilot</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pause or resume a client, set Co-Pilot vs. Autopilot, and control exactly which skills may act for
            each client — one access-control view for all of {activeWorkspace.name} instead of opening every
            engagement individually.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {clients.length === 0 ? (
          <div className="text-center py-16 text-xs font-mono font-medium text-zinc-400 dark:text-zinc-600">
            No clients yet — add one from Engagements to see it here.
          </div>
        ) : (
          <AutopilotTable clients={clients} />
        )}
      </div>
    </div>
  );
}
