"use client";

import Link from "next/link";
import { Plus, ArrowRight, LayoutGrid, List, Gavel } from "lucide-react";
import { HOME_COPY, WORKSPACE_PRODUCTS } from "@/lib/copy";
import type { Workspace } from "@/lib/workspace";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { useLocalViewState } from "@/lib/use-local-view-state";

const PACKAGE_NAMES = new Map(WORKSPACE_PRODUCTS.map((p) => [p.id, p.name] as const));

function relativeTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  const months = Math.floor(days / 30);
  return `${months}m ago`;
}

const AVATAR_COLORS = [
  "bg-teal-500 text-white",
  "bg-indigo-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-emerald-500 text-white",
];

function PackageBadge({ packageId }: { packageId: string }) {
  if (packageId === "counter-claim") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-500 select-none">
        <Gavel size={11} className="text-zinc-950 stroke-[2.5px] fill-white" />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500 dark:bg-teal-400 select-none">
      <LayoutGrid size={11} className="text-zinc-950 stroke-[2.5px] fill-white" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CARD VIEW COMPONENTS                                                        */
/* -------------------------------------------------------------------------- */

function WorkspaceCard({ workspace, packageIds }: { workspace: Workspace; packageIds: string[] }) {
  const hasShowtime = packageIds.includes("showtime");

  return (
    <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="h-full">
      <button
        type="submit"
        className="group flex h-full w-full flex-col justify-between rounded-2xl border border-zinc-200/90 bg-white/80 p-6 text-left transition-all duration-200 select-none hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/90 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80 backdrop-blur-xs cursor-pointer"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {packageIds.length > 0 ? (
                packageIds.map((id) => <PackageBadge key={id} packageId={id} />)
              ) : (
                <span className="font-mono text-[10px] font-medium text-zinc-400 dark:text-zinc-600">
                  Nothing installed
                </span>
              )}
            </div>

            {/* Status indicator pill */}
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {workspace.name}
            </h2>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 font-sans">
              {packageIds.length > 0
                ? packageIds.map((id) => PACKAGE_NAMES.get(id) ?? id).join(" · ")
                : "No packages installed yet"}
            </p>
          </div>

          {/* Overlapping Olympic Rings Skill Badges for Showtime */}
          {hasShowtime && (
            <div className="pt-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                Installed Skills
              </p>
              <div className="flex items-center -space-x-1.5 overflow-hidden">
                {SKILL_IDS.map((skillId) => (
                  <div
                    key={skillId}
                    title={SKILL_MANIFEST[skillId].name}
                    className="relative flex items-center justify-center rounded-full bg-white dark:bg-zinc-900 p-0.5 ring-2 ring-zinc-200/80 dark:ring-zinc-800/80 transition-transform group-hover:scale-105"
                  >
                    <SquishySkillBadge skill={skillId} size={20} enabled={true} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-6">
          <span className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all group-hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:group-hover:bg-zinc-200">
            {HOME_COPY.openLabel} {workspace.name}
          </span>
        </div>
      </button>
    </form>
  );
}

function CreateWorkspaceCard() {
  return (
    <Link
      href="/home/new"
      prefetch={false}
      className="flex h-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-zinc-300 bg-transparent p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:border-zinc-400 hover:bg-white/60 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/40 min-h-[220px]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        <Plus size={16} />
      </div>
      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Create workspace</span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* LIST VIEW ROW                                                               */
/* -------------------------------------------------------------------------- */

function WorkspaceRow({
  workspace,
  packageIds,
  index,
}: {
  workspace: Workspace;
  packageIds: string[];
  index: number;
}) {
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const initial = workspace.name.slice(0, 1).toUpperCase() || "W";
  const hasShowtime = packageIds.includes("showtime");

  return (
    <tr className="group border-b border-zinc-200/80 dark:border-zinc-800/60 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 transition-colors">
      {/* Workspace Name & Icon */}
      <td className="py-3.5 pl-4 pr-3 text-sm">
        <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="inline-block">
          <button
            type="submit"
            className="flex items-center gap-3 text-left group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors cursor-pointer"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${avatarColor} shadow-2xs`}>
              {initial}
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {workspace.name}
              </span>
              {workspace.isLegacy && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">Default workspace</span>
              )}
            </div>
          </button>
        </form>
      </td>

      {/* Installed Package & Skills (Olympic Rings Pattern) */}
      <td className="py-3.5 px-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {packageIds.length > 0
              ? packageIds.map((id) => PACKAGE_NAMES.get(id) ?? id).join(" · ")
              : "No packages"}
          </span>

          {hasShowtime && (
            <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
              {SKILL_IDS.map((skillId) => (
                <div
                  key={skillId}
                  title={SKILL_MANIFEST[skillId].name}
                  className="relative flex items-center justify-center rounded-full bg-white dark:bg-zinc-900 p-0.5 ring-2 ring-zinc-200/80 dark:ring-zinc-800/80 transition-transform group-hover:scale-105"
                >
                  <SquishySkillBadge skill={skillId} size={20} enabled={true} />
                </div>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="py-3.5 px-3 text-xs whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </td>

      {/* Created / Last Active */}
      <td className="py-3.5 px-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono whitespace-nowrap">
        {relativeTime(workspace.createdAt)}
      </td>

      {/* Switch / Enter Button */}
      <td className="py-3.5 pr-4 pl-3 text-right text-xs whitespace-nowrap">
        <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="inline-block">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer shadow-2xs"
          >
            <span>Enter</span>
            <ArrowRight size={13} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </form>
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN CLIENT CONTAINER WITH VIEW TOGGLE                                     */
/* -------------------------------------------------------------------------- */

interface WorkspaceHomeClientProps {
  workspaceList: Workspace[];
  installedByWorkspace: Record<string, string[]>;
}

export function WorkspaceHomeClient({
  workspaceList,
  installedByWorkspace,
}: WorkspaceHomeClientProps) {
  const [viewMode, setViewMode] = useLocalViewState<"card" | "list">("mcs:home:view-mode", "card");

  return (
    <main className="flex-1 py-8">
      {/* Subheader & Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 font-sans">
          <span className="font-bold text-zinc-900 dark:text-zinc-100">Workspaces</span>
          <span>|</span>
          <span>Showing all workspaces ({workspaceList.length})</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Card / List View Switcher */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300/60 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode("card")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "card"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
              title="Card View"
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
              title="List View"
            >
              <List size={13} />
              <span>List</span>
            </button>
          </div>

          {/* Add Workspace CTA */}
          <Link
            href="/home/new"
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 dark:bg-teal-500 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-teal-700 dark:hover:bg-teal-400 shadow-2xs"
          >
            <Plus size={14} />
            <span>Add workspace</span>
          </Link>
        </div>
      </div>

      {/* VIEW RENDER: CARD VIEW */}
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workspaceList.map((workspace) => (
            <WorkspaceCard
              key={workspace.workspaceId}
              workspace={workspace}
              packageIds={installedByWorkspace[workspace.workspaceId] ?? []}
            />
          ))}
          <CreateWorkspaceCard />
        </div>
      ) : (
        /* VIEW RENDER: LIST VIEW */
        <div className="rounded-2xl border border-zinc-200/90 bg-white/80 dark:border-zinc-800/90 dark:bg-zinc-900/60 overflow-hidden shadow-xs backdrop-blur-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 select-none">
                <th className="py-3 pl-4 pr-3">Workspace Name</th>
                <th className="py-3 px-3">Package & Installed Skills</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Created</th>
                <th className="py-3 pr-4 pl-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/40">
              {workspaceList.map((workspace, idx) => (
                <WorkspaceRow
                  key={workspace.workspaceId}
                  workspace={workspace}
                  packageIds={installedByWorkspace[workspace.workspaceId] ?? []}
                  index={idx}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}