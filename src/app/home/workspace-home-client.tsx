"use client";

import Link from "next/link";
import { Plus, ArrowRight, LayoutGrid, List, Gavel } from "lucide-react";
import { HOME_COPY, WORKSPACE_PRODUCTS } from "@/lib/copy";
import type { Workspace } from "@/lib/workspace";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { SKILL_IDS, SKILL_MANIFEST } from "@/lib/skill-manifest";
import { useLocalViewState } from "@/lib/use-local-view-state";
import { WorkspaceCardMenu } from "./workspace-card-menu";

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
  "bg-amber-400 text-zinc-950",
  "bg-indigo-500 text-white",
  "bg-sky-500 text-white",
  "bg-rose-500 text-white",
  "bg-emerald-500 text-white",
];

function PackageBadge({ packageId }: { packageId: string }) {
  if (packageId === "counter-claim") {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 select-none">
        <Gavel size={11} className="stroke-[2.5px]" />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 select-none">
      <LayoutGrid size={11} className="stroke-[2.5px]" />
    </div>
  );
}

function WorkspaceCard({
  workspace,
  packageIds,
  workspaceCount,
}: {
  workspace: Workspace;
  packageIds: string[];
  workspaceCount: number;
}) {
  const hasShowtime = packageIds.includes("showtime");

  return (
    <div className="group relative flex h-full w-full flex-col justify-between rounded-md border border-zinc-200/80 bg-zinc-50/50 p-6 text-left transition-all duration-200 select-none hover:-translate-y-1 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900/40 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60">
      <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="contents">
        <button
          type="submit"
          aria-label={`Open ${workspace.name}`}
          className="absolute inset-0 z-10 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
      </form>
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
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
              Active
            </span>
            <WorkspaceCardMenu workspace={workspace} canDelete={workspaceCount > 1 && !workspace.isLegacy} />
          </div>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
            {workspace.name}
          </h2>
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400 font-sans">
            {packageIds.length > 0
              ? packageIds.map((id) => PACKAGE_NAMES.get(id) ?? id).join(", ")
              : "No packages installed yet"}
          </p>
        </div>
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
                  className="relative flex items-center justify-center rounded-md bg-white dark:bg-zinc-900 p-0.5 ring-2 ring-zinc-200/80 dark:ring-zinc-800/80 transition-transform group-hover:scale-105"
                >
                  <SquishySkillBadge skill={skillId} size={20} enabled={true} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pt-6">
        <span className="inline-flex w-full items-center justify-center rounded-md bg-amber-400 px-2.5 py-1.5 text-xs font-bold text-zinc-950 transition-all group-hover:bg-amber-500">
          {HOME_COPY.openLabel} {workspace.name}
        </span>
      </div>
    </div>
  );
}

function CreateWorkspaceCard() {
  return (
    <Link
      href="/home/new"
      prefetch={false}
      className="flex h-full flex-col items-center justify-center gap-2.5 rounded-md border border-dashed border-zinc-300 dark:border-zinc-800 bg-transparent p-6 text-center transition-all duration-200 hover:-translate-y-1 hover:border-zinc-400 hover:bg-zinc-100/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/30 min-h-[220px]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        <Plus size={16} />
      </div>
      <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Create workspace</span>
    </Link>
  );
}

function WorkspaceRow({
  workspace,
  packageIds,
  index,
  workspaceCount,
}: {
  workspace: Workspace;
  packageIds: string[];
  index: number;
  workspaceCount: number;
}) {
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const initial = workspace.name.slice(0, 1).toUpperCase() || "W";
  const hasShowtime = packageIds.includes("showtime");

  return (
    <tr className="group border-b border-zinc-200/80 dark:border-zinc-800/60 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 transition-colors">
      <td className="py-3.5 pl-4 pr-3 text-sm">
        <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="inline-block">
          <button
            type="submit"
            className="flex items-center gap-3 text-left group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors cursor-pointer"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold ${avatarColor} shadow-2xs`}>
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
      <td className="py-3.5 px-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {packageIds.length > 0
              ? packageIds.map((id) => PACKAGE_NAMES.get(id) ?? id).join(", ")
              : "No packages"}
          </span>
          {hasShowtime && (
            <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
              {SKILL_IDS.map((skillId) => (
                <div
                  key={skillId}
                  title={SKILL_MANIFEST[skillId].name}
                  className="relative flex items-center justify-center rounded-md bg-white dark:bg-zinc-900 p-0.5 ring-2 ring-zinc-200/80 dark:ring-zinc-800/80 transition-transform group-hover:scale-105"
                >
                  <SquishySkillBadge skill={skillId} size={20} enabled={true} />
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="py-3.5 px-3 text-xs whitespace-nowrap">
        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 font-mono">
          Active
        </span>
      </td>
      <td className="py-3.5 px-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono whitespace-nowrap">
        {relativeTime(workspace.createdAt)}
      </td>
      <td className="py-3.5 pr-4 pl-3 text-right text-xs whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <WorkspaceCardMenu workspace={workspace} canDelete={workspaceCount > 1 && !workspace.isLegacy} />
          <form action={`/api/workspaces/${workspace.workspaceId}/switch`} method="POST" className="inline-block">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 hover:bg-amber-500 text-zinc-950 px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <span>Enter</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

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
    <main className="flex-1 py-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 font-sans">
          <span className="font-bold text-zinc-900 dark:text-zinc-100">Workspaces</span>
          <span>|</span>
          <span>Showing all workspaces ({workspaceList.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center p-0.5 rounded-md bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-300/60 dark:border-zinc-800">
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
          <Link
            href="/home/new"
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-400 hover:bg-amber-500 text-zinc-950 px-3 py-1.5 text-xs font-bold transition-all shadow-2xs"
          >
            <Plus size={14} />
            <span>Add workspace</span>
          </Link>
        </div>
      </div>
      {viewMode === "card" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {workspaceList.map((workspace) => (
            <WorkspaceCard
              key={workspace.workspaceId}
              workspace={workspace}
              packageIds={installedByWorkspace[workspace.workspaceId] ?? []}
              workspaceCount={workspaceList.length}
            />
          ))}
          <CreateWorkspaceCard />
        </div>
      ) : (
        <div className="rounded-md border border-zinc-200/90 bg-white/80 dark:border-zinc-800/90 dark:bg-zinc-900/60 overflow-hidden shadow-xs backdrop-blur-xs">
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
                  workspaceCount={workspaceList.length}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}