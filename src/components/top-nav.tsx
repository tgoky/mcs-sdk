"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  Play,
  Settings2,
  Wrench,
  Megaphone,
  MessageSquareQuote,
  Link2,
  ChevronRight,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  UserCheck,
  ListPlus,
  FileEdit,
  Loader2,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { ClientSwitcher } from "@/components/client-switcher";
import type { Workspace } from "@/lib/workspace";
import { GlobalSearch } from "@/components/global-search";
import { RightUtilityRail } from "@/components/right-utility-rail";
import type { RightPanelKey } from "@/components/right-utility-panel";
import { TourLauncher } from "@/components/tours/tour-launcher";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { useToast } from "@/components/toast/toast-provider";
import { hereForBack, skillSettingsHref, useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import { Modal } from "@/components/modal";
import { ClientDetailsForm } from "@/app/dashboard/engagements/[id]/client-details-form";

/** What the Create menu's shortcuts act on: the active client. */
export interface CreateMenuContext {
  engagementId: string | null;
  /** Skills switched on for the client. */
  skills: { id: string; name: string; hasSettings: boolean }[];
  /** Installed products, each with its setup page's skill. */
  products: { id: string; name: string; setupSkillId: string }[];
  /** Whether everything for the client is paused. */
  paused?: boolean;
  /** Whether the client has Reputation Manager set up, so "Grow your reputation" has something to work from. */
  canGrowReputation?: boolean;
}

interface TopNavProps {
  onToggleSidebar: () => void;
  /** Whether the Work sidebar is showing (the toggle's icon follows it). */
  sidebarOpen?: boolean;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  displayName?: string;
  activePanel: RightPanelKey | null;
  onSelectPanel: (key: RightPanelKey) => void;
  unreadNotifications: number;
  createMenu?: CreateMenuContext;
}

const itemCls =
  "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default";
const iconCls = "w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0";
const panelCls =
  "w-64 rounded-xl surface-frost p-1.5 text-zinc-900 dark:text-zinc-100 font-sans antialiased motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-100";

type SubKey = "run" | "settings" | "setup";

/**
 * The Create menu: shortcuts for the active client, the ones that take
 * several clicks to reach otherwise. Anything already one click away in
 * the sidebar (reports, the queue, the library) isn't repeated here.
 * Three items open a list beside the menu, Windows-style: it opens next
 * to the item and stays open until you point at another item. Every item
 * goes somewhere real or calls a real route.
 */
function CreateMenu({
  ctx,
  close,
  onSelectPanel,
  onEditDetails,
}: {
  ctx: CreateMenuContext | undefined;
  close: () => void;
  onSelectPanel: (key: RightPanelKey) => void;
  onEditDetails: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const pane = useSkillPane();
  const [sub, setSub] = useState<{ key: SubKey; top: number; side: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const engagementId = ctx?.engagementId ?? null;
  const enc = engagementId ? encodeURIComponent(engagementId) : "";
  const desktop = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(min-width: 768px)").matches);
  const skills = ctx?.skills ?? [];
  const products = ctx?.products ?? [];
  // Product shortcuts follow what's switched on for this client (the same
  // rule as the sidebar's Enabled Skills), not what the workspace installed.
  const skillOn = (id: string) => skills.some((s) => s.id === id);

  async function call(key: string, url: string, init: RequestInit, ok: string, fail: string) {
    setBusy(key);
    try {
      const res = await fetch(url, init);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return toast.error(body.error ?? fail);
      toast.success(ok);
      close();
      router.refresh();
    } catch {
      toast.error(fail);
    } finally {
      setBusy(null);
    }
  }

  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function shareResults() {
    if (!engagementId) return;
    setBusy("share");
    try {
      const res = await fetch(`/api/engagements/${enc}/share-link`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Couldn't make the link.");
        return;
      }
      await navigator.clipboard?.writeText(body.url).catch(() => undefined);
      toast.success("Results link copied. Any older link stops working.");
      close();
    } finally {
      setBusy(null);
    }
  }

  function openSettings(skillId: string) {
    if (!engagementId) return;
    close();
    if (pane && desktop()) pane.open({ engagementId, skillId });
    else router.push(skillSettingsHref(engagementId, skillId, hereForBack()));
  }

  const needsClient = !engagementId;

  // Opens beside the page like Teammates; on a phone it's the page.
  function openGrowReputation() {
    if (!engagementId) return;
    close();
    if (pane && desktop()) pane.open({ engagementId, skillId: "grow-reputation", panel: "grow" });
    else router.push(`/dashboard/engagements/${enc}/offensive`);
  }

  const subItems = (key: SubKey): ReactNode => {
    const empty = (text: string) => <p className="px-2.5 py-2 text-[12px] text-zinc-500">{text}</p>;
    const skillRow = (sk: CreateMenuContext["skills"][number], onPick: () => void) => (
      <button key={sk.id} type="button" role="menuitem" disabled={busy !== null} onClick={onPick} className={itemCls}>
        {sk.id in WORKER_REGISTRY ? <AnySkillBadge skill={sk.id as WorkerId} size={18} /> : null}
        <span className="flex-1 truncate">{sk.name}</span>
        {busy === sk.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      </button>
    );
    if (key === "run")
      return skills.length === 0
        ? empty("No skills are on for this client yet.")
        : skills.map((sk) => skillRow(sk, () => void call(sk.id, "/api/skill-runs/trigger", json({ engagementId, skillName: sk.id }), `${sk.name} started.`, `Couldn't start ${sk.name}.`)));
    if (key === "settings") {
      const list = skills.filter((sk) => sk.hasSettings);
      return list.length === 0 ? empty("No switched-on skill has settings.") : list.map((sk) => skillRow(sk, () => openSettings(sk.id)));
    }
    return products.length === 0
      ? empty("No products installed yet.")
      : products.map((p) => (
          <Link key={p.id} role="menuitem" href={`/dashboard/engagements/${enc}/bridges/${p.setupSkillId}`} onClick={close} className={itemCls}>
            <Wrench className={iconCls} />
            <span className="truncate">{p.name}</span>
          </Link>
        ));
  };

  // Pointing at an item that opens a list opens it beside the menu; any
  // other item closes it. On phones the list opens under the item instead.
  const cascade = (label: string, icon: ReactNode, key: SubKey) => (
    <div key={key}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={sub?.key === key}
        disabled={needsClient}
        onMouseEnter={(e) => desktop() && setSub({ key, top: e.currentTarget.offsetTop, side: true })}
        onClick={(e) => setSub(sub?.key === key && !sub.side ? null : { key, top: e.currentTarget.offsetTop, side: desktop() })}
        className={`${itemCls} ${sub?.key === key ? "bg-zinc-900/[0.06] dark:bg-white/[0.08]" : ""}`}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
      </button>
      {sub?.key === key && !sub.side && <div className="ml-4 border-l border-border pl-1">{subItems(key)}</div>}
    </div>
  );
  const leaf = { onMouseEnter: () => setSub(null) };

  return (
    <div className="relative">
      <div role="menu" className={panelCls}>
        <Link href="/home/new" onClick={close} className={itemCls} {...leaf}>
          <Building2 className={iconCls} />
          <span className="truncate">New workspace</span>
        </Link>
        <div className="my-1 border-t border-zinc-900/[0.07] dark:border-white/10" />
        {cascade("Run a skill now", <Play className={iconCls} />, "run")}
        {cascade("Change a skill's settings", <Settings2 className={iconCls} />, "settings")}
        {cascade("Open a product's setup", <Wrench className={iconCls} />, "setup")}
        {ctx?.canGrowReputation && (
          <button type="button" role="menuitem" disabled={needsClient} onClick={openGrowReputation} className={itemCls} {...leaf}>
            <Megaphone className={iconCls} />
            <span className="truncate">Grow your reputation</span>
          </button>
        )}
        <div className="my-1 border-t border-zinc-900/[0.07] dark:border-white/10" />
        <button
          type="button"
          role="menuitem"
          disabled={needsClient}
          onClick={() => {
            close();
            onEditDetails();
          }}
          className={itemCls}
          {...leaf}
        >
          <FileEdit className={iconCls} />
          <span className="truncate">Edit client details</span>
        </button>
        <button type="button" role="menuitem" disabled={needsClient || busy !== null} onClick={() => void shareResults()} className={itemCls} {...leaf}>
          <Link2 className={iconCls} />
          <span className="flex-1 truncate">Copy a results link</span>
          {busy === "share" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={needsClient || busy !== null}
          onClick={() =>
            void call(
              "pause",
              `/api/engagements/${enc}/pause`,
              ctx?.paused ? { method: "DELETE" } : json({ reason: null }),
              ctx?.paused ? "Resumed. Every product picks up where it stopped." : "Paused. Nothing runs for this client until you resume.",
              ctx?.paused ? "Couldn't resume." : "Couldn't pause."
            )
          }
          className={itemCls}
          {...leaf}
        >
          {ctx?.paused ? <PlayCircle className={iconCls} /> : <PauseCircle className={iconCls} />}
          <span className="flex-1 truncate">{ctx?.paused ? "Resume this client" : "Pause this client"}</span>
          {busy === "pause" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </button>
        {skillOn("pin-down") && (
          <button
            type="button"
            role="menuitem"
            disabled={needsClient || busy !== null}
            onClick={() => void call("rebuild", `/api/engagements/${enc}/pin-down/run-piece`, json({ piece: "confirmation_page" }), "Rebuilding the confirmation page.", "Couldn't rebuild the page.")}
            className={itemCls}
            {...leaf}
          >
            <RefreshCw className={iconCls} />
            <span className="flex-1 truncate">Rebuild the confirmation page</span>
            {busy === "rebuild" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          </button>
        )}
        {skillOn("daily-send") && (
          <Link href={`/dashboard/engagements/${enc}/bridges/daily-send`} onClick={close} className={itemCls} {...leaf}>
            <UserCheck className={iconCls} />
            <span className="truncate">Approve held Cold Open leads</span>
          </Link>
        )}
        {skillOn("source-connect") && (
          <button type="button" role="menuitem" disabled={needsClient} onClick={() => openSettings("source-connect")} className={itemCls} {...leaf}>
            <ListPlus className={iconCls} />
            <span className="truncate">Add a lead list</span>
          </button>
        )}
        <div className="my-1 border-t border-zinc-900/[0.07] dark:border-white/10" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            close();
            if (desktop()) onSelectPanel("teammates");
            else router.push("/dashboard/teammates");
          }}
          className={itemCls}
          {...leaf}
        >
          <MessageSquareQuote className={iconCls} />
          <span className="truncate">Ask a teammate</span>
        </button>
      </div>
      {sub?.side && (
        <div role="menu" aria-label="More" className={`absolute left-full ml-1 max-h-[60vh] overflow-y-auto ${panelCls}`} style={{ top: Math.max(0, sub.top - 6) }}>
          {subItems(sub.key)}
        </div>
      )}
    </div>
  );
}

export function TopNav({ onToggleSidebar, sidebarOpen = true, workspaces, activeWorkspaceId, activePanel, onSelectPanel, unreadNotifications, createMenu }: TopNavProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const closeCreate = () => setCreateOpen(false);

  return (
    <header className="relative h-12 w-full bg-background border-b border-zinc-200 dark:border-zinc-800/80 px-3 flex items-center justify-between shrink-0 select-none z-30 gap-2 sm:gap-3 transition-colors duration-200">
      {/* Left: Client switcher + Create button */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* The client switcher sits where the menu button was. */}
        {workspaces && activeWorkspaceId ? <ClientSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} /> : null}

        <div className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setCreateOpen((prev) => !prev)}
            data-tour="top-nav-create"
            aria-expanded={createOpen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-950 rounded-full transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create</span>
          </button>

          {createOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeCreate} />
              {/* Mobile: centered below the header | Desktop: opens to the right */}
              <div className="fixed left-1/2 top-[3.25rem] z-50 -translate-x-1/2 md:absolute md:left-full md:top-0 md:mt-0 md:ml-2 md:translate-x-0">
                <CreateMenu ctx={createMenu} close={closeCreate} onSelectPanel={onSelectPanel} onEditDetails={() => setEditingDetails(true)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle-left: the sidebar's collapse toggle, the breadcrumbs, and
          the way back into a tour for anyone who skipped it. */}
      <div className="hidden md:flex min-w-0 flex-1 max-w-[38%] items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-pressed={!sidebarOpen}
          className="flex shrink-0 p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <Breadcrumbs />
        <TourLauncher />
      </div>

      {/* Search — a normal flex sibling between breadcrumbs and the
          utility rail, not `absolute left-1/2` true-page-center like it
          used to be. That positioning was blind to how much room the
          breadcrumb trail actually needed: on a real MacBook-width
          screen with a long trail (client name + Skills + a worker), its
          right edge routinely passed the page's literal center point
          and sat directly under the search box's fixed w-72/w-96 width.
          As a normal flex-1 sibling it only ever gets whatever space is
          left after breadcrumbs and the rail take theirs, so overlap
          isn't possible regardless of viewport width or trail length —
          min-w-0 lets it shrink instead of forcing overflow, and
          GlobalSearch's own width is now a max, not a fixed size. Only
          the trigger button is hidden below the sm breakpoint (the
          mobile nav pill's "Find" button opens the same palette instead
          — see global-search.tsx's open-global-search listener) — the
          palette itself must NOT be nested inside any hidden ancestor,
          or it silently fails to render on mobile even when open. */}
      <div className="contents sm:flex flex-1 min-w-0 justify-center">
        <GlobalSearch triggerClassName="hidden sm:flex" />
      </div>

      {/* Right: the 6-icon utility rail (Calendar / Teammates / Notifications /
          Upcoming / Plan) — each opens right-utility-panel.tsx */}
      <div className="flex items-center gap-2 ml-auto shrink-0" data-tour="top-nav-utility-rail">
        <RightUtilityRail activePanel={activePanel} onSelect={onSelectPanel} unreadCount={unreadNotifications} />
      </div>
      {editingDetails && createMenu?.engagementId && (
        <Modal title="Client details" icon={FileEdit} onClose={() => setEditingDetails(false)}>
          <ClientDetailsForm engagementId={createMenu.engagementId} onClose={() => setEditingDetails(false)} />
        </Modal>
      )}
    </header>
  );
}