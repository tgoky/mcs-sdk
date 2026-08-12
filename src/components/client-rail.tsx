"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Plus, ChevronDown, GripVertical, Layers, List, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientScopeView = "all" | "clients";

export interface CategoryRailItem {
  id: string;
  label: string;
  count: number;
}

export interface ClientRailEntry {
  engagementId: string;
  buyer: string;
  count?: number;
  pausedAt?: string | null;
}

interface IntegratedRailProps {
  view: ClientScopeView;
  onViewChange: (v: ClientScopeView) => void;
  
  // All mode (Platform / CRM categories)
  categories: CategoryRailItem[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  totalAllItemsCount: number;

  // Clients mode
  clients: ClientRailEntry[];
  selectedClientId: string | null;
  onSelectClient: (id: string | null) => void;
  totalClientsCount: number;

  addHref?: string;
}

export function IntegratedRail({
  view,
  onViewChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  totalAllItemsCount,
  clients,
  selectedClientId,
  onSelectClient,
  totalClientsCount,
  addHref = "/dashboard/engagements/new",
}: IntegratedRailProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Filter categories or clients based on search input
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    return categories.filter((c) =>
      c.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [categories, searchQuery]);

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    return clients.filter((c) =>
      c.buyer.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clients, searchQuery]);

  return (
   <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-sidebar-border bg-sidebar p-3 flex flex-col shrink-0 space-y-3 select-none text-zinc-300">
      {/* 1. TOP TOGGLE SWITCH: [ All | Clients ] */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium">
        <button
          type="button"
          onClick={() => onViewChange("all")}
          className={cn(
            "py-1.5 rounded-lg text-center transition-all cursor-pointer",
            view === "all"
              ? "bg-zinc-700 text-white font-semibold shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => onViewChange("clients")}
          className={cn(
            "py-1.5 rounded-lg text-center transition-all cursor-pointer",
            view === "clients"
              ? "bg-zinc-700 text-white font-semibold shadow-xs"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          Clients
        </button>
      </div>

      {/* 2. MAIN SCOPE CARD (Grey Background) */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/50 text-xs font-semibold text-zinc-100 shadow-xs">
        <span>{view === "all" ? "All queues" : "All clients"}</span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-700/80 text-zinc-200 font-bold tabular-nums">
          {view === "all" ? totalAllItemsCount : totalClientsCount}
        </span>
      </div>

      {/* 3. LISTS HEADER WITH SEARCH & PLUS ICONS */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-zinc-300 tracking-tight">
            {view === "all" ? "Lists" : "Clients"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsSearchOpen((prev) => !prev)}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Search lists"
            >
              <Search size={13} />
            </button>
            <Link
              href={addHref}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Add client"
            >
              <Plus size={13} />
            </Link>
          </div>
        </div>

        {/* Collapsible inline search input */}
        {isSearchOpen && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={view === "all" ? "Search platforms..." : "Search clients..."}
            className="w-full px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
            autoFocus
          />
        )}

        {/* 4. BY CATEGORY / BY CRM DROPDOWN PILL */}
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 font-medium">
          <div className="flex items-center gap-2">
            <GripVertical size={13} className="text-zinc-500 shrink-0" />
            <span className="truncate">
              {view === "all" ? "By CRM / Platform" : "By Client Name"}
            </span>
          </div>
          <ChevronDown size={13} className="text-zinc-500 shrink-0" />
        </div>
      </div>

      {/* 5. SUB-LIST ITEMS */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pt-1 max-h-[360px] [scrollbar-width:none]">
        {view === "all" ? (
          /* ALL VIEW: PLATFORMS / CRMs LIST */
          <>
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                selectedCategoryId === null
                  ? "bg-zinc-700 text-white font-semibold"
                  : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Layers size={14} className="text-zinc-400 shrink-0" />
                <span className="truncate">Every platform</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                {totalAllItemsCount}
              </span>
            </button>

            {filteredCategories.map((cat) => {
              const active = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-zinc-700 text-white font-semibold"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Layers size={14} className="text-zinc-400 shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          /* CLIENTS VIEW: CLIENT ROSTER LIST WITH TEAL SQUIRCLE ICON */
          <>
            <button
              type="button"
              onClick={() => onSelectClient(null)}
              className={cn(
                "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                selectedClientId === null
                  ? "bg-zinc-700 text-white font-semibold"
                  : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-5 h-5 rounded-[5px] bg-accent-client text-zinc-950 flex items-center justify-center shrink-0">
                  <List className="w-3 h-3 stroke-[2.5]" />
                </div>
                <span className="truncate">All clients</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                {totalClientsCount}
              </span>
            </button>

            {filteredClients.map((client) => {
              const active = selectedClientId === client.engagementId;
              return (
                <button
                  key={client.engagementId}
                  type="button"
                  onClick={() => onSelectClient(client.engagementId)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-[10px] text-xs font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-zinc-700 text-white font-semibold"
                      : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Teal Squircle Icon */}
                    <div className="w-5 h-5 rounded-[5px] bg-accent-client text-zinc-950 flex items-center justify-center shrink-0 shadow-xs">
                      <List className="w-3 h-3 stroke-[2.5]" />
                    </div>
                    <span className="truncate">{client.buyer}</span>
                  </div>
                  {client.count !== undefined && client.count > 0 && (
                    <span className="text-[11px] font-mono text-zinc-400 font-bold tabular-nums">
                      {client.count}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// Backwards compatibility alias for older imports
export const ClientRail = IntegratedRail;

// ---------------------------------------------------------------------------
// Client Roster Table Component
// ---------------------------------------------------------------------------

export interface ClientRosterColumn {
  key: string;
  label: string;
  value: number;
  tone?: "muted" | "attention" | "danger";
}

export interface ClientRosterRow {
  engagementId: string;
  buyer: string;
  paused?: boolean;
  isLive?: boolean;
  lastActivity?: string | null;
  columns: ClientRosterColumn[];
}

export function ClientRosterTable({
  rows,
  onSelectClient,
  emptyTitle,
  emptySubtitle,
}: {
  rows: ClientRosterRow[];
  onSelectClient: (engagementId: string) => void;
  emptyTitle: string;
  emptySubtitle?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm font-medium text-zinc-500">{emptyTitle}</p>
        {emptySubtitle && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono max-w-sm mx-auto">{emptySubtitle}</p>
        )}
      </div>
    );
  }

  const columnLabels = rows[0]?.columns.map((c) => c.label) ?? [];

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/50 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left border-collapse text-xs font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/50 text-zinc-400 uppercase tracking-wider font-mono text-[10px]">
              <th className="px-4 py-2 font-normal">Client</th>
              {columnLabels.map((label) => (
                <th key={label} className="px-4 py-2 text-right font-normal whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="px-4 py-2 text-right font-normal whitespace-nowrap">Last activity</th>
              <th className="w-8 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/40">
            {rows.map((row) => (
              <tr
                key={row.engagementId}
                onClick={() => onSelectClient(row.engagementId)}
                className="group bg-zinc-900/30 hover:bg-zinc-800/60 transition-colors cursor-pointer"
              >
                <td className="px-4 py-2.5 max-w-[200px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-zinc-200 truncate">{row.buyer}</span>
                  </div>
                </td>
                {row.columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className="text-sm font-mono font-bold text-zinc-300 tabular-nums">
                      {col.value}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="text-xs font-mono text-zinc-500 tabular-nums">
                    {row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}
                  </span>
                </td>
                <td className="pr-3 text-right">
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}