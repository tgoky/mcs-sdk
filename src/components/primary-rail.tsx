"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  User,
  Settings,
  Home,
  Check,
  Calendar,
  Sliders,
  Plus,
  UserPlus,
  Loader2,
  Search,
  GripVertical,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Workspace } from "@/lib/workspace";
import type { UserAvatarPrefs } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { PRIMARY_NAV_SECTIONS } from "@/lib/primary-nav";
import { generateInitialsAvatarDataUri } from "@/lib/avatar";

const CLIENT_ORDER_STORAGE_KEY = "mcs-client-order";

interface PrimaryRailProps {
  displayName: string;
  userEmail: string;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  avatar: UserAvatarPrefs;
}

/**
 * A rail item's own active state. Plain prefix matching is enough now —
 * there's no more per-product `?product=` query variant of a rail item to
 * disambiguate (that machinery, and the two product badges it existed
 * for, is gone).
 */
function isRailItemActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const NAV_ICON_MAP: Record<string, string> = {
  "/dashboard/analytics": "/images/analytic.png",
  "/dashboard/library": "/images/lib.png",
};

// DiceBear's `initials` style — derives the letters and a deterministic
// background color straight from the client's name, no PixelBot (that's
// specifically the *user* avatar style, per avatar.ts's own doc — a
// client/company isn't a person). Memoized per name since createAvatar
// does real SVG work, not a free string format.
function ClientAvatar({ name, size = "w-7 h-7" }: { name: string; size?: string }) {
  const dataUri = useMemo(() => generateInitialsAvatarDataUri(name, { size: 64 }), [name]);
  return <img src={dataUri} alt="" className={`${size} rounded-lg shrink-0 object-cover`} />;
}

export function PrimaryRail({ displayName, userEmail, workspaces, activeWorkspaceId, avatar }: PrimaryRailProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [clientSwitcherOpen, setClientSwitcherOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [skillCounts, setSkillCounts] = useState<Map<string, number> | null>(null);
  const [clientOrder, setClientOrder] = useState<string[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const pathname = usePathname();
  const initials = displayName.slice(0, 2).toUpperCase();
  const topNavItems = PRIMARY_NAV_SECTIONS;
  const activeClient = workspaces.find((w) => w.workspaceId === activeWorkspaceId);

  // Custom drag order is a per-browser preference, not account data — no
  // migration, no server round trip, and it degrades to plain creation
  // order (workspaces' own default) the first time or in a fresh browser.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CLIENT_ORDER_STORAGE_KEY);
      if (stored) setClientOrder(JSON.parse(stored));
    } catch {
      // Corrupt/blocked storage — falls back to creation order below.
    }
  }, []);

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
    // Anything not in the stored order (new since last reorder) — appended
    // in its normal creation order rather than dropped.
    for (const w of workspaces) if (byId.has(w.workspaceId)) ordered.push(w);
    return ordered;
  }, [workspaces, clientOrder]);

  const filteredWorkspaces = clientSearch.trim()
    ? orderedWorkspaces.filter((w) => w.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
    : orderedWorkspaces;
  // Reordering while a search filter is active would mean "insert
  // relative to a hidden item," which has no obvious right answer — drag
  // is disabled until the search is cleared instead of guessing.
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
      // Best-effort persistence — the reorder still applies for this
      // session even if storage is blocked/full.
    }
    setDraggedId(null);
    setDragOverId(null);
  }

  // Fetched lazily the first time the switcher opens, not on every page
  // load — see the route's own doc for why this can't just be a prop.
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
        // Best-effort — the switcher still works without counts, they
        // just don't render (see the row's fallback below).
      });
    return () => {
      cancelled = true;
    };
  }, [clientSwitcherOpen, skillCounts]);

  return (
    <aside className="w-[76px] bg-background border-r border-zinc-200 dark:border-zinc-900 flex flex-col items-center justify-between py-3 px-1.5 shrink-0 select-none z-20 transition-colors duration-200">
      {/* Top Section */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {/* Client switcher — a workspace IS a client under this app's
            model (one workspace = one client, enforced at creation), so
            this is really "switch client." Previously the only way to do
            this was a generic "Workspaces" list buried inside the avatar
            popover at the bottom of the rail, indistinguishable from any
            other SaaS org-switcher and easy to never discover — this is
            the same switch mechanism (same /api/workspaces/[id]/switch
            POST), promoted to its own labeled, always-visible rail item,
            landing directly on the chosen client's profile page instead
            of Work/home (see that route's own updated redirect). */}
        <div className="relative w-full">
          <button
            type="button"
            onClick={() => setClientSwitcherOpen((p) => !p)}
            title="Switch client"
            aria-expanded={clientSwitcherOpen}
            className={
              "group relative w-full h-[58px] flex items-center justify-center p-1 rounded-xl transition-all duration-300 overflow-hidden cursor-pointer " +
              (clientSwitcherOpen
                ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs"
                : "hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
            }
          >
            {/* No label — this badge is self-explanatory (a distinct
                colored icon, unlike the plain outline icons above it),
                and full-size by default rather than only reaching this
                size on hover/active like the labeled items below. */}
            <div
              className={
                "transition-transform duration-300 ease-out " +
                (clientSwitcherOpen ? "scale-105" : "group-hover:scale-105")
              }
            >
              {/* A fixed, never-changing icon — this button represents the
                  *category* "clients" (open the switcher), not any one
                  specific client, so it deliberately does NOT show the
                  active client's own avatar (that's the separate quick-
                  link row right below this button instead). A plain
                  hand-built colored badge (not DiceBear) — solid glyph on
                  a solid rounded-square backdrop, the same macOS-app-icon
                  look as every other icon in this app, and fully
                  controllable/previewable in code instead of a seed
                  gambling on which auto-generated glyph shows up. */}
              <div className="w-8 h-8 shrink-0 rounded-md bg-amber-400 flex items-center justify-center">
                <Users className="w-[18px] h-[18px] text-[#1f1a2e]" strokeWidth={2.5} />
              </div>
            </div>
          </button>

          {clientSwitcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setClientSwitcherOpen(false)} />
              {/* surface-glass-3 — same floating-panel treatment as the
                  engagement page's "Modify" menu and the home page's
                  workspace-card "..." menu (both via ActionMenu, see
                  action-menu.tsx): near-invisible border, strong
                  backdrop-blur, soft ambient shadow, so whatever's behind
                  it visibly diffuses through instead of a flat opaque
                  panel. */}
              <div className="absolute left-full top-0 ml-2 z-50 w-72 surface-glass-3 rounded-xl text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
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
                    <span>New client</span>
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Direct link to the currently active client's profile — the
            switcher above picks *which* client, this jumps straight into
            it without opening the popover, for the common case of "I'm
            already on the right client, just take me to their page." */}
        {activeClient && (
          <Link
            href="/dashboard/engagements"
            title={activeClient.name}
            aria-current={pathname.startsWith("/dashboard/engagements") ? "page" : undefined}
            className={
              "group relative w-full h-[50px] flex items-center justify-center rounded-xl transition-all duration-300 overflow-hidden " +
              (pathname.startsWith("/dashboard/engagements")
                ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs"
                : "hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
            }
          >
            {/* Just the active client's initials avatar, sized up — no
                label underneath (the name is already on the row above in
                the dropdown, and on the title tooltip here), this is
                purely a "jump straight to my current client" glyph. */}
            <div
              className={
                "transition-transform duration-300 ease-out " +
                (pathname.startsWith("/dashboard/engagements") ? "scale-105" : "group-hover:scale-110")
              }
            >
              <ClientAvatar name={activeClient.name} size="w-9 h-9" />
            </div>
          </Link>
        )}

        <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 w-8 my-0.5" />

        <nav className="flex flex-col items-center gap-1.5 w-full">
          {topNavItems.map((section) => {
            const isActive = isRailItemActive(section.href, pathname);
            const Icon = section.icon;
            const customIconSrc = NAV_ICON_MAP[section.href.split("?")[0]];

            return (
              <Link
                key={section.href}
                href={section.href}
                title={section.title}
                aria-current={isActive ? "page" : undefined}
                className={
                  "group relative w-full h-[58px] flex flex-col items-center justify-center p-1 rounded-xl transition-all duration-300 overflow-hidden " +
                  (isActive
                    ? "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent")
                }
              >
                {/* Icon / Image - Zooms up and centers when active or hovered */}
                <div
                  className={
                    "transition-all duration-300 ease-out transform flex items-center justify-center " +
                    (isActive
                      ? "scale-[1.4] translate-y-[3px]"
                      : "scale-100 group-hover:scale-[1.4] group-hover:translate-y-[3px]")
                  }
                >
                  {customIconSrc ? (
                    <img src={customIconSrc} alt="" className="w-6 h-6 shrink-0 object-contain" />
                  ) : (
                    <Icon className="w-5 h-5 shrink-0" />
                  )}
                </div>

                {/* Title Text - Smoothly collapses and fades out on hover or active */}
                <span
                  className={
                    "text-[9.5px] font-medium leading-none text-center truncate max-w-full px-0.5 transition-all duration-300 ease-out origin-bottom " +
                    (isActive
                      ? "max-h-0 opacity-0 scale-75 mt-0 pointer-events-none"
                      : "max-h-4 opacity-100 scale-100 mt-1.5 group-hover:max-h-0 group-hover:opacity-0 group-hover:scale-75 group-hover:mt-0 group-hover:pointer-events-none")
                  }
                >
                  {section.title}
                </span>
              </Link>
            );
          })}
        </nav>

      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center gap-2 w-full relative">
        <a
          href="/home"
          title="Back to account"
          className="group relative w-full h-[58px] flex flex-col items-center justify-center p-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl transition-all duration-300 overflow-hidden"
        >
          <div className="transition-all duration-300 ease-out transform group-hover:scale-[1.35] group-hover:translate-y-[3px] flex items-center justify-center">
            <Home className="w-5 h-5 shrink-0" />
          </div>
          <span className="text-[9.5px] font-medium leading-none text-center max-h-4 opacity-100 scale-100 mt-1.5 group-hover:max-h-0 group-hover:opacity-0 group-hover:scale-75 group-hover:mt-0 group-hover:pointer-events-none transition-all duration-300 ease-out origin-bottom">
            Home
          </span>
        </a>

        {/* User Profile Avatar Trigger */}
        <button
          type="button"
          onClick={() => setPopoverOpen((prev) => !prev)}
          className="w-8 h-8 rounded-full hover:ring-2 hover:ring-[#2a233c]/30 dark:hover:ring-[#e4dff2]/30 transition-all cursor-pointer shadow-xs"
        >
          <UserAvatar
            avatar={avatar}
            identityFallback={userEmail}
            size={32}
            fallback={
              <div className="w-8 h-8 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-[11px] font-bold text-white dark:text-[#1f1a2e] font-mono flex items-center justify-center">
                {initials}
              </div>
            }
          />
        </button>

        {/* Profile Popover */}
        {popoverOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)} />

            <div className="absolute left-full bottom-0 ml-2 z-50 w-[640px] sm:w-[680px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xl rounded-2xl overflow-hidden font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
              <div className="flex min-h-[360px] divide-x divide-zinc-200/80 dark:divide-zinc-800">
                {/* LEFT PANE */}
                <div className="w-72 sm:w-80 p-4 bg-[#f8f7fa] dark:bg-black flex flex-col justify-between shrink-0">
                  <div className="space-y-3">
                    <div className="px-1">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Workspaces
                      </h3>
                      <p className="text-[11px] text-zinc-500 truncate" title={userEmail || displayName}>
                        {userEmail || displayName}
                      </p>
                    </div>

                    <div className="space-y-0.5 max-h-64 overflow-y-auto">
                      {workspaces.map((workspace) => {
                        const isActive = workspace.workspaceId === activeWorkspaceId;
                        const isSwitching = switchingWorkspaceId === workspace.workspaceId;
                        return (
                          <form
                            key={workspace.workspaceId}
                            action={`/api/workspaces/${workspace.workspaceId}/switch`}
                            method="POST"
                            onSubmit={() => setSwitchingWorkspaceId(workspace.workspaceId)}
                          >
                            <button
                              type="submit"
                              disabled={isActive || switchingWorkspaceId !== null}
                              className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-xl min-w-0 transition-colors disabled:cursor-not-allowed ${
                                isActive
                                  ? "bg-white dark:bg-zinc-900/80 shadow-xs cursor-default"
                                  : switchingWorkspaceId !== null
                                    ? "opacity-50"
                                    : "cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <div className="w-6 h-6 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-white dark:text-[#1f1a2e] font-bold text-[10px] flex items-center justify-center shrink-0 font-mono">
                                {workspace.name.slice(0, 2).toUpperCase()}
                              </div>
                              <span
                                className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate min-w-0"
                                title={workspace.name}
                              >
                                {workspace.name}
                              </span>
                              {isSwitching ? (
                                <Loader2 className="w-3.5 h-3.5 text-[#2a233c] dark:text-[#e4dff2] shrink-0 ml-auto animate-spin" />
                              ) : (
                                isActive && <Check className="w-3.5 h-3.5 text-[#2a233c] dark:text-[#e4dff2] shrink-0 ml-auto" />
                              )}
                            </button>
                          </form>
                        );
                      })}
                    </div>

                    <Link
                      href="/home/new"
                      onClick={() => setPopoverOpen(false)}
                      className="flex items-center gap-2.5 px-1 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span>New workspace</span>
                    </Link>
                  </div>

                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Theme</span>
                      <ThemeToggle />
                    </div>

                    <form action="/api/auth/logout" method="POST">
                      <button
                        type="submit"
                        className="flex items-center gap-2.5 px-1 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>

                {/* RIGHT PANE */}
                <div className="flex-1 p-4 flex flex-col justify-between bg-white dark:bg-zinc-900">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        avatar={avatar}
                        identityFallback={userEmail}
                        size={44}
                        fallback={
                          <div className="w-11 h-11 rounded-full bg-[#2a233c] dark:bg-[#e4dff2] text-white dark:text-[#1f1a2e] font-bold text-sm flex items-center justify-center shrink-0 font-mono shadow-xs">
                            {initials}
                          </div>
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {displayName}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {userEmail}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                      <span>Set out of office</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Sliders className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Admin console</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <UserPlus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Invite to Showtime</span>
                      </Link>
                    </div>

                    <button
                      type="button"
                      className="w-full mt-1 flex items-center justify-center px-3 py-2 text-xs font-semibold bg-[#f0ebf8] hover:bg-[#e3dcf3] dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-[#2a233c] dark:text-purple-200 border border-[#d6caec] dark:border-purple-800/60 rounded-xl transition-colors cursor-pointer"
                    >
                      <span>Upgrade account</span>
                    </button>

                    <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />

                    <div className="space-y-1">
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Profile</span>
                      </Link>

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Settings className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Settings</span>
                      </Link>

                      <Link
                        href="/api/auth/login"
                        onClick={() => setPopoverOpen(false)}
                        className="flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors rounded-lg"
                      >
                        <Plus className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        <span>Add another account</span>
                      </Link>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
