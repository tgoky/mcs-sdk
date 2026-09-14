"use client";

// src/app/dashboard/engagements/[id]/cold-open-findings-panel.tsx
//
// Cold Open's per-engagement findings page — the real, standalone gap
// confirmed this session: Showtime has 5 dedicated pages, Reputation
// Manager has a shared findings page for its 4 watch skills plus a
// dedicated incidents tracker, and Cold Open had zero. Every one of its 7
// skills fell through to the bare engagement page's Run History, with no
// way to see the leads it actually pushed or the replies it actually
// classified.
//
// Two tabs, not a merged timeline like rep-findings-panel.tsx — a pushed
// lead and a classified reply aren't the same shape the way RM's 4 watch
// sources all are (text + sentiment + flag), so forcing them into one feed
// would read as less clear, not more. Same shell conventions as
// rep-findings-panel.tsx otherwise: transparent panels, borders only, a
// list + detail split, search, and status/disposition filter chips.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Send, MessageSquare, Search, RefreshCw, Clock, ExternalLink, Check, X, Loader2, Settings2, Target, Mic, Database, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/app/dashboard/runs/[id]/_shared/status-pill";
import { EmptyState } from "@/app/dashboard/runs/[id]/_shared/empty-state";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";
import { IcpLockConfigForm } from "@/components/worker-config-forms/icp-lock-config-form";
import { VoiceCaptureConfigForm } from "@/components/worker-config-forms/voice-capture-config-form";
import { SourceConnectConfigForm } from "@/components/worker-config-forms/source-connect-config-form";
import { SendConnectConfigForm } from "@/components/worker-config-forms/send-connect-config-form";
import { DailySendConfigForm } from "@/components/worker-config-forms/daily-send-config-form";
import type { ColdOpenLeadStatus, ColdOpenReplyDisposition, ColdOpenPhaseKey, ColdOpenPhaseState, ColdOpenRunSummary } from "@/models/schema";

type ConfigurableColdOpenSkill = "icp-lock" | "voice-capture" | "source-connect" | "send-connect" | "daily-send";

const CONFIGURABLE_SKILLS: { id: ConfigurableColdOpenSkill; label: string; icon: typeof Target }[] = [
  { id: "icp-lock", label: "ICP Lock", icon: Target },
  { id: "voice-capture", label: "Voice Capture", icon: Mic },
  { id: "source-connect", label: "Source Connect", icon: Database },
  { id: "send-connect", label: "Send Connect", icon: Link2 },
  { id: "daily-send", label: "Daily Send", icon: Send },
];

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type ColdOpenLeadRow = {
  id: string;
  runId: string;
  email: string;
  domain: string;
  companyName: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  icp: string | null;
  source: string | null;
  campaignId: string;
  status: ColdOpenLeadStatus;
  statusDetail: unknown;
  pushedAt: string | null;
  createdAt: string;
};

type ColdOpenReplyRow = {
  id: string;
  leadEmail: string;
  campaignId: string | null;
  externalReplyId: string | null;
  disposition: ColdOpenReplyDisposition;
  classificationSource: "heuristic" | "model" | "error" | "none";
  rawBody: string;
  routedToQueue: boolean;
  classifiedAt: string;
  createdAt: string;
};

type ColdOpenConfigRow = {
  productIdentity: { name: string; url: string; price: string; valueProp: string } | null;
  icps: { slug: string; label: string; weight: number }[];
  sendPlatform: { platform: string; baseUrl?: string } | null;
  dailySendSettings: { volume: number; localHour: number; timezone?: string; copyMode: "generate" | "upload"; liveSendEnabled: boolean } | null;
  phaseState: Record<ColdOpenPhaseKey, ColdOpenPhaseState>;
  lastRunAt: string | null;
  lastRunSummary: ColdOpenRunSummary | null;
};

// Same rolling window and grouped-count shape send-report.ts computes on
// its own schedule and logs into that run's own summary — mirrored here
// as a real query (not derived from the page's own possibly-truncated
// lead/reply lists) so this number is the same one Send Report itself
// would report, not an approximation of it.
type Last7Days = { leadsByStatus: Record<string, number>; repliesByDisposition: Record<string, number> };

type FindingsData = { config: ColdOpenConfigRow | null; leads: ColdOpenLeadRow[]; replies: ColdOpenReplyRow[]; last7Days: Last7Days };

const PHASE_LABELS: Record<ColdOpenPhaseKey, string> = {
  icp_lock: "ICP Lock",
  voice_capture: "Voice Capture",
  source_connect: "Source Connect",
  send_connect: "Send Connect",
  daily_send: "Daily Send",
  reply_sort: "Reply Sort",
  send_report: "Send Report",
};
const PHASE_ORDER: ColdOpenPhaseKey[] = ["icp_lock", "voice_capture", "source_connect", "send_connect", "daily_send", "reply_sort", "send_report"];

const LEAD_STATUS_META: Record<ColdOpenLeadStatus, { label: string; tone: Tone }> = {
  pushed: { label: "Pushed", tone: "success" },
  dry_run: { label: "Dry run", tone: "info" },
  held: { label: "Held for review", tone: "warning" },
  duplicate: { label: "Duplicate", tone: "neutral" },
  skipped_dead: { label: "Skipped — dead lead", tone: "neutral" },
  skipped_filtered: { label: "Skipped — filtered", tone: "neutral" },
  error: { label: "Error", tone: "danger" },
  discarded: { label: "Discarded", tone: "neutral" },
  // Transient — a lead sits here only for the duration of one approve
  // request (see held-leads.ts's releaseHeldLead); never expected to be
  // visible for more than an instant, but rendered honestly if it is.
  claiming: { label: "Processing…", tone: "info" },
};

const REPLY_DISPOSITION_META: Record<ColdOpenReplyDisposition, { label: string; tone: Tone }> = {
  interested: { label: "Interested", tone: "success" },
  objection: { label: "Objection", tone: "warning" },
  not_now: { label: "Not now", tone: "info" },
  not_a_fit: { label: "Not a fit", tone: "neutral" },
  auto_reply: { label: "Auto-reply", tone: "neutral" },
  unsubscribe: { label: "Unsubscribe", tone: "neutral" },
  unclassified: { label: "Unclassified — needs review", tone: "danger" },
};

function formatEntryTime(isoString: string) {
  const d = new Date(isoString);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", hour: "2-digit", minute: "2-digit" });
}

function leadName(l: ColdOpenLeadRow): string {
  const name = [l.firstName, l.lastName].filter(Boolean).join(" ").trim();
  return name || l.email;
}

function PhaseProgress({ phaseState }: { phaseState: Record<ColdOpenPhaseKey, ColdOpenPhaseState> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {PHASE_ORDER.map((key) => {
        const state = phaseState[key] ?? "not_started";
        return (
          <span key={key} className="flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-[2px] shrink-0",
                state === "complete" ? "bg-[#424d77] dark:bg-[#c5b7ea]" : state === "in_progress" ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"
              )}
            />
            <span className={cn(state === "not_started" ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-600 dark:text-zinc-400")}>{PHASE_LABELS[key]}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ColdOpenFindingsPanel({ engagementId }: { engagementId: string }) {
  const [data, setData] = useState<FindingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Configure entry point — every other skill with its own dedicated page
  // (Pile-On, Win-Back, Leak-Map, Pre-Call-Read) puts a Configure menu
  // directly on that page; this one had none, so the 5 configurable Cold
  // Open skills were only reachable via the Library. Same inline-swap
  // pattern WorkersPanel already uses for Configure, scoped to this page.
  const [configuringSkill, setConfiguringSkill] = useState<ConfigurableColdOpenSkill | null>(null);
  const [tab, setTab] = useState<"sends" | "replies">("sends");
  const [filterText, setFilterText] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<"all" | ColdOpenLeadStatus>("all");
  const [replyDispositionFilter, setReplyDispositionFilter] = useState<"all" | ColdOpenReplyDisposition>("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedReplyId, setSelectedReplyId] = useState<string | null>(null);
  // Held leads already have a real review action (approve & push /
  // discard) — the daily-send/held-leads route, previously only reachable
  // from the Library's Daily Send Configure form (HeldLeadsPanel there).
  // A "held" lead showing up here with no way to act on it would be
  // exactly the kind of dead end this page exists to fix, so the same
  // action is wired in here too rather than sending the buyer elsewhere
  // to do something this page already shows them needs doing.
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/cold-open-findings`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load Cold Open data.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Cold Open data.");
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);

  async function actOnHeldLead(leadId: string, action: "approve" | "discard") {
    setBusyLeadId(leadId);
    setActionError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send/held-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Action failed.");
      await load();
      setSelectedLeadId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyLeadId(null);
    }
  }

  const leadCounts = useMemo(() => {
    const c: Record<"all" | ColdOpenLeadStatus, number> = {
      all: data?.leads.length ?? 0,
      pushed: 0,
      dry_run: 0,
      held: 0,
      duplicate: 0,
      skipped_dead: 0,
      skipped_filtered: 0,
      error: 0,
      discarded: 0,
      claiming: 0,
    };
    for (const l of data?.leads ?? []) c[l.status]++;
    return c;
  }, [data]);

  const replyCounts = useMemo(() => {
    const c: Record<"all" | ColdOpenReplyDisposition, number> = {
      all: data?.replies.length ?? 0,
      interested: 0,
      not_now: 0,
      not_a_fit: 0,
      objection: 0,
      auto_reply: 0,
      unsubscribe: 0,
      unclassified: 0,
    };
    for (const r of data?.replies ?? []) c[r.disposition]++;
    return c;
  }, [data]);

  const filteredLeads = useMemo(() => {
    let list = data?.leads ?? [];
    if (leadStatusFilter !== "all") list = list.filter((l) => l.status === leadStatusFilter);
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter((l) => `${leadName(l)} ${l.email} ${l.companyName} ${l.icp ?? ""} ${l.campaignId}`.toLowerCase().includes(q));
    }
    return list;
  }, [data, leadStatusFilter, filterText]);

  const filteredReplies = useMemo(() => {
    let list = data?.replies ?? [];
    if (replyDispositionFilter !== "all") list = list.filter((r) => r.disposition === replyDispositionFilter);
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter((r) => `${r.leadEmail} ${r.rawBody}`.toLowerCase().includes(q));
    }
    return list;
  }, [data, replyDispositionFilter, filterText]);

  const selectedLead = useMemo(() => filteredLeads.find((l) => l.id === selectedLeadId) ?? filteredLeads[0] ?? null, [filteredLeads, selectedLeadId]);
  const selectedReply = useMemo(() => filteredReplies.find((r) => r.id === selectedReplyId) ?? filteredReplies[0] ?? null, [filteredReplies, selectedReplyId]);

  if (loading) {
    return <p className="text-xs text-zinc-500 font-mono py-8 text-center">Loading Cold Open data…</p>;
  }
  if (error || !data) {
    return <div className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-100 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">{error}</div>;
  }

  const config = data.config;
  const last7Days = data.last7Days;
  const totalReplies7d = Object.values(last7Days.repliesByDisposition).reduce((sum, n) => sum + n, 0);

  if (configuringSkill) {
    const close = () => {
      setConfiguringSkill(null);
      load();
    };
    return (
      <div className="space-y-4 font-sans antialiased">
        <button
          type="button"
          onClick={close}
          className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" /> Close — back to Cold Open
        </button>
        {configuringSkill === "icp-lock" && <IcpLockConfigForm engagementId={engagementId} onCancel={close} onSaved={close} cancelLabel="Close" />}
        {configuringSkill === "voice-capture" && <VoiceCaptureConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />}
        {configuringSkill === "source-connect" && <SourceConnectConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />}
        {configuringSkill === "send-connect" && <SendConnectConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />}
        {configuringSkill === "daily-send" && <DailySendConfigForm engagementId={engagementId} onCancel={close} cancelLabel="Close" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans antialiased">
      {/* Pipeline status — the 7 phases, send platform, and last run's summary */}
      {config ? (
        <div className="bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4 space-y-3">
          <PhaseProgress phaseState={config.phaseState} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-2.5">
            <span>
              ICPs: <strong className="text-zinc-700 dark:text-zinc-300">{config.icps.length || "none configured"}</strong>
            </span>
            <span>
              Send platform:{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">{config.sendPlatform?.platform ?? "not connected"}</strong>
            </span>
            {config.dailySendSettings && (
              <span>
                Daily volume: <strong className="text-zinc-700 dark:text-zinc-300">{config.dailySendSettings.volume}/day</strong>{" "}
                (
                {config.dailySendSettings.liveSendEnabled ? (
                  <span className="text-[#424d77] dark:text-[#c5b7ea] font-semibold">live</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">dry-run</span>
                )}
                )
              </span>
            )}
            {config.lastRunAt && <span>Last run: {formatEntryTime(config.lastRunAt)}</span>}
          </div>
          {config.lastRunSummary && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Last run:</span>
              <span>Fetched {config.lastRunSummary.fetched}</span>
              <span>Kept {config.lastRunSummary.kept}</span>
              <span className="text-[#424d77] dark:text-[#c5b7ea] font-semibold">Pushed {config.lastRunSummary.pushed}</span>
              <span>Held {config.lastRunSummary.held}</span>
              <span>Duplicate {config.lastRunSummary.duplicate}</span>
              {config.lastRunSummary.errors.length > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold">{config.lastRunSummary.errors.length} error(s)</span>
              )}
            </div>
          )}

          {/* Send Report's own framing: a 7-day rolling rollup of send
              volume, push outcomes, and reply dispositions — same
              REPORT_WINDOW_DAYS query send-report.ts runs on its own
              schedule, distinct from "last run" above (one run's own
              fetch/kept/push numbers) and from the full-history Sends/
              Replies tabs below (everything on file, no window). */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">Last 7 days:</span>
            <span className="text-[#424d77] dark:text-[#c5b7ea] font-semibold">Pushed {last7Days.leadsByStatus.pushed ?? 0}</span>
            <span>Held {last7Days.leadsByStatus.held ?? 0}</span>
            <span>Duplicate {last7Days.leadsByStatus.duplicate ?? 0}</span>
            {(last7Days.leadsByStatus.error ?? 0) > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{last7Days.leadsByStatus.error} error(s)</span>
            )}
            <span>{totalReplies7d} repl{totalReplies7d === 1 ? "y" : "ies"}</span>
            {(last7Days.repliesByDisposition.interested ?? 0) > 0 && (
              <span className="text-[#424d77] dark:text-[#c5b7ea] font-semibold">{last7Days.repliesByDisposition.interested} interested</span>
            )}
          </div>
        </div>
      ) : (
        <EmptyState icon={Send} title="Cold Open isn't configured for this client yet" description="Set up ICP Lock, Voice Capture, Source Connect, and Send Connect from the Library to start generating real sends." />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400 dark:text-zinc-500" />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={tab === "sends" ? "Search leads…" : "Search replies…"}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-1.5 pl-8 pr-2.5 text-xs text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-zinc-400 dark:focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => setTab("sends")}
              className={cn(
                "hover-lift press-settle flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer",
                tab === "sends" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              <Send size={12} /> Sends ({leadCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setTab("replies")}
              className={cn(
                "hover-lift press-settle flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer",
                tab === "replies" ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              <MessageSquare size={12} /> Replies ({replyCounts.all})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ActionMenu
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Settings2 size={13} /> Configure
              </button>
            )}
          >
            {(close) =>
              CONFIGURABLE_SKILLS.map((skill) => (
                <ActionMenuItem
                  key={skill.id}
                  icon={skill.icon}
                  label={skill.label}
                  onClick={() => {
                    setConfiguringSkill(skill.id);
                    close();
                  }}
                />
              ))
            }
          </ActionMenu>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="hover-lift press-settle shadow-elevation-1 flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {tab === "sends" ? (
        <>
          <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
            {(["all", "pushed", "dry_run", "held", "duplicate", "skipped_dead", "skipped_filtered", "error", "discarded"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLeadStatusFilter(s)}
                className={cn(
                  "hover-lift press-settle px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  leadStatusFilter === s ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                {s === "all" ? `All (${leadCounts.all})` : `${LEAD_STATUS_META[s].label} (${leadCounts[s]})`}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-900 dark:text-white">Leads</span>
                <span className="text-[10.5px] font-mono text-zinc-500">{filteredLeads.length} shown</span>
              </div>

              {filteredLeads.length === 0 ? (
                <EmptyState icon={Send} title="No leads on file" description="Leads will appear here once Daily Send runs — from Source Connect's fetch, filtered to ICP, and pushed (or held/skipped) to the mapped campaign." />
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40 max-h-[420px] overflow-y-auto">
                  {filteredLeads.map((l) => {
                    const meta = LEAD_STATUS_META[l.status];
                    const isSelected = selectedLead?.id === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLeadId(l.id)}
                        className={cn(
                          "hover-lift press-settle flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-0",
                          isSelected ? "bg-zinc-100/80 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{leadName(l)}</span>
                            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            {l.companyName} {l.icp ? `· ${l.icp}` : ""} · {l.campaignId}
                          </p>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                          <Clock size={9} />
                          {formatEntryTime(l.pushedAt ?? l.createdAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedLead && (
              <div className="bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{leadName(selectedLead)}</h4>
                    <span className="text-[10.5px] font-mono text-zinc-500">{selectedLead.email} · {selectedLead.domain}</span>
                  </div>
                  <StatusPill tone={LEAD_STATUS_META[selectedLead.status].tone}>{LEAD_STATUS_META[selectedLead.status].label}</StatusPill>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {selectedLead.title ? `${selectedLead.title} at ` : ""}
                  {selectedLead.companyName}
                  {selectedLead.source ? ` · sourced via ${selectedLead.source}` : ""}
                </p>
                {selectedLead.statusDetail != null && (
                  <pre className="whitespace-pre-wrap break-all rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 bg-transparent p-3 text-[10.5px] leading-relaxed text-zinc-600 dark:text-zinc-400 font-mono">
                    {typeof selectedLead.statusDetail === "string" ? selectedLead.statusDetail : JSON.stringify(selectedLead.statusDetail, null, 2)}
                  </pre>
                )}
                {selectedLead.status === "held" && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => actOnHeldLead(selectedLead.id, "approve")}
                      disabled={busyLeadId === selectedLead.id}
                      className="hover-lift press-settle flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      {busyLeadId === selectedLead.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Approve &amp; send
                    </button>
                    <button
                      type="button"
                      onClick={() => actOnHeldLead(selectedLead.id, "discard")}
                      disabled={busyLeadId === selectedLead.id}
                      className="hover-lift press-settle flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer transition-colors"
                    >
                      <X size={13} />
                      Discard
                    </button>
                  </div>
                )}
                {actionError && <p className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">⚠ {actionError}</p>}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
            {(["all", "interested", "objection", "not_now", "not_a_fit", "auto_reply", "unsubscribe", "unclassified"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setReplyDispositionFilter(d)}
                className={cn(
                  "hover-lift press-settle px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap",
                  replyDispositionFilter === d ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                {d === "all" ? `All (${replyCounts.all})` : `${REPLY_DISPOSITION_META[d].label} (${replyCounts[d]})`}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-900 dark:text-white">Replies</span>
                <span className="text-[10.5px] font-mono text-zinc-500">{filteredReplies.length} shown</span>
              </div>

              {filteredReplies.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No replies on file" description="Inbound replies will appear here once Reply Sort classifies them — interested and objection replies route to the Queue." />
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/40 max-h-[420px] overflow-y-auto">
                  {filteredReplies.map((r) => {
                    const meta = REPLY_DISPOSITION_META[r.disposition];
                    const isSelected = selectedReply?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedReplyId(r.id)}
                        className={cn(
                          "hover-lift press-settle flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-0",
                          isSelected ? "bg-zinc-100/80 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{r.leadEmail}</span>
                            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                            {r.routedToQueue && <StatusPill tone="info">Routed to Queue</StatusPill>}
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{r.rawBody}</p>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
                          <Clock size={9} />
                          {formatEntryTime(r.classifiedAt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedReply && (
              <div className="bg-transparent border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{selectedReply.leadEmail}</h4>
                    <span className="text-[10.5px] font-mono text-zinc-500">
                      {selectedReply.campaignId ?? "no campaign on file"} · classified via {selectedReply.classificationSource}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={REPLY_DISPOSITION_META[selectedReply.disposition].tone}>{REPLY_DISPOSITION_META[selectedReply.disposition].label}</StatusPill>
                    {selectedReply.routedToQueue && (
                      <a href="/dashboard/queue" className="flex items-center gap-1 text-[10.5px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-white underline underline-offset-2">
                        View in Queue <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{selectedReply.rawBody}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
