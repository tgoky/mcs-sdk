"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { List, MoreHorizontal, Pencil, Palette, Check, X, Loader2, Zap, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ENGAGEMENT_TAG_COLORS, tagColorHex } from "@/lib/engagement-tag-colors";
import { cn } from "@/lib/utils";
import { needsWebhookSetupNudge } from "@/lib/booking-sync-status";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import {
  bookingPlatformLabel,
  emailPlatformLabel,
  SKILL_INFO,
  MODULE_STATUS_LABELS,
  type ModuleStatus,
  type SkillName,
  SKILLS,
} from "@/lib/copy";
import type { EngagementStack } from "@/models/schema";

export interface RosterEngagement {
  engagementId: string;
  buyer: string;
  tagColor: string | null;
  stack: EngagementStack | null;
  createdAt: string | Date;
}

export interface RosterRun {
  engagementId: string;
  skillName: string;
  status: string;
  completedAt: Date | null;
}

const MENU_CARD =
  "bg-white dark:bg-zinc-900 border border-border rounded-sm shadow-xl text-zinc-900 dark:text-zinc-100 font-sans antialiased";
const MENU_ITEM =
  "group/item flex items-center gap-2.5 px-2.5 py-1.5 rounded-none text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white focus:bg-zinc-100 dark:focus:bg-zinc-800 data-open:bg-zinc-100 dark:data-open:bg-zinc-800 cursor-pointer outline-none";
const MENU_ICON =
  "w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors shrink-0";

function deriveModuleStatus(
  skillKey: SkillName,
  runs: { skillName: string; status: string; completedAt: Date | null }[]
): ModuleStatus {
  const run = runs.find((r) => r.skillName === skillKey);
  if (!run) return "not_run";
  const s = run.status.toLowerCase();
  if (s === "success") return "live";
  if (s === "failed") return "failed";
  return "not_run";
}

/**
 * Same rename/tag-color squircle interaction as the sidebar's
 * ClientSidebarList (src/app/dashboard/client-sidebar-list.tsx) — this was
 * the "nice" version living only in a place most people don't look, while
 * the client's actual home page (here) rendered a plainer row with no way
 * to rename or recolor at all. Ported rather than shared verbatim because
 * the sidebar's version is styled for a dark rail (bg-zinc-800 hovers,
 * text-zinc-300) and this page is a light card list — same behavior,
 * recolored chrome, plus the platform/telemetry/date columns the sidebar
 * row never had to carry.
 */
export function ClientRosterTable({
  engagements,
  runs,
}: {
  engagements: RosterEngagement[];
  runs: RosterRun[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RosterEngagement[]>(() => [...engagements]);
  // Server re-fetches on every router.refresh() (a rename or recolor both
  // trigger one) and hands down a fresh `engagements` array — resync so the
  // server's version wins once it lands. Adjusted during render (React's
  // documented "adjusting state when a prop changes" pattern) rather than
  // in an effect, so a new array doesn't cause an extra commit-then-
  // recommit render pass.
  const [prevEngagements, setPrevEngagements] = useState(engagements);
  if (engagements !== prevEngagements) {
    setPrevEngagements(engagements);
    setRows([...engagements]);
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorRowId, setErrorRowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing(row: RosterEngagement) {
    setOpenMenuId(null);
    setErrorRowId(null);
    setEditValue(row.buyer);
    setEditingId(row.engagementId);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelEditing() {
    setEditingId(null);
    setErrorRowId(null);
  }

  async function commitEdit(row: RosterEngagement) {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === row.buyer) {
      cancelEditing();
      return;
    }
    setBusyId(row.engagementId);
    setErrorRowId(null);
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.engagementId === row.engagementId ? { ...r, buyer: trimmed } : r)));
        setEditingId(null);
        router.refresh();
      } else {
        setErrorRowId(row.engagementId);
        setErrorMessage(data.error ?? "Failed to rename client.");
      }
    } catch (e) {
      setErrorRowId(row.engagementId);
      setErrorMessage(e instanceof Error ? e.message : "Failed to rename client.");
    } finally {
      setBusyId(null);
    }
  }

  async function applyTagColor(row: RosterEngagement, colorId: string) {
    setOpenMenuId(null);
    const previous = row.tagColor;
    setRows((prev) => prev.map((r) => (r.engagementId === row.engagementId ? { ...r, tagColor: colorId } : r)));
    try {
      const res = await fetch(`/api/engagements/${row.engagementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagColor: colorId }),
      });
      if (!res.ok) {
        setRows((prev) => prev.map((r) => (r.engagementId === row.engagementId ? { ...r, tagColor: previous } : r)));
        setErrorRowId(row.engagementId);
        setErrorMessage("Couldn't save that color.");
      } else {
        router.refresh();
      }
    } catch {
      setRows((prev) => prev.map((r) => (r.engagementId === row.engagementId ? { ...r, tagColor: previous } : r)));
      setErrorRowId(row.engagementId);
      setErrorMessage("Couldn't save that color.");
    }
  }

  return (
    <div className="space-y-1.5">
      {rows.map((eng) => {
        const engRuns = runs.filter((r) => r.engagementId === eng.engagementId);
        const stack = eng.stack as Record<string, string> | null;
        const bookingLabel = bookingPlatformLabel(stack?.booking_platform);
        const emailLabel = emailPlatformLabel(stack?.email_platform);
        const syncSetupNeeded = needsWebhookSetupNudge(eng.stack);
        const smsActive = stack?.sms_platform && stack.sms_platform !== "none";
        const isEditing = editingId === eng.engagementId;
        const isBusy = busyId === eng.engagementId;

        return (
          <div key={eng.engagementId} className="flex flex-col">
            <div
              className={cn(
                "group/row flex flex-col md:flex-row md:items-center justify-between gap-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 px-3.5 py-2.5 transition-all shadow-2xs",
                !isEditing && "hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
              )}
            >
              {/* Client Info — squircle recolors from the tag-color submenu, name is inline-editable */}
              <div className="flex items-center gap-2.5 md:w-52 min-w-0 shrink-0">
                <div
                  className="w-7 h-7 rounded-[8px] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs"
                  style={{ backgroundColor: tagColorHex(eng.tagColor) }}
                >
                  <List className="w-4 h-4 stroke-[2.5]" />
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit(eng);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEditing();
                        }
                      }}
                      disabled={isBusy}
                      maxLength={200}
                      className="flex-1 min-w-0 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-bold rounded-md px-2 py-1 outline-none ring-1 ring-zinc-300 dark:ring-zinc-600 focus:ring-zinc-500 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => commitEdit(eng)}
                      disabled={isBusy}
                      title="Save"
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={isBusy}
                      title="Cancel"
                      className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1 flex items-center gap-1">
                    <Link href={`/dashboard/engagements/${eng.engagementId}`} className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover/row:text-amber-500 dark:group-hover/row:text-amber-400 transition-colors truncate">
                          {eng.buyer}
                        </p>
                        {syncSetupNeeded && (
                          <span
                            title="Direct webhook needed"
                            className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-900/40 shrink-0"
                          >
                            <Zap size={9} strokeWidth={2.5} />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
                        {eng.engagementId}
                      </p>
                    </Link>

                    <DropdownMenu
                      open={openMenuId === eng.engagementId}
                      onOpenChange={(open) => setOpenMenuId(open ? eng.engagementId : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          title="More options"
                          className={cn(
                            "shrink-0 p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700/60 transition-colors cursor-pointer",
                            "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-zinc-200 dark:data-[state=open]:bg-zinc-700/60 data-[state=open]:text-zinc-900 dark:data-[state=open]:text-white"
                          )}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className={cn(MENU_CARD, "w-44 p-0 py-1")}>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            startEditing(eng);
                          }}
                          className={MENU_ITEM}
                        >
                          <Pencil className={MENU_ICON} />
                          <span className="truncate">Edit client name</span>
                        </DropdownMenuItem>

                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className={MENU_ITEM}>
                            <Palette className={MENU_ICON} />
                            <span className="truncate">Add tag color</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent sideOffset={8} className={cn(MENU_CARD, "p-2.5")}>
                            <div className="flex items-center gap-2">
                              {ENGAGEMENT_TAG_COLORS.map((c) => {
                                const selected = eng.tagColor ? eng.tagColor === c.id : c.id === "teal";
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    title={c.label}
                                    onClick={() => applyTagColor(eng, c.id)}
                                    className="relative w-5 h-5 rounded-full ring-1 ring-inset ring-black/10 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                                    style={{ backgroundColor: c.hex }}
                                  >
                                    {selected && (
                                      <Check className="w-3 h-3 text-zinc-950 absolute inset-0 m-auto" strokeWidth={3} />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>

              <Link href={`/dashboard/engagements/${eng.engagementId}`} className="flex-1 flex flex-col md:flex-row md:items-center gap-2.5 min-w-0">
                {/* Connected Platform Badges */}
                <div className="flex-1 flex flex-wrap items-center gap-1.5 md:px-4 font-mono text-[10.5px]">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-border">
                    {bookingLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-border">
                    {emailLabel}
                  </span>
                  {smsActive && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border border-border">
                      SMS
                    </span>
                  )}
                </div>

                {/* Squishy Modules Bar (Instant Telemetry) */}
                <div className="flex items-center justify-start md:justify-center gap-1.5 md:w-44 shrink-0 py-0.5">
                  {SKILLS.map((skill) => {
                    const status = deriveModuleStatus(skill, engRuns);
                    const isLive = status === "live";
                    const isFailed = status === "failed";

                    return (
                      <div key={skill} className="relative" title={`${SKILL_INFO[skill].name}: ${MODULE_STATUS_LABELS[status]}`}>
                        <SquishySkillBadge skill={skill} size={24} enabled={isLive || isFailed} />
                        {isFailed && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950 animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Created Date & Hover Arrow */}
                <div className="flex items-center justify-end gap-2 md:w-24 shrink-0 text-right">
                  <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                    {new Date(eng.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <ArrowRight
                    size={13}
                    className="text-zinc-400 group-hover/row:text-zinc-600 dark:group-hover/row:text-zinc-200 group-hover/row:translate-x-0.5 transition-all opacity-0 group-hover/row:opacity-100 shrink-0"
                  />
                </div>
              </Link>
            </div>

            {errorRowId === eng.engagementId && errorMessage && (
              <p className="px-3.5 pt-1 text-[11px] text-rose-500">{errorMessage}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
