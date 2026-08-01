"use client";

// The "All / Clients" scope switch used on the Queue and Live Executions
// tables — same interaction as a Hunter-style "People / Companies" toggle,
// but resolved for a live-ops tool instead of a static contact list:
//
//   All      — the existing flat, unfiltered item list (unchanged). No
//               rail content below the toggle beyond a small stat blurb —
//               a client list here would just repeat what the table's own
//               "Client" column/subtitle already shows on every row.
//   Clients  — reveals a searchable client roster in the rail. With no
//               client picked, the main table swaps to <ClientRosterTable>
//               (one row per client, aggregated) — this is what makes the
//               toggle non-redundant with "All": it's a different grain of
//               the same data, not the same rows with a filter slapped on.
//               Picking a client (from the rail or a roster row) scopes
//               the ordinary item table down to just that client.
//
// Both panels are deliberately fixed-width so switching tabs never
// reflows the table next to it.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, ArrowUpRight } from "lucide-react";
import { SegmentedTabs, type SegmentedTabOption } from "@/components/segmented-tabs";
import { CLIENT_RAIL_COPY as copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type ClientScopeView = "all" | "clients";

export interface ClientRailEntry {
  engagementId: string;
  buyer: string;
  /** Small badge next to the name. Omit or 0 renders no badge. */
  count?: number;
  tone?: "muted" | "attention" | "danger";
  /** Renders a small pulsing dot — "this client has something live right now." */
  isLive?: boolean;
  paused?: boolean;
}

export interface ClientRailStat {
  label: string;
  value: number | string;
}

export function ClientRail({
  view,
  onViewChange,
  clients,
  selectedEngagementId,
  onSelectClient,
  totalCount,
  allModeStats,
  allModeBlurb,
  addHref = "/dashboard/engagements/new",
}: {
  view: ClientScopeView;
  onViewChange: (v: ClientScopeView) => void;
  clients: ClientRailEntry[];
  selectedEngagementId: string | null;
  onSelectClient: (id: string | null) => void;
  /** Shown on the pinned "All clients" row. */
  totalCount?: number;
  allModeStats?: ClientRailStat[];
  allModeBlurb?: string;
  addHref?: string;
}) {
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? clients.filter((c) => c.buyer.toLowerCase().includes(q)) : clients;
    return [...filtered].sort((a, b) => {
      const byUrgency = (b.count ?? 0) - (a.count ?? 0);
      if (byUrgency !== 0) return byUrgency;
      return a.buyer.localeCompare(b.buyer);
    });
  }, [clients, search]);

  const tabOptions: SegmentedTabOption<ClientScopeView>[] = [
    { key: "all", label: copy.scopeTabs.all },
    { key: "clients", label: copy.scopeTabs.clients, count: clients.length },
  ];

  return (
    <div className="w-60 shrink-0 flex flex-col gap-3">
      <SegmentedTabs options={tabOptions} value={view} onChange={onViewChange} className="w-full justify-center" />

      {view === "all" ? (
        <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2.5">
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {allModeBlurb ?? copy.allModeBlurb(clients.length)}
          </p>
          {allModeStats && allModeStats.length > 0 && (
            <div className="flex flex-col gap-1 pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
              {allModeStats.map((s) => (
                <div key={s.label} className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-500 dark:text-zinc-400">{s.label}</span>
                  <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300 tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-sm flex flex-col">
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-zinc-200 dark:border-zinc-800/70 bg-zinc-50/50 dark:bg-zinc-950/50">
            <div className="relative flex-1 min-w-0">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full pl-6 pr-2 py-1 text-[11px] font-sans rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 transition-colors"
              />
            </div>
            <Link
              href={addHref}
              title={copy.addClientLabel}
              aria-label={copy.addClientLabel}
              className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors shrink-0 cursor-pointer"
            >
              <Plus size={12} />
            </Link>
          </div>

          <div className="max-h-[420px] overflow-y-auto [scrollbar-width:thin]">
            <button
              type="button"
              onClick={() => onSelectClient(null)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold border-b border-zinc-200 dark:border-zinc-800/70 transition-colors cursor-pointer",
                selectedEngagementId === null
                  ? "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              )}
            >
              <span>{copy.allClientsRow}</span>
              {typeof totalCount === "number" && (
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">{totalCount}</span>
              )}
            </button>

            {sorted.length === 0 ? (
              <p className="px-2.5 py-6 text-[11px] text-zinc-400 dark:text-zinc-600 text-center font-mono">
                {search ? copy.noMatches : copy.emptyState}
              </p>
            ) : (
              sorted.map((c) => {
                const active = c.engagementId === selectedEngagementId;
                return (
                  <button
                    key={c.engagementId}
                    type="button"
                    data-testid={`rail-client-${c.engagementId}`}
                    onClick={() => onSelectClient(c.engagementId)}
                    title={c.buyer}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors cursor-pointer border-b border-zinc-100 dark:border-zinc-900/60 last:border-b-0",
                      active
                        ? "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 font-medium"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    )}
                  >
                    {c.isLive && (
                      <span className="relative flex w-1.5 h-1.5 shrink-0" title="Live right now">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
                      </span>
                    )}
                    <span className="flex-1 truncate">{c.buyer}</span>
                    {c.paused && (
                      <span className="text-[9px] font-mono uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
                        {copy.pausedBadge}
                      </span>
                    )}
                    {!!c.count && (
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold px-1 rounded-sm tabular-nums shrink-0",
                          c.tone === "danger"
                            ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                            : c.tone === "attention"
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
                            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-500"
                        )}
                      >
                        {c.count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster table — the "Clients" grain of the data: one row per client
// instead of one row per item/run. Column definitions are supplied by the
// caller (Queue and Live Executions aggregate very different things), this
// component only owns the shared shell, sorting affordance, and row click.
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

function relativeTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function columnToneClass(tone: ClientRosterColumn["tone"], value: number): string {
  if (value === 0) return "text-zinc-300 dark:text-zinc-700";
  if (tone === "danger") return "text-rose-600 dark:text-rose-400";
  if (tone === "attention") return "text-amber-600 dark:text-amber-400";
  return "text-zinc-700 dark:text-zinc-300";
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
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white/60 dark:bg-zinc-900/50 backdrop-blur-md overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left border-collapse text-xs font-sans tracking-tight">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/30 dark:bg-transparent text-zinc-400 dark:text-zinc-600 uppercase tracking-wider font-mono text-[10px] select-none">
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
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/30">
            {rows.map((row) => (
              <tr
                key={row.engagementId}
                data-testid={`roster-row-${row.engagementId}`}
                onClick={() => onSelectClient(row.engagementId)}
                className="group bg-zinc-50/40 dark:bg-zinc-900/40 hover:bg-zinc-100 dark:hover:bg-zinc-900/80 transition-colors cursor-pointer"
              >
                <td className="px-4 py-2.5 max-w-[200px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.isLive && (
                      <span className="relative flex w-1.5 h-1.5 shrink-0" title="Live right now">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
                      </span>
                    )}
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{row.buyer}</span>
                    {row.paused && (
                      <span className="text-[9px] font-mono uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
                        {copy.pausedBadge}
                      </span>
                    )}
                  </div>
                </td>
                {row.columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 text-right whitespace-nowrap">
                    <span className={cn("text-sm font-mono font-bold tabular-nums", columnToneClass(col.tone, col.value))}>
                      {col.value}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <span className="text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">
                    {relativeTimeShort(row.lastActivity)}
                  </span>
                </td>
                <td className="pr-3 text-right">
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-2px] group-hover:translate-x-0 duration-150 inline-block" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
