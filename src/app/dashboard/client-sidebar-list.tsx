"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { List, MoreHorizontal, Pencil, Palette, Check, X, Loader2 } from "lucide-react";
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

export interface ClientRailRow {
  engagementId: string;
  buyer: string;
  tagColor: string | null;
}

/**
 * Shared "sharp rectangular" card styling from the top nav's Create button
 * dropdown (src/components/top-nav.tsx) — reused here verbatim per the
 * request that the client row's "..." menu look like that exact dropdown,
 * not the rounded ActionPanel style used for run-row menus elsewhere.
 */
const MENU_CARD = "bg-white dark:bg-zinc-900 border border-border rounded-sm shadow-xl text-zinc-900 dark:text-zinc-100 font-sans antialiased";
const MENU_ITEM = "group/item flex items-center gap-2.5 px-2.5 py-1.5 rounded-none text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white focus:bg-zinc-100 dark:focus:bg-zinc-800 data-open:bg-zinc-100 dark:data-open:bg-zinc-800 cursor-pointer outline-none";
const MENU_ICON = "w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors shrink-0";

/**
 * Client rail list — split out of WorkSidebar (a Server Component) so each
 * row can carry its own rename/tag-color/menu-open state. Renaming and
 * recoloring both PATCH /api/engagements/[id] (see the buyer/tagColor
 * branch added there) and update local state optimistically, then
 * router.refresh() to reconcile with the server the same way
 * EditableOfferPrice and the other inline-edit controls in this app do.
 */
export function ClientSidebarList({ clients }: { clients: readonly ClientRailRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ClientRailRow[]>(() => [...clients]);
  // WorkSidebar re-runs its DB query on every router.refresh() (name edits
  // and color changes both trigger one) and hands down a fresh `clients`
  // array — resync so the server's version wins once it lands, same as the
  // optimistic-then-reconcile pattern the rest of this component uses.
  // Adjusted during render rather than in an effect (React's documented
  // "adjusting state when a prop changes" pattern) so a new `clients`
  // array doesn't cause an extra commit-then-recommit render pass.
  const [prevClients, setPrevClients] = useState(clients);
  if (clients !== prevClients) {
    setPrevClients(clients);
    setRows([...clients]);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorRowId, setErrorRowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing(row: ClientRailRow) {
    setOpenMenuId(null);
    setErrorRowId(null);
    setEditValue(row.buyer);
    setEditingId(row.engagementId);
    // DropdownMenuItem's onSelect fires before the item unmounts; focusing
    // the input needs to happen after React commits the edit-mode render.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelEditing() {
    setEditingId(null);
    setErrorRowId(null);
  }

  async function commitEdit(row: ClientRailRow) {
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

  async function applyTagColor(row: ClientRailRow, colorId: string) {
    setOpenMenuId(null);
    const previous = row.tagColor;
    // Optimistic — the squircle recolors immediately, before the PATCH resolves.
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

  if (rows.length === 0) {
    return <p className="px-2.5 py-1 text-xs text-zinc-500">No clients yet.</p>;
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {rows.map((row) => {
        const isEditing = editingId === row.engagementId;
        const isBusy = busyId === row.engagementId;

        return (
          <div key={row.engagementId} className="flex flex-col">
            <div
              className={cn(
                "group/row flex items-center gap-3 px-2.5 py-2 rounded-[10px] text-[13px] font-medium text-zinc-300 transition-colors duration-100",
                !isEditing && "hover:bg-zinc-800/60 hover:text-white"
              )}
            >
              {/* Squircle Icon — recolors from the tag-color submenu, independent of the row/label background */}
              <div
                className="w-6 h-6 rounded-[7px] text-zinc-950 flex items-center justify-center shrink-0 shadow-xs"
                style={{ backgroundColor: tagColorHex(row.tagColor) }}
              >
                <List className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>

              {isEditing ? (
                <>
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit(row);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                    disabled={isBusy}
                    maxLength={200}
                    className="flex-1 min-w-0 bg-zinc-800 text-white text-[13px] font-medium rounded-md px-2 py-1 outline-none ring-1 ring-zinc-600 focus:ring-zinc-400 disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => commitEdit(row)}
                    disabled={isBusy}
                    title="Save"
                    className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={isBusy}
                    title="Cancel"
                    className="p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href={`/dashboard/engagements/${row.engagementId}`}
                    className="flex-1 min-w-0 truncate group-hover/row:text-white"
                  >
                    {row.buyer}
                  </Link>

                  <DropdownMenu
                    open={openMenuId === row.engagementId}
                    onOpenChange={(open) => setOpenMenuId(open ? row.engagementId : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="More options"
                        className={cn(
                          "shrink-0 p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-700/60 transition-colors cursor-pointer",
                          "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-zinc-700/60 data-[state=open]:text-white"
                        )}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="start"
                      side="right"
                      sideOffset={6}
                      className={cn(MENU_CARD, "w-44 p-0 py-1")}
                    >
                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); startEditing(row); }} className={MENU_ITEM}>
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
                              const selected = row.tagColor ? row.tagColor === c.id : c.id === "teal";
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  title={c.label}
                                  onClick={() => applyTagColor(row, c.id)}
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
                </>
              )}
            </div>

            {errorRowId === row.engagementId && errorMessage && (
              <p className="px-2.5 pb-1 text-[11px] text-rose-400">{errorMessage}</p>
            )}
          </div>
        );
      })}
    </nav>
  );
}
