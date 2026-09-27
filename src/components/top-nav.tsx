"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Menu,
  Building2,
  Play,
  Settings2,
  Blocks,
  Wrench,
  ListTodo,
  PlugZap,
  MessageSquareQuote,
  Link2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs/breadcrumbs";
import { GlobalSearch } from "@/components/global-search";
import { RightUtilityRail } from "@/components/right-utility-rail";
import type { RightPanelKey } from "@/components/right-utility-panel";
import { TourLauncher } from "@/components/tours/tour-launcher";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { useToast } from "@/components/toast/toast-provider";
import { skillSettingsHref, useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";

/** What the Create menu's shortcuts act on: the active client. */
export interface CreateMenuContext {
  engagementId: string | null;
  /** Skills switched on for the client. */
  skills: { id: string; name: string; hasSettings: boolean }[];
  /** Installed products, each with its setup page's skill. */
  products: { id: string; name: string; setupSkillId: string }[];
}

interface TopNavProps {
  onToggleSidebar: () => void;
  displayName?: string;
  activePanel: RightPanelKey | null;
  onSelectPanel: (key: RightPanelKey) => void;
  unreadNotifications: number;
  createMenu?: CreateMenuContext;
}

const itemCls =
  "group flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default";
const iconCls = "w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors shrink-0";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

/**
 * The Create menu: shortcuts that do something for the active client.
 * Three of them open a short list first (which skill to run, which
 * skill's settings, which product's setup). Every item goes somewhere
 * real or calls a real route; nothing here is a placeholder.
 */
function CreateMenu({ ctx, close, onSelectPanel }: { ctx: CreateMenuContext | undefined; close: () => void; onSelectPanel: (key: RightPanelKey) => void }) {
  const router = useRouter();
  const toast = useToast();
  const pane = useSkillPane();
  const [view, setView] = useState<"main" | "run" | "settings" | "setup">("main");
  const [busy, setBusy] = useState<string | null>(null);
  const engagementId = ctx?.engagementId ?? null;
  const desktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

  async function run(skillId: string, name: string) {
    if (!engagementId) return;
    setBusy(skillId);
    try {
      const res = await fetch("/api/skill-runs/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId, skillName: skillId }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success(`${name} started.`);
        close();
        router.refresh();
      } else toast.error(body.error ?? `Couldn't start ${name}.`);
    } catch {
      toast.error(`Couldn't start ${name}.`);
    } finally {
      setBusy(null);
    }
  }

  async function shareResults() {
    if (!engagementId) return;
    setBusy("share");
    try {
      const res = await fetch(`/api/engagements/${encodeURIComponent(engagementId)}/share-link`, { method: "POST" });
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
    else router.push(skillSettingsHref(engagementId, skillId));
  }

  const back = (title: string) => (
    <button type="button" onClick={() => setView("main")} className="flex w-full items-center gap-1.5 border-b border-border px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer">
      <ChevronLeft className="w-3 h-3" /> {title}
    </button>
  );
  const skillList = (list: CreateMenuContext["skills"], onPick: (s: CreateMenuContext["skills"][number]) => void, empty: string) =>
    list.length === 0 ? (
      <p className="px-2.5 py-2 text-[11px] text-zinc-500">{empty}</p>
    ) : (
      <div className="max-h-72 overflow-y-auto py-1">
        {list.map((s) => (
          <button key={s.id} type="button" disabled={busy !== null} onClick={() => onPick(s)} className={itemCls}>
            {s.id in WORKER_REGISTRY ? <AnySkillBadge skill={s.id as WorkerId} size={16} /> : null}
            <span className="flex-1 truncate">{s.name}</span>
            {busy === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
        ))}
      </div>
    );

  if (view === "run") return <>{back("Run a skill now")}{skillList(ctx?.skills ?? [], (s) => void run(s.id, s.name), "No skills are on for this client yet.")}</>;
  if (view === "settings")
    return <>{back("Change a skill's settings")}{skillList((ctx?.skills ?? []).filter((s) => s.hasSettings), (s) => openSettings(s.id), "No switched-on skill has settings.")}</>;
  if (view === "setup")
    return (
      <>
        {back("Open a product's setup")}
        {(ctx?.products ?? []).length === 0 ? (
          <p className="px-2.5 py-2 text-[11px] text-zinc-500">No products installed yet.</p>
        ) : (
          <div className="py-1">
            {(ctx?.products ?? []).map((p) => (
              <Link key={p.id} href={`/dashboard/engagements/${engagementId}/bridges/${p.setupSkillId}`} onClick={close} className={itemCls}>
                <Wrench className={iconCls} />
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        )}
      </>
    );

  const needsClient = !engagementId;
  const sub = (label: string, icon: ReactNode, next: "run" | "settings" | "setup") => (
    <button type="button" disabled={needsClient} onClick={() => setView(next)} className={itemCls}>
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight className="w-3 h-3 text-zinc-400" />
    </button>
  );

  return (
    <div className="divide-y divide-border">
      <Section label="Client">
        <Link href="/dashboard/engagements/new" onClick={close} className={itemCls}>
          <Building2 className={iconCls} />
          <span className="truncate">New client</span>
        </Link>
        <button type="button" disabled={needsClient || busy !== null} onClick={() => void shareResults()} className={itemCls}>
          <Link2 className={iconCls} />
          <span className="flex-1 truncate">Copy a results link</span>
          {busy === "share" && <Loader2 className="w-3 h-3 animate-spin" />}
        </button>
        <Link href="/dashboard/reports" onClick={close} className={itemCls}>
          <FileText className={iconCls} />
          <span className="truncate">Open the client report</span>
        </Link>
      </Section>
      <Section label="Skills">
        {sub("Run a skill now", <Play className={iconCls} />, "run")}
        {sub("Change a skill's settings", <Settings2 className={iconCls} />, "settings")}
        <Link href="/dashboard/library" onClick={close} className={itemCls}>
          <Blocks className={iconCls} />
          <span className="truncate">Turn on a skill</span>
        </Link>
        {sub("Open a product's setup", <Wrench className={iconCls} />, "setup")}
      </Section>
      <Section label="Work">
        <Link href="/dashboard/queue" onClick={close} className={itemCls}>
          <ListTodo className={iconCls} />
          <span className="truncate">Review the queue</span>
        </Link>
        <Link href="/dashboard/settings/apps" onClick={close} className={itemCls}>
          <PlugZap className={iconCls} />
          <span className="truncate">Connect a tool</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            close();
            if (desktop()) onSelectPanel("teammates");
            else router.push("/dashboard/teammates");
          }}
          className={itemCls}
        >
          <MessageSquareQuote className={iconCls} />
          <span className="truncate">Ask a teammate</span>
        </button>
      </Section>
    </div>
  );
}

export function TopNav({ onToggleSidebar, activePanel, onSelectPanel, unreadNotifications, createMenu }: TopNavProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const closeCreate = () => setCreateOpen(false);

  return (
    <header className="relative h-12 w-full bg-background border-b border-zinc-200 dark:border-zinc-800/80 px-3 flex items-center justify-between shrink-0 select-none z-30 gap-3 transition-colors duration-200">
      {/* Left: Sidebar Toggle + Create Button */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="hidden md:flex p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
          title="Toggle Navigation"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="relative flex items-center">
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
              {/* Mobile: opens below | Desktop: opens to the right */}
              <div className="absolute left-0 top-full mt-1.5 md:left-full md:top-0 md:mt-0 md:ml-2 w-60 bg-white dark:bg-zinc-900 border border-border rounded-sm shadow-xl z-50 py-0.5 text-zinc-900 dark:text-zinc-100 font-sans antialiased animate-in fade-in zoom-in-95 duration-100">
                <CreateMenu ctx={createMenu} close={closeCreate} onSelectPanel={onSelectPanel} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle-left: Breadcrumbs + the persistent way back into a tour
          for anyone who skipped it — see tour-launcher.tsx's own header. */}
      <div className="hidden md:flex min-w-0 flex-1 max-w-[38%] items-center gap-1.5">
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
      <div className="hidden sm:flex flex-1 min-w-0 justify-center">
        <GlobalSearch triggerClassName="flex" />
      </div>

      {/* Right: the 6-icon utility rail (Calendar / Teammates / Notifications /
          Upcoming / Plan) — each opens right-utility-panel.tsx */}
      <div className="flex items-center gap-2 ml-auto shrink-0" data-tour="top-nav-utility-rail">
        <RightUtilityRail activePanel={activePanel} onSelect={onSelectPanel} unreadCount={unreadNotifications} />
      </div>
    </header>
  );
}