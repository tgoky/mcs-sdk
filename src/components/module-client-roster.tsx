"use client";

import { useMemo, useState, Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ChevronDown,
  LayoutList,
  Kanban,
  ArrowUpRight,
  PauseCircle,
  PlayCircle,
  Copy,
  Search,
  Maximize2,
  AlertTriangle,
  Activity as ActivityIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillManifestEntry, SkillId } from "@/lib/skill-manifest";
import type { ModuleClientSummary } from "@/lib/module-overview";
import { ActionPanel, useQuickActions, type ActionPanelSection } from "@/components/action-panel";
import { pauseEngagement, resumeEngagement, copyToClipboard } from "@/lib/quick-actions";
import { SquishySkillBadge } from "@/components/squishy-skill-badge";
import { formatVerboseDate } from "@/components/relative-time";
import { PinDownModuleView, type SkillRun } from "@/components/pin-down-module-view";
import { PileOnModuleView } from "@/components/pile-on-module-view";
import { PreCallReadModuleView } from "@/components/pre-call-read-module-view";
import { WinBackModuleView } from "@/components/win-back-module-view";
import { LeakMapModuleView } from "@/components/leak-map-module-views";

const HAS_SKILL_DETAIL_PAGE: Partial<Record<SkillId, true>> = {
  "pile-on": true,
  "pre-call-read": true,
  "win-back": true,
  "leak-map": true,
};

function hrefFor(skill: SkillId, engagementId: string): string {
  const basePath = HAS_SKILL_DETAIL_PAGE[skill]
    ? `/dashboard/engagements/${engagementId}/skills/${skill}`
    : `/dashboard/engagements/${engagementId}`;

  return `${basePath}?from=/dashboard/modules/${skill}`;
}
type FilterStatus = "all" | "active" | "needs_attention" | "paused" | "activity";

function deriveTone(client: ModuleClientSummary): "success" | "danger" | "warning" | "neutral" {
  if (client.pausedAt) return "warning";
  if (client.consecutiveFailures > 0 || client.lastStatus === "failed" || client.lastStatus === "timed_out") {
    return "danger";
  }
  if (client.lastStatus === "success") return "success";
  if (client.lastStatus === "running") return "warning";
  return "neutral";
}

function deriveLabel(client: ModuleClientSummary): string {
  if (client.pausedAt) return "Paused";
  if (client.consecutiveFailures > 0 || client.lastStatus === "failed") return "Attention";
  if (client.lastStatus === "success") return "Healthy";
  if (client.lastStatus === "running") return "Running";
  if (!client.lastStatus) return "Not run yet";
  return client.lastStatus;
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "danger" | "warning" | "neutral";
  children: ReactNode;
}) {
  const styles = {
    success: "bg-emerald-400 text-zinc-950 font-bold",
    warning: "bg-amber-400 text-zinc-950 font-bold",
    danger: "bg-rose-400 text-zinc-950 font-bold",
    neutral: "bg-zinc-700 text-zinc-100 font-medium",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-sans tracking-wide select-none shrink-0",
        styles
      )}
    >
      {children}
    </span>
  );
}

function buildClientSections(
  client: ModuleClientSummary,
  skill: SkillId,
  dispatch: ReturnType<typeof useQuickActions>["run"],
  closePanel: () => void
): ActionPanelSection[] {
  const isPaused = !!client.pausedAt;

  const primary: ActionPanelSection["items"] = [
    {
      key: "open-engagement",
      icon: ArrowUpRight,
      label: "Open client settings",
      href: hrefFor(skill, client.engagementId),
    },
  ];

  const controls: ActionPanelSection["items"] = [
    isPaused
      ? {
          key: "resume",
          icon: PlayCircle,
          label: "Resume client automations",
          onSelect: () =>
            dispatch("resume", () => resumeEngagement(client.engagementId), closePanel),
        }
      : {
          key: "pause",
          icon: PauseCircle,
          label: "Pause client automations",
          onSelect: () =>
            dispatch("pause", () => pauseEngagement(client.engagementId), closePanel),
        },
  ];

  const utility: ActionPanelSection["items"] = [
    {
      key: "copy",
      icon: Copy,
      label: "Copy engagement ID",
      onSelect: () => dispatch("copy", () => copyToClipboard(client.engagementId)),
    },
  ];

  return [
    { label: "Navigation", items: primary },
    { label: "Client controls", items: controls },
    { label: "Utility", items: utility },
  ];
}

export function ModuleClientRoster({
  summaries = [],
  manifest,
  skill,
  runs,
}: {
  summaries: ModuleClientSummary[];
  manifest: SkillManifestEntry;
  skill: SkillId;
  runs?: SkillRun[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "board">("list");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [page, setPage] = useState(0);
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);

  const { busyKey, error, run: dispatch } = useQuickActions();

  const handleBackToClients = () => setStatusFilter("all");

  // Rendered directly on the client (not pre-rendered on the server and
  // cloned into with extra props) so onBack reaches the module view
  // reliably — props injected via cloneElement across a Server/Client
  // boundary don't survive serialization.
  const activityWithBack = useMemo(() => {
    if (!runs) return null;
    const props = { runs, manifest, onBack: handleBackToClients };
    switch (skill) {
      case "pin-down":
        return <PinDownModuleView {...props} />;
      case "pile-on":
        return <PileOnModuleView {...props} />;
      case "pre-call-read":
        return <PreCallReadModuleView {...props} />;
      case "win-back":
        return <WinBackModuleView {...props} />;
      case "leak-map":
        return <LeakMapModuleView {...props} />;
      default:
        return null;
    }
  }, [runs, manifest, skill]);

  const counts = useMemo(() => {
    let active = 0;
    let needsAttention = 0;
    let paused = 0;

    for (const c of summaries) {
      if (c.pausedAt) paused++;
      else if (c.consecutiveFailures > 0 || c.lastStatus === "failed" || c.lastStatus === "timed_out") {
        needsAttention++;
      } else active++;
    }

    return { all: summaries.length, active, needs_attention: needsAttention, paused };
  }, [summaries]);

  const filteredClients = useMemo(() => {
    return summaries.filter((c) => {
      const isPaused = !!c.pausedAt;
      const isNeedsAttention =
        c.consecutiveFailures > 0 || c.lastStatus === "failed" || c.lastStatus === "timed_out";

      let matchesStatus = true;
      if (statusFilter === "active") matchesStatus = !isPaused && !isNeedsAttention;
      if (statusFilter === "needs_attention") matchesStatus = isNeedsAttention;
      if (statusFilter === "paused") matchesStatus = isPaused;

      if (!matchesStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return c.buyerName.toLowerCase().includes(q);
      }

      return true;
    });
  }, [summaries, statusFilter, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredClients.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedClients = filteredClients.slice(
    clampedPage * pageSize,
    clampedPage * pageSize + pageSize
  );

  const board = useMemo(() => {
    const cols = {
      active: [] as ModuleClientSummary[],
      needs_attention: [] as ModuleClientSummary[],
      paused: [] as ModuleClientSummary[],
    };

    for (const c of filteredClients) {
      if (c.pausedAt) cols.paused.push(c);
      else if (c.consecutiveFailures > 0 || c.lastStatus === "failed" || c.lastStatus === "timed_out") {
        cols.needs_attention.push(c);
      } else cols.active.push(c);
    }
    return cols;
  }, [filteredClients]);

  return (
    <div className="space-y-3 font-sans antialiased text-zinc-100">
      {statusFilter === "activity" ? (
        activityWithBack
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              {(["all", "active", "needs_attention", "paused"] as const).map((tab) => {
                const isActive = statusFilter === tab;
                const labels = {
                  all: `All ${counts.all}`,
                  active: `Active ${counts.active}`,
                  needs_attention: `Needs attention ${counts.needs_attention}`,
                  paused: `Paused ${counts.paused}`,
                };

                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab);
                      setPage(0);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer whitespace-nowrap bg-transparent",
                      isActive
                        ? "border-zinc-400 text-white font-semibold"
                        : "border-zinc-800/90 text-zinc-400 hover:text-white hover:border-zinc-600"
                    )}
                  >
                    <span>{labels[tab]}</span>
                    <ChevronDown size={13} className="text-zinc-400 shrink-0" />
                  </button>
                );
              })}

              {runs && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("activity")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border border-zinc-800/90 text-zinc-400 hover:text-white hover:border-zinc-600 transition-all cursor-pointer whitespace-nowrap bg-transparent"
                >
                  <ActivityIcon size={13} className="text-zinc-400" />
                  <span>Activity</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative w-44 sm:w-56">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Search clients..."
                  className="w-full pl-8 pr-3 py-1 rounded-full text-xs bg-transparent border border-zinc-800/90 focus:outline-none focus:border-zinc-600 text-zinc-100 placeholder-zinc-500 transition-colors"
                />
              </div>

              <div className="flex items-center rounded-full border border-zinc-800/90 bg-transparent p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer bg-transparent",
                    mode === "list"
                      ? "text-white font-semibold border border-zinc-600"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <LayoutList size={13} />
                  <span>List</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("board")}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer bg-transparent",
                    mode === "board"
                      ? "text-white font-semibold border border-zinc-600"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Kanban size={13} />
                  <span>Board</span>
                </button>
              </div>
            </div>
          </div>

          {/* LIST VIEW */}
          {mode === "list" && (
            <div className="w-full font-sans border-t border-b border-zinc-800/80 pt-1">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-[11px] text-zinc-400">
                    <th className="px-4 py-3 font-normal">Client & Execution Summary</th>
                    <th className="px-4 py-3 font-normal text-center w-24">Skill</th>
                    <th className="px-4 py-3 font-normal text-right">Status</th>
                    <th className="w-10 px-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {pagedClients.map((client) => {
                    const tone = deriveTone(client);
                    const statusText = deriveLabel(client);
                    const isFailed = tone === "danger";

                    return (
                      <Fragment key={client.engagementId}>
                        <tr
                          onClick={() => router.push(hrefFor(skill, client.engagementId))}
                          className="group hover:bg-zinc-800/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-mint text-accent-mint-foreground shrink-0 font-bold">
                                <Users size={15} strokeWidth={2.5} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-white group-hover:text-amber-300 transition-colors truncate">
                                    {client.buyerName}
                                  </p>
                                  {client.pausedAt && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 shrink-0">
                                      <PauseCircle size={11} /> paused
                                    </span>
                                  )}
                                  {!client.skillEnabled && (
                                    <span className="text-[10px] font-mono text-zinc-600 shrink-0">off</span>
                                  )}
                                </div>
                                <p
                                  className={cn(
                                    "text-[11px] font-sans font-medium truncate mt-0.5",
                                    isFailed ? "text-rose-400 font-mono" : "text-emerald-400"
                                  )}
                                >
                                  {client.totalRuns} total runs
                                  {client.lastRunAt && (
                                    <>
                                      {" · "}
                                      <span title={formatVerboseDate(client.lastRunAt).full}>
                                        Last run {formatVerboseDate(client.lastRunAt).absolute}
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <div className="flex justify-center">
                              <SquishySkillBadge skill={skill} size={24} enabled={client.skillEnabled} />
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              {client.consecutiveFailures > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400"
                                  title={`${client.consecutiveFailures} consecutive failures`}
                                >
                                  <AlertTriangle size={11} />
                                  {client.consecutiveFailures}
                                </span>
                              )}
                              <StatusBadge tone={tone}>{statusText}</StatusBadge>
                            </div>
                          </td>

                          <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <ActionPanel
                              open={openPanelId === client.engagementId}
                              onOpenChange={(next) =>
                                setOpenPanelId(next ? client.engagementId : null)
                              }
                              sections={buildClientSections(client, skill, dispatch, () =>
                                setOpenPanelId(null)
                              )}
                              errorText={error}
                              busyKey={busyKey}
                              triggerLabel={`Quick actions for ${client.buyerName}`}
                            />
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}

                  {pagedClients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-xs text-zinc-500 italic">
                        No clients match your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/80">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                  {([10, 25, 50] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setPageSize(size)}
                      className={cn(
                        "px-2 py-0.5 rounded border transition-colors cursor-pointer",
                        pageSize === size
                          ? "border-zinc-600 bg-zinc-800 text-white"
                          : "border-transparent text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {size}/page
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                  <span>
                    Page {clampedPage + 1} of {pageCount}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={clampedPage === 0}
                      className="px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={clampedPage >= pageCount - 1}
                      className="px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* KANBAN BOARD VIEW */}
          {mode === "board" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 font-sans pt-2">
              {(["active", "needs_attention", "paused"] as const).map((colKey) => {
                const colTitles = {
                  active: "Active Clients",
                  needs_attention: "Needs Attention",
                  paused: "Paused",
                };

                return (
                  <div
                    key={colKey}
                    className="rounded-2xl border border-zinc-800/80 bg-transparent p-3 flex flex-col gap-2 font-sans"
                  >
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-zinc-300">{colTitles[colKey]}</span>
                      <span className="text-[10px] font-mono text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded-md font-bold">
                        {board[colKey].length}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-0.5">
                      {board[colKey].map((c) => (
                        <div
                          key={c.engagementId}
                          onClick={() => router.push(hrefFor(skill, c.engagementId))}
                          className="w-full text-left rounded-xl border border-zinc-800/80 bg-transparent hover:border-zinc-700 p-3 transition-all cursor-pointer group flex flex-col gap-2 font-sans"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <SquishySkillBadge skill={skill} size={24} enabled={c.skillEnabled} />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                  {c.buyerName}
                                </p>
                              </div>
                            </div>

                            <Maximize2
                              size={12}
                              className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-0.5"
                            />
                          </div>

                          <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                            {c.totalRuns} total runs executed
                          </p>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800/80 text-[10.5px] text-zinc-400 font-mono">
                            {c.lastRunAt ? (
                              <span
                                title={formatVerboseDate(c.lastRunAt).full}
                                className="text-[10.5px]"
                              >
                                {formatVerboseDate(c.lastRunAt).absolute}
                              </span>
                            ) : (
                              <span>No runs yet</span>
                            )}

                            <StatusBadge tone={deriveTone(c)}>{deriveLabel(c)}</StatusBadge>
                          </div>
                        </div>
                      ))}

                      {board[colKey].length === 0 && (
                        <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-[10px] text-zinc-600">
                          No clients in this column
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}