"use client";

// The client switcher, at the top nav's left edge (where the menu button
// was): the active client's avatar and name with an up-down mark, opening
// a list downward. A workspace is a client here (one per workspace), so this is
// "switch client". Same switch route as always (/api/workspaces/[id]/switch).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, GripVertical, Loader2, Plus, Search } from "lucide-react";
import type { Workspace } from "@/lib/workspace";
import { generateInitialsAvatarDataUri } from "@/lib/avatar";

const CLIENT_ORDER_STORAGE_KEY = "mcs-client-order";

export function ClientAvatar({ name, size = "w-7 h-7" }: { name: string; size?: string }) {
  const dataUri = useMemo(() => generateInitialsAvatarDataUri(name, { size: 64 }), [name]);
  return <img src={dataUri} alt="" className={`${size} rounded-lg shrink-0 object-cover`} />;
}

export function ClientSwitcher({ workspaces, activeWorkspaceId }: { workspaces: Workspace[]; activeWorkspaceId: string }) {
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [skillCounts, setSkillCounts] = useState<Map<string, number> | null>(null);
  const [clientOrder, setClientOrder] = useState<string[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(CLIENT_ORDER_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : null;
    } catch {
      return null;
    }
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const activeClient = workspaces.find((w) => w.workspaceId === activeWorkspaceId);

  const orderedWorkspaces = useMemo(() => {
    if (!clientOrder) return workspaces;
    const byId = new Map(workspaces.map((w) => [w.workspaceId, w]));
    const ordered: Workspace[] = [];
    for (const id of clientOrder) {
      const w = byId.get(id);
      if (w) {
        ordered.push(w);
        byId.delete(id);
      }
    }
    for (const w of workspaces) if (byId.has(w.workspaceId)) ordered.push(w);
    return ordered;
  }, [workspaces, clientOrder]);

  const filteredWorkspaces = clientSearch.trim()
    ? orderedWorkspaces.filter((w) => w.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
    : orderedWorkspaces;
  // No reordering while filtered: "drop next to a hidden row" has no right answer.
  const dragEnabled = !clientSearch.trim();

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const current = orderedWorkspaces.map((w) => w.workspaceId);
    const from = current.indexOf(draggedId);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    setClientOrder(next);
    try {
      window.localStorage.setItem(CLIENT_ORDER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Applies for this visit even if it can't be remembered.
    }
    setDraggedId(null);
    setDragOverId(null);
  }

  // Skill counts load the first time the list opens, not on every page.
  useEffect(() => {
    if (!clientSwitcherOpen || skillCounts !== null) return;
    let cancelled = false;
    fetch("/api/workspaces/summary")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const s of data.summaries ?? []) map.set(s.workspaceId, s.skillCount);
        setSkillCounts(map);
      })
      .catch(() => {
        // The list works without counts.
      });
    return () => {
      cancelled = true;
    };
  }, [clientSwitcherOpen, skillCounts]);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setClientSwitcherOpen((p) => !p)}
        aria-expanded={clientSwitcherOpen}
        aria-haspopup="menu"
        title="Switch client"
        className={`flex min-w-0 max-w-[200px] items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 text-left transition-colors cursor-pointer ${
          clientSwitcherOpen ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
        }`}
      >
        {activeClient ? <ClientAvatar name={activeClient.name} size="w-6 h-6" /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{activeClient?.name ?? "Choose a client"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      </button>

      {clientSwitcherOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setClientSwitcherOpen(false)} />
          <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 w-72 surface-glass-3 rounded-xl text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150">
            <div className="p-3 space-y-2">
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 px-0.5">Clients</p>
              {workspaces.length > 6 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    autoFocus
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                  />
                </div>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto px-1.5 pb-1.5 space-y-1">
              {filteredWorkspaces.length === 0 ? (
                <p className="text-xs text-zinc-400 text-center py-4">No clients match &quot;{clientSearch}&quot;.</p>
              ) : (
                filteredWorkspaces.map((workspace) => {
                  const isActive = workspace.workspaceId === activeWorkspaceId;
                  const isSwitching = switchingWorkspaceId === workspace.workspaceId;
                  const skillCount = skillCounts?.get(workspace.workspaceId);
                  const isDragging = draggedId === workspace.workspaceId;
                  const isDragOver =
                    dragOverId === workspace.workspaceId && draggedId !== null && draggedId !== workspace.workspaceId;
                  return (
                    <form
                      key={workspace.workspaceId}
                      action={`/api/workspaces/${workspace.workspaceId}/switch`}
                      method="POST"
                      onSubmit={() => setSwitchingWorkspaceId(workspace.workspaceId)}
                      draggable={dragEnabled}
                      onDragStart={() => setDraggedId(workspace.workspaceId)}
                      onDragOver={(e) => {
                        if (!dragEnabled || !draggedId) return;
                        e.preventDefault();
                        if (dragOverId !== workspace.workspaceId) setDragOverId(workspace.workspaceId);
                      }}
                      onDragLeave={() => setDragOverId((prev) => (prev === workspace.workspaceId ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDrop(workspace.workspaceId);
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverId(null);
                      }}
                      className={
                        "rounded-lg transition-opacity " +
                        (isDragging ? "opacity-40 " : "") +
                        (isDragOver ? "ring-1 ring-inset ring-zinc-400 dark:ring-zinc-500" : "")
                      }
                    >
                      <button
                        type="submit"
                        disabled={isActive || switchingWorkspaceId !== null}
                        className={`w-full flex items-center gap-1.5 py-2 px-2 min-w-0 rounded-lg transition-colors disabled:cursor-not-allowed ${
                          isActive
                            ? "bg-white/70 dark:bg-zinc-800/70 cursor-default"
                            : switchingWorkspaceId !== null
                            ? "opacity-50"
                            : "cursor-pointer hover:bg-white/50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        {/* 2x3 grip handle — a pure drag affordance; the
                            whole row is the actual drag source via the
                            wrapping form's draggable attribute. */}
                        <GripVertical
                          className={
                            "w-3.5 h-3.5 shrink-0 text-zinc-300 dark:text-zinc-700 " +
                            (dragEnabled ? "cursor-grab" : "opacity-0 pointer-events-none")
                          }
                        />
                        <ClientAvatar name={workspace.name} />
                        <div className="min-w-0 text-left flex-1">
                          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={workspace.name}>
                            {workspace.name}
                          </p>
                          <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                            {skillCount === undefined ? " " : `${skillCount} skill${skillCount === 1 ? "" : "s"} enabled`}
                          </p>
                        </div>
                        {isSwitching ? (
                          <Loader2 className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0 ml-auto animate-spin" />
                        ) : (
                          isActive && <Check className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-200 shrink-0 ml-auto" />
                        )}
                      </button>
                    </form>
                  );
                })
              )}
            </div>

            <div className="p-1.5 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <Link
                href="/home/new"
                onClick={() => setClientSwitcherOpen(false)}
                className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>New workspace</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
