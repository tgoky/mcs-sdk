"use client";

// src/components/product-setup/cold-open-setup.tsx
//
// Cold Open's setup, one page, the same shape as Showtime's and
// Reputation Manager's:
//   welcome   the website (remembered) and the sending tool plus CRM
//             (already-connected ones show as such; one connection per
//             client serves every product)
//   working   "Set it up" streams its real steps
//   review    a findings report: what we read (site, outbound, CRM),
//             what we decided (offer, buyers, voice, subjects, emails,
//             campaigns, schedule), what's left before anything sends,
//             and Save. Live sending stays off until someone switches
//             it on in Daily Send — never as a side effect of Save.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  SearchX,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { COLD_OPEN_SEND_TOOLS, findSetupTool, findShowtimeTool } from "@/lib/showtime-setup/catalog";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { ColdOpenSetupState, TrustTier } from "@/lib/cold-open-setup/types";
import type { ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { anySkillDisplayName } from "@/lib/any-skill";
import { cn } from "@/lib/utils";
import { allTimezones, COMMON_TIMEZONES, isValidTimezone } from "@/lib/timezones";

// ── Skills ─────────────────────────────────────────────────────────────

const SETUP_SKILLS: ColdOpenSkillId[] = ["voice-capture", "source-connect", "send-connect"];
const RUN_SKILLS: ColdOpenSkillId[] = ["daily-send", "reply-sort", "send-report"];

const COLD_OPEN_FOCUS: Record<string, { rows: string[]; todos: string[]; save: boolean; about: string }> = {
  "icp-lock": {
    rows: ["site", "offer", "buyers", "crm"],
    todos: [],
    save: true,
    about: "What you sell, who buys it, and the past customers we learned it from.",
  },
  "voice-capture": {
    rows: ["voice", "subjects"],
    todos: [],
    save: true,
    about: "How your emails open, sign off, and sound, and which of your own subject lines we reuse.",
  },
  "send-connect": {
    rows: ["outbound", "campaign-"],
    todos: ["tool", "campaigns"],
    save: true,
    about: "Where your emails go out, and which campaign each group of buyers goes into.",
  },
  "source-connect": {
    rows: [],
    todos: [],
    save: false,
    about: "Where each group's leads come from. A list is used as soon as you add it.",
  },
  "daily-send": {
    rows: ["schedule", "emails"],
    todos: [],
    save: true,
    about: "How many new leads a day, when, and whether the emails are written per lead or sent as written. Live sending has its own switch.",
  },
  "reply-sort": {
    rows: ["outbound"],
    todos: ["tool"],
    save: false,
    about: "Sorts each reply as it comes in (interested, not now, not a fit, an objection, an auto-reply or an unsubscribe) and sends anything real to your Queue. There's nothing to set: it reads replies from your sending tool.",
  },
  "send-report": {
    rows: [],
    todos: [],
    save: false,
    about: "Sums up each week's sending: how many emails went out, what happened to them, and how people replied. There's nothing to set.",
  },
};

const STAGES: ActivationStage[] = [
  { label: "Reading the site", prefix: "" },
  { label: "What you sell and to whom", prefix: "found-" },
  { label: "Your past outreach and customers", prefix: "account-" },
  { label: "Matching campaigns", prefix: "match-" },
];

const HUBSPOT = findShowtimeTool("hubspot");
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

// ── Draft ──────────────────────────────────────────────────────────────

interface IcpDraft {
  slug: string;
  label: string;
  share: number;
  min: string;
  max: string;
  disqualifyIf: string[];
  evidence: string | null;
  tier: TrustTier;
}
interface Draft {
  domain: string;
  product: { name: string; url: string; price: string; valueProp: string };
  icps: IcpDraft[];
  voice: { greeting: string; signOff: string; tone: string };
  subjects: { value: string; source: string; replyRate: number | null; on: boolean }[];
  touchsets: ColdOpenSetupState["proposal"]["touchsets"];
  campaignMap: Record<string, string>;
  volume: number;
  localHour: number;
  timezone: string;
  copyMode: "generate" | "upload";
}

function draftFrom(s: ColdOpenSetupState, prevDomain?: string): Draft {
  const p = s.proposal;
  const total = p.icps.reduce((a, i) => a + i.weight, 0);
  return {
    domain: prevDomain || s.website.domain || "",
    product: { name: p.product.name.value, url: p.product.url.value, price: p.product.price.value, valueProp: p.product.valueProp.value },
    icps: p.icps.map((i) => ({
      slug: i.slug,
      label: i.label,
      share: Math.round((total > 0 ? i.weight / total : 1 / p.icps.length) * 100),
      min: i.teamSizeMin ? String(i.teamSizeMin) : "",
      max: i.teamSizeMax ? String(i.teamSizeMax) : "",
      disqualifyIf: i.disqualifyIf,
      evidence: i.evidence,
      tier: i.tier,
    })),
    voice: { greeting: p.voice.greeting.value, signOff: p.voice.signOff.value, tone: p.voice.tone.value },
    subjects: p.subjects.map((x) => ({ ...x })),
    touchsets: p.touchsets.map((t) => ({ ...t })),
    campaignMap: Object.fromEntries(Object.entries(p.campaignMap).flatMap(([slug, m]) => (m && m.tier !== "ask" ? [[slug, m.id]] : []))),
    volume: p.daily.volume,
    localHour: p.daily.localHour,
    timezone: p.daily.timezone ?? "",
    copyMode: p.daily.copyMode,
  };
}

function bareHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

/** What still stands between this client and a first send, in words. */
function stepsBeforeSending(data: ColdOpenSetupState, campaignMap: Record<string, string>): string[] {
  const out: string[] = [];
  const sending = data.tools.some((t) => t.group === "sending" && t.linked);
  if (!sending) out.push("connect a sending tool");
  else if (Object.keys(campaignMap).length === 0) out.push("pick a campaign for each buyer group");
  if (data.leadSources.length === 0) out.push("add a lead list");
  return out;
}

// ── Component ──────────────────────────────────────────────────────────

export function ColdOpenSetup({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Cancel",
  focus,
  leading,
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
  /** Opens as this one skill's own settings once Cold Open is set up: only
   * the rows it owns, saved without touching which skills are on. */
  focus?: string;
  /** The back chevron, when the caller renders one. Sits inline with the
   * title row so the header reads as one line, not two. */
  leading?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<ColdOpenSetupState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"welcome" | "working" | "review">("welcome");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [steps, setSteps] = useState<ActivationStep[]>([]);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const storageKey = `cold-open-setup:${engagementId}:domain`;
  // Which fields have been edited since load. Drives "unsaved changes"
  // without hashing the draft on every keystroke.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const markTouched = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));

  const load = useCallback(
    async (opts: { initial?: boolean; fresh?: boolean } = {}) => {
      const res = await fetch(`/api/engagements/${engagementId}/setup/cold-open`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load Cold Open's setup.");
      const next = body as ColdOpenSetupState;
      setData(next);
      setDraft((prev) => {
        let kept: string | undefined = prev?.domain;
        if (opts.initial) {
          try {
            kept = sessionStorage.getItem(storageKey) ?? undefined;
            sessionStorage.removeItem(storageKey);
          } catch {
            // nothing kept
          }
        }
        // A connect or disconnect only refreshes the tools; the review keeps its edits.
        return prev && !opts.initial && !opts.fresh ? { ...prev } : draftFrom(next, kept);
      });
      if (opts.initial) {
        setPhase(next.configured ? "review" : "welcome");
        setSkills(next.configured ? RUN_SKILLS.filter((id) => next.skills[id] !== false) : [...RUN_SKILLS]);
        setTouched(new Set());
      }
      return next;
    },
    [engagementId, storageKey]
  );

  useEffect(() => {
    void (async () => {
      try {
        await load({ initial: true });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load Cold Open's setup.");
      }
    })();
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("composio_connected");
    const failed = url.searchParams.get("composio_error");
    if (connected) toast.success(`${findSetupTool(connected)?.label ?? connected} connected.`);
    if (failed) toast.error(failed);
    if (connected || failed) {
      url.searchParams.delete("composio_connected");
      url.searchParams.delete("composio_error");
      window.history.replaceState(null, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const set = (fn: (d: Draft) => Draft, key?: string) => {
    if (key) markTouched(key);
    setDraft((d) => (d ? fn(d) : d));
  };

  // ── Tools: the same connect endpoint Showtime uses (one per client) ──
  async function post(path: string, body: unknown): Promise<string | null> {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? null : (json.error ?? "Something went wrong.");
  }
  const connectPath = `/api/engagements/${engagementId}/setup/showtime/connect`;
  const toolActions: ToolActions = {
    useSaved: async (tool, vaultId) => {
      const err = await post(connectPath, { provider: tool.provider, vaultId });
      if (!err) {
        markTouched("tools");
        await load().catch(() => undefined);
      }
      return err;
    },
    connectKey: async (tool, value, extra) => {
      const err = await post(connectPath, { provider: tool.provider, value, ...extra });
      if (!err) {
        markTouched("tools");
        toast.success(`${tool.label} connected.`);
        await load().catch(() => undefined);
      }
      return err;
    },
    signIn: async (tool) => {
      try {
        if (draft?.domain) sessionStorage.setItem(storageKey, draft.domain);
      } catch {
        // re-read on return
      }
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: tool.provider, returnTo: window.location.pathname, engagementId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.redirectUrl) return json.error ?? `Couldn't start signing in to ${tool.label}.`;
      window.location.assign(json.redirectUrl);
      return null;
    },
    disconnect: async (tool) => {
      const err = await post(connectPath, { provider: tool.provider, disconnect: true });
      if (!err) {
        markTouched("tools");
        await load().catch(() => undefined);
      }
      return err;
    },
    choose: () => undefined,
  };

  // ── Set it up ──
  async function activate() {
    if (!draft) return;
    setPhase("working");
    setSteps([]);
    setActivateError(null);
    setTimeout(() => document.getElementById("cold-open-progress")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/cold-open/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: draft.domain }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't start the setup.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as { type: string; step?: ActivationStep; error?: string };
          if (msg.type === "step" && msg.step) setSteps((s) => [...s, msg.step!]);
          if (msg.type === "error") setActivateError(msg.error ?? "Something went wrong.");
        }
      }
      await load({ fresh: true });
      await new Promise((r) => setTimeout(r, 700));
      setPhase("review");
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  // ── Save ──
  const onTouchsets = draft?.touchsets.filter((t) => t.on).length ?? 0;

  /** The fields the *focused* view actually needs. A focused save shouldn't
   * be blocked by requirements it doesn't own — the full setup does that. */
  const focusedMissing = useMemo(() => {
    if (!draft || !focus) return [] as string[];
    const m: string[] = [];
    const f = COLD_OPEN_FOCUS[focus];
    if (f?.rows.includes("offer")) {
      if (!draft.product.name.trim()) m.push("your product's name");
      if (!draft.product.url.trim()) m.push("its web address");
      if (!draft.product.valueProp.trim()) m.push("what it does for people");
    }
    if (f?.rows.includes("buyers") && !draft.icps.some((i) => i.label.trim())) m.push("who you sell to");
    if (f?.rows.includes("voice") && (!draft.voice.greeting.trim() || !draft.voice.signOff.trim() || !draft.voice.tone.trim())) m.push("how you write");
    if (draft.copyMode === "upload" && onTouchsets < 2) m.push("a second email to send as written");
    return m;
  }, [draft, focus, onTouchsets]);

  /** Everything the full setup needs. */
  const fullMissing = useMemo(() => {
    const m: string[] = [];
    if (!draft) return m;
    if (!draft.product.name.trim()) m.push("your product's name");
    if (!draft.product.url.trim()) m.push("its web address");
    if (!draft.product.valueProp.trim()) m.push("what it does for people");
    if (!draft.icps.some((i) => i.label.trim())) m.push("who you sell to");
    if (!draft.voice.greeting.trim() || !draft.voice.signOff.trim() || !draft.voice.tone.trim()) m.push("how you write");
    if (draft.copyMode === "upload" && onTouchsets < 2) m.push("a second email to send as written");
    return m;
  }, [draft, onTouchsets]);

  const settings = Boolean(focus && data?.configured);
  const missing = settings ? focusedMissing : fullMissing;
  const dirty = touched.size > 0;

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setSaveError(null);
    const icps = draft.icps.filter((i) => i.label.trim());
    const body = {
      product: draft.product,
      icps: icps.map((i) => ({
        slug: data.proposal.icps.some((x) => x.slug === i.slug) ? i.slug : "",
        label: i.label.trim(),
        weight: i.share,
        teamSizeMin: Number(i.min) || null,
        teamSizeMax: Number(i.max) || null,
        disqualifyIf: i.disqualifyIf,
      })),
      voice: draft.voice,
      subjects: draft.subjects.filter((s) => s.on).map((s) => s.value),
      touchsets: draft.touchsets.filter((t) => t.on).map(({ subject, body1, body2, body3 }) => ({ subject, body1, body2, body3 })),
      platform: data.proposal.platform,
      campaignMap: Object.fromEntries(Object.entries(draft.campaignMap).filter(([slug, id]) => id && icps.some((i) => i.slug === slug))),
      daily: { volume: draft.volume, localHour: draft.localHour, timezone: draft.timezone.trim() || null, copyMode: draft.copyMode },
      skills: [...SETUP_SKILLS, ...skills],
      ...(settings ? { settings: true } : {}),
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/cold-open/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.step ? `${json.step}: ${json.error}` : (json.error ?? "Couldn't save."));
      await load({ fresh: true }).catch(() => undefined);
      if (settings) {
        if (onSaved) onSaved({});
        else toast.success("Saved.");
        return;
      }
      const left = stepsBeforeSending(data, body.campaignMap as Record<string, string>);
      toast.success(left.length ? `Saved. Before anything sends: ${left.join(", ")}.` : "Saved. Nothing sends until you switch live sending on.");
      if (onSaved) onSaved({ runId: json.runId });
      else router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-sm text-[var(--error)]">{loadError}</p>
      </div>
    );
  }
  if (!data || !draft) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const toolRow = <ToolRow data={data} actions={toolActions} />;

  return (
    <div ref={topRef} className="@container w-full px-1">
      {phase === "review" ? (
        <div className="pb-16">
          <Review
            data={data}
            draft={draft}
            set={set}
            onReread={() => setPhase("welcome")}
            toolRow={toolRow}
            focus={settings ? focus : undefined}
            leading={leading}
            reload={() => load()}
          />
          {settings ? (
            COLD_OPEN_FOCUS[focus!]?.save ? (
              <ApproveBar
                label="Save"
                note={missing.length ? `Add ${missing.join(" and ")}, then save.` : dirty ? "Unsaved changes." : undefined}
                error={saveError}
                saving={saving}
                disabled={!dirty || missing.length > 0}
                onApprove={save}
                onCancel={onCancel}
                cancelLabel={cancelLabel}
              />
            ) : null
          ) : (
            <ApproveBar
              note={missing.length ? undefined : "Nothing sends until you switch live sending on."}
              error={saveError}
              saving={saving}
              disabled={missing.length > 0}
              onApprove={save}
              onCancel={onCancel}
              cancelLabel={cancelLabel}
            />
          )}
        </div>
      ) : (
        <Welcome
          data={data}
          draft={draft}
          setDomain={(v) => set((d) => ({ ...d, domain: v }))}
          toolRow={toolRow}
          working={phase === "working"}
          steps={steps}
          activateError={activateError}
          onActivate={activate}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          onBackToReview={data.configured ? () => setPhase("review") : undefined}
          leading={leading}
        />
      )}
    </div>
  );
}

// ── Shared header ──────────────────────────────────────────────────────

function ColdOpenMark({ size = 44 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-elevation-1 ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static product mark, same as the Library's */}
      <img src="/images/cold-open.svg" alt="" className="h-[82%] w-[82%] object-contain" />
    </span>
  );
}

/** One header, three sizes. Welcome, the full review, and a focused
 * skill's settings all use it, so the product mark appears once per visit
 * and the shape is the same at every step. */
function ColdOpenHeader({
  size = 44,
  eyebrow,
  title,
  subtitle,
  trailing,
  leading,
}: {
  size?: number;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-4">
      {leading && <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">{leading}</div>}
      <ColdOpenMark size={size} />
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p>}
        <h1
          className={cn(
            "font-semibold leading-tight tracking-tight text-[var(--text-primary)]",
            size === 44 ? "text-[24px] @xl:text-[28px]" : "text-[19px]",
          )}
        >
          {title}
        </h1>
        {subtitle && <div className="mt-1.5">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}

function ToolRow({ data, actions }: { data: ColdOpenSetupState; actions: ToolActions }) {
  const linkedSender = data.tools.find((t) => t.group === "sending" && t.linked);
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-4">
      {COLD_OPEN_SEND_TOOLS.map((tool) => {
        const state = data.tools.find((t) => t.provider === tool.provider);
        // One sending tool per client: the others stay out of the way once one is linked.
        const dim = Boolean(linkedSender && !state?.linked);
        return (
          <div key={tool.provider} className={cn("flex w-[72px] flex-col items-center", dim && "opacity-40")} title="Sends your cold email">
            <ToolAvatar tool={tool} state={state} selected={Boolean(state?.linked)} buyer={data.buyer} actions={actions} />
          </div>
        );
      })}
      {HUBSPOT && (
        <div className="flex w-[72px] flex-col items-center border-l pl-5" title="Shows who really buys from you">
          <ToolAvatar tool={HUBSPOT} state={data.tools.find((t) => t.provider === HUBSPOT.provider)} selected={Boolean(data.crm)} buyer={data.buyer} actions={actions} />
        </div>
      )}
    </div>
  );
}

function Welcome({
  data,
  draft,
  setDomain,
  toolRow,
  working,
  steps,
  activateError,
  onActivate,
  onCancel,
  cancelLabel,
  onBackToReview,
  leading,
}: {
  data: ColdOpenSetupState;
  draft: Draft;
  setDomain: (v: string) => void;
  toolRow: ReactNode;
  working: boolean;
  steps: ActivationStep[];
  activateError: string | null;
  onActivate: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onBackToReview?: () => void;
  leading?: ReactNode;
}) {
  const host = bareHost(draft.domain);
  const known = Boolean(data.website.domain) && bareHost(data.website.domain ?? "") === host;
  const sender = data.tools.find((t) => t.group === "sending" && t.linked);
  return (
    <div className="space-y-9">
      <ColdOpenHeader
        leading={leading}
        eyebrow="Cold Open"
        title={`Cold email for ${data.buyer}`}
        subtitle={
          <p className="max-w-xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            We learn what you sell, who buys it, and what has already worked in your outreach, then set up the daily sending. You check our work, and nothing goes out until you say so.
          </p>
        }
      />

      <section className={cn("space-y-2.5 transition-opacity", working && "pointer-events-none opacity-60")}>
        <label htmlFor="cold-open-website" className="flex items-baseline gap-2 text-sm font-medium text-[var(--text-primary)]">
          Your website
          <span className="text-xs font-normal text-[var(--text-muted)]">Where we learn your product, buyers and voice</span>
        </label>
        <div className="flex h-14 items-center border border-[var(--text-muted)]/40 bg-background transition-colors focus-within:border-[var(--text-primary)] dark:border-white/15">
          <span className="select-none pl-4 text-lg text-[var(--text-muted)]">https://</span>
          <input
            id="cold-open-website"
            value={draft.domain.replace(/^https?:\/\//i, "")}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onActivate()}
            placeholder="yourwebsite.com"
            autoComplete="url"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent pr-4 pl-0.5 text-lg text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/60"
          />
        </div>
        {known && (
          <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-prefill-accent)]">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {data.website.readAt ? "We already read this site, so this is quick." : `Already on file for ${data.buyer}.`}
          </p>
        )}
      </section>

      <section className={cn("space-y-4 transition-opacity", working && "pointer-events-none opacity-60")}>
        <div>
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Your sending tool</h2>
          <p className="mt-0.5 max-w-xl text-[13px] text-[var(--text-muted)]">
            {sender
              ? `${findSetupTool(sender.provider)?.label ?? "It"} is already connected for ${data.buyer}, so there's nothing to redo. `
              : "Where your cold email goes out. "}
            We read your past campaigns, the subject lines and emails that got replies, and how much your mailboxes can send. HubSpot, if you use it, shows who really buys.
          </p>
        </div>
        {toolRow}
      </section>

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="progress" id="cold-open-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ActivationProgress stages={STAGES} steps={steps} working={!activateError} host={host} error={activateError} onRetry={onActivate} />
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate}>
                Set it up <ArrowUpRight />
              </Button>
              <p className="text-[13px] text-[var(--text-muted)]">About a minute. Nothing is sent.</p>
              <span className="ml-auto flex items-center gap-4">
                {onBackToReview && (
                  <button type="button" onClick={onBackToReview} className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                    Back to review
                  </button>
                )}
                <button type="button" onClick={onCancel} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                  {cancelLabel}
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

// ── State marks ────────────────────────────────────────────────────────

function FoundMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
      <Check className="h-3 w-3" strokeWidth={3.5} />
    </span>
  );
}
function DecidedMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-secondary)]">
      <Sparkles className="h-4 w-4" />
    </span>
  );
}
function MissingMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
      <Minus className="h-4 w-4" />
    </span>
  );
}
function WarnMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--error)]">
      <AlertTriangle className="h-4 w-4" />
    </span>
  );
}
function NotFoundMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
      <SearchX className="h-4 w-4" />
    </span>
  );
}

function markFor(kind: "found" | "decided" | "missing" | "warn" | "notfound") {
  switch (kind) {
    case "found": return <FoundMark />;
    case "decided": return <DecidedMark />;
    case "missing": return <MissingMark />;
    case "warn": return <WarnMark />;
    case "notfound": return <NotFoundMark />;
  }
}

// ── Rows ───────────────────────────────────────────────────────────────
//
// A finding is read-only-ish: something we learned, with its source.
// A decision is editable: what the person is being asked to confirm, with
// a "Change" on the right. A state is a fact about the wiring (sending
// through X, drafts only). Three registers, one row shape.

function Row({
  kind,
  count,
  noun,
  text,
  source,
  action,
  body,
  onOpen,
  open,
}: {
  kind: "found" | "decided" | "missing" | "warn";
  /** The headline number, when the count is the point. */
  count?: number;
  /** What we're counting. */
  noun?: string;
  /** The sentence. */
  text: ReactNode;
  /** Where the value came from. */
  source?: ReactNode;
  /** A "Change" affordance on the right. */
  action?: { label: string; onClick: () => void };
  /** The chips, list, or sub-editor underneath. */
  body?: ReactNode;
  /** When present, the row is a disclosure whose body opens on click. */
  onOpen?: () => void;
  open?: boolean;
}) {
  const clickable = Boolean(onOpen);
  return (
    <li className="flex gap-3 py-5">
      {markFor(kind)}
      <div className="min-w-0 flex-1">
        {typeof count === "number" ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-[26px] font-semibold leading-none tabular-nums tracking-tight text-[var(--text-primary)]">{count}</span>
              {noun && <span className="text-[14px] font-medium text-[var(--text-primary)]">{noun}</span>}
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{text}</p>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            disabled={!clickable}
            className={cn("block w-full text-left text-[15px] leading-snug text-[var(--text-secondary)]", clickable && "cursor-pointer")}
          >
            {text}
          </button>
        )}
        {source && <p className="mt-1 text-[12px] text-[var(--text-muted)]">{source}</p>}
        {body && <div className="mt-2.5">{body}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 self-start pt-1 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </li>
  );
}

// ── Chips ──────────────────────────────────────────────────────────────

function Chip({
  on,
  title,
  onClick,
  children,
}: {
  on: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors",
        on ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" : "border-dashed border-[var(--border)] text-[var(--text-muted)] line-through",
      )}
    >
      <button type="button" onClick={onClick} title={title} className="min-w-0 truncate cursor-pointer">
        {children}
      </button>
    </span>
  );
}

function ChipRow({
  items,
  onToggle,
  onAdd,
  addLabel,
}: {
  items: { value: string; on: boolean; hint?: string }[];
  onToggle: (i: number) => void;
  onAdd?: (value: string) => void;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((x, i) => (
        <Chip key={`${x.value}-${i}`} on={x.on} title={x.hint} onClick={() => onToggle(i)}>
          {x.value}
        </Chip>
      ))}
      {onAdd && addLabel && (adding ? (
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            if (v.trim()) onAdd(v);
            setV("");
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (v.trim()) onAdd(v);
              setV("");
              setAdding(false);
            }
            if (e.key === "Escape") {
              setV("");
              setAdding(false);
            }
          }}
          className="h-7 w-40 rounded-full border border-[var(--border)] bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-[13px] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
        >
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      ))}
    </div>
  );
}

// ── Popover ────────────────────────────────────────────────────────────

function Popover({
  label,
  title,
  strong,
  children,
}: {
  label: string;
  title: string;
  strong?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "text-[13px] font-medium underline decoration-dashed underline-offset-4 cursor-pointer",
          strong ? "text-[var(--text-primary)] decoration-[var(--text-muted)]" : "text-[var(--text-secondary)] decoration-[var(--border)] hover:text-[var(--text-primary)]",
        )}
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[340px] max-w-[85vw] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-elevation-2">
          <p className="mb-2.5 text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ── Still needed ───────────────────────────────────────────────────────

function StillNeeded({ items }: { items: { key: string; label: string; action: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-prefill)]/60 p-4 @md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
          <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
          {items.length === 1 ? "One thing still needed" : `${items.length} things still needed`}
        </h2>
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <p className="min-w-0 text-[14px] leading-relaxed text-[var(--text-secondary)]">{it.label}</p>
            <div className="shrink-0">{it.action}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Left to do ─────────────────────────────────────────────────────────

function TodoRow({
  done,
  optional,
  label,
  action,
}: {
  done: boolean;
  optional?: boolean;
  label: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          done ? "bg-[var(--ink)] text-[var(--ink-foreground)]" : "ring-1 ring-inset ring-[var(--text-muted)]/50",
        )}
      >
        {done && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      <span className={cn("min-w-0 flex-1 text-[14px]", done ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>
        {label}
        {optional && !done && <span className="ml-1.5 text-[12px] text-[var(--text-muted)]">Optional</span>}
      </span>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

// ── Review ─────────────────────────────────────────────────────────────

function Review({
  data,
  draft,
  set,
  onReread,
  toolRow,
  focus,
  leading,
  reload,
}: {
  data: ColdOpenSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft, key?: string) => void;
  onReread: () => void;
  toolRow: ReactNode;
  focus?: string;
  leading?: ReactNode;
  reload: () => Promise<unknown>;
}) {
  const p = data.proposal;
  const out = data.outbound;
  const initial = useMemo(() => draftFrom(data), [data]);
  const icps = draft.icps.filter((i) => i.label.trim());
  const platformName = out ? (findSetupTool(`cold_open_${out.platform}`)?.label ?? out.platform) : null;
  const sendingLinked = data.tools.some((t) => t.group === "sending" && t.linked);
  const campaigns = out?.campaigns ?? [];
  const unmapped = icps.filter((i) => !draft.campaignMap[i.slug]);
  const bridge = (worker: string) => `/dashboard/engagements/${data.engagementId}/bridges/${worker}`;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const from = (source: string) =>
    source === "saved" ? "Saved" : source === "a common default" ? "A starting point. Change it anytime." : source ? `From ${source}` : "";

  // ── Findings: what we read. Read-only-ish, cited. ──
  const findings: ReactNode[] = [];
  const notFound: { key: string; noun: string; addLabel: string; onAdd: () => void }[] = [];

  if (data.website.domain) {
    findings.push(
      <Row
        key="site"
        kind="found"
        text={<>Read <span className="font-semibold text-[var(--text-primary)]">{data.website.domain}</span></>}
        source={data.website.readAt ? `Read ${new Date(data.website.readAt).toLocaleDateString()}` : undefined}
      />,
    );
  }

  if (out) {
    findings.push(
      <Row
        key="outbound"
        kind="found"
        text={
          <>
            Read {platformName}: <span className="font-semibold text-[var(--text-primary)]">{out.campaigns.length} campaigns</span>
            {out.overallReplyRate != null ? <>, <span className="font-semibold text-[var(--text-primary)]">{out.overallReplyRate}%</span> replied</> : null}
            {out.capacity != null ? <>, mailboxes send up to <span className="font-semibold text-[var(--text-primary)]">{out.capacity} a day</span></> : null}
          </>
        }
        source={`Read ${new Date(out.pulledAt).toLocaleDateString()}`}
      />,
    );
    for (const d of out.domains.filter((x) => !x.ok)) {
      findings.push(
        <Row
          key={`dns-${d.domain}`}
          kind="warn"
          text={
            <>
              <span className="font-semibold text-[var(--text-primary)]">{d.domain}</span> is missing email records: {d.problems.join(" ")}
            </>
          }
          source="Fix before sending more"
        />,
      );
    }
  }

  if (data.buyers) {
    const b = data.buyers;
    findings.push(
      <Row
        key="crm"
        kind="found"
        text={
          <>
            Your <span className="font-semibold text-[var(--text-primary)]">{b.companies} customers</span> in HubSpot are mostly{" "}
            {b.industries[0] ? <span className="font-semibold text-[var(--text-primary)]">{b.industries[0].industry}</span> : "varied"}
            {b.sweetSpot ? <>, <span className="font-semibold text-[var(--text-primary)]">{b.sweetSpot.min}{b.sweetSpot.max ? `-${b.sweetSpot.max}` : "+"} people</span></> : null}
          </>
        }
        source={`${b.wonDeals} won deals`}
      />,
    );
  }

  // ── Decisions: what the person is being asked to confirm. Editable. ──
  const decisions: ReactNode[] = [];

  const offerEditor = (close: () => void) => (
    <OfferEditor
      value={draft.product}
      onSave={(v) => {
        set((d) => ({ ...d, product: v }), "offer");
        close();
      }}
    />
  );
  if (draft.product.name.trim()) {
    decisions.push(
      <Row
        key="offer"
        kind={draft.product.valueProp.trim() ? "decided" : "missing"}
        text={
          <>
            Your offer is <span className="font-semibold text-[var(--text-primary)]">{draft.product.name}</span>
            {draft.product.price ? <> at <span className="font-semibold text-[var(--text-primary)]">{draft.product.price}</span></> : null}
            {draft.product.valueProp ? (
              <span className="mt-1 block text-[13px] text-[var(--text-muted)]">{draft.product.valueProp}</span>
            ) : (
              <span className="mt-1 block text-[13px] text-[var(--text-muted)]">We still need a line on what it does for people.</span>
            )}
          </>
        }
        source={from(p.product.name.source)}
        action={{ label: "Change", onClick: () => {} }}
        body={null}
      />,
    );
    // The editor is opened by the "Change" action, but Row's action button
    // doesn't carry an editor. Wrap with a Popover for these.
  } else {
    notFound.push({ key: "offer", noun: "your product", addLabel: "Add", onAdd: onReread });
  }

  const buyersEditor = (close: () => void) => (
    <BuyersEditor
      value={draft.icps}
      showShare={icps.length > 1}
      onSave={(list) => {
        set((d) => ({ ...d, icps: list }), "buyers");
        close();
      }}
    />
  );
  if (icps.length) {
    decisions.push(
      <Row
        key="buyers"
        kind="decided"
        text={
          <>
            Writing to{" "}
            {icps.map((i, n) => (
              <span key={i.slug}>
                {n > 0 ? (n === icps.length - 1 ? " and " : ", ") : ""}
                <span className="font-semibold text-[var(--text-primary)]">{i.label}</span>
                {i.min || i.max ? ` (${i.min || "1"}${i.max ? `-${i.max}` : "+"} people)` : ""}
              </span>
            ))}
          </>
        }
        source={icps[0].evidence ?? (icps[0].tier === "done" ? "Saved" : "From your website")}
      />,
    );
  } else {
    notFound.push({ key: "buyers", noun: "buyer groups", addLabel: "Add", onAdd: onReread });
  }

  decisions.push(
    <Row
      key="voice"
      kind="decided"
      text={
        <>
          Emails open with <span className="font-semibold text-[var(--text-primary)]">&ldquo;{draft.voice.greeting || "Hi"}&rdquo;</span>, sign off{" "}
          <span className="font-semibold text-[var(--text-primary)]">&ldquo;{draft.voice.signOff || "Best,"}&rdquo;</span> and sound{" "}
          <span className="font-semibold text-[var(--text-primary)]">{draft.voice.tone.toLowerCase() || "plain"}</span>
        </>
      }
      source={from(p.voice.tone.source)}
    />,
  );

  const subjectsOn = draft.subjects.filter((x) => x.on).length;
  if (draft.subjects.length || focus === "voice-capture") {
    decisions.push(
      <Row
        key="subjects"
        kind="decided"
        text={subjectsOn
          ? <>Reusing <span className="font-semibold text-[var(--text-primary)]">{subjectsOn} of your best subject lines</span></>
          : <>No subject lines of your own, so each lead gets one written for them</>}
        source={draft.subjects.length ? (platformName ? `From ${platformName}` : "Saved") : undefined}
        body={
          focus ? (
            <ChipRow
              items={draft.subjects.map((x) => ({ value: x.value, on: x.on, hint: x.replyRate != null ? `${x.replyRate}% replied` : undefined }))}
              onToggle={(i) => set((d) => ({ ...d, subjects: d.subjects.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }), "subjects")}
              onAdd={(v) =>
                set(
                  (d) => (d.subjects.some((x) => x.value.toLowerCase() === v.toLowerCase()) ? d : { ...d, subjects: [...d.subjects, { value: v, source: "you", replyRate: null, on: true }] }),
                  "subjects",
                )
              }
              addLabel="Add a subject line"
            />
          ) : undefined
        }
      />,
    );
  }

  const ownOn = draft.touchsets.filter((t) => t.on).length;
  decisions.push(
    <Row
      key="emails"
      kind="decided"
      text={
        draft.copyMode === "upload" ? (
          <>Sending <span className="font-semibold text-[var(--text-primary)]">{ownOn} of your own sequences</span> as written</>
        ) : (
          <>Writing <span className="font-semibold text-[var(--text-primary)]">fresh emails for each lead</span>, three per person</>
        )
      }
      source={draft.copyMode === "upload" ? `From ${platformName ?? "your saved emails"}` : ""}
    />,
  );

  for (const i of icps.filter((x) => draft.campaignMap[x.slug])) {
    const c = campaigns.find((x) => x.id === draft.campaignMap[i.slug]);
    decisions.push(
      <Row
        key={`campaign-${i.slug}`}
        kind="decided"
        text={
          <>
            <span className="font-semibold text-[var(--text-primary)]">{i.label}</span> go into <span className="font-semibold text-[var(--text-primary)]">{c?.name ?? "a campaign"}</span>
          </>
        }
        source={p.campaignMap[i.slug]?.id === draft.campaignMap[i.slug] ? "Matched by Jev" : ""}
      />,
    );
  }

  decisions.push(
    <Row
      key="schedule"
      kind="decided"
      text={
        <>
          <span className="font-semibold text-[var(--text-primary)]">{draft.volume} new leads a day</span> at{" "}
          <span className="font-semibold text-[var(--text-primary)]">{hourLabel(draft.localHour)}</span>
          {draft.timezone ? <> {draft.timezone.replace(/_/g, " ")}</> : null}
        </>
      }
      source={p.daily.volumeSource === "saved" ? "Saved" : p.daily.volumeSource.charAt(0).toUpperCase() + p.daily.volumeSource.slice(1)}
    />,
  );

  // ── Left to do ──
  const todos: { key: string; label: ReactNode; done: boolean; optional?: boolean; action?: ReactNode }[] = [
    {
      key: "tool",
      label: sendingLinked ? `Sending through ${platformName ?? "your tool"}` : "Connect your sending tool",
      done: sendingLinked,
      action: sendingLinked ? null : (
        <Popover label="Connect" title="Your sending tool" strong>
          {() => <div className="py-1">{toolRow}</div>}
        </Popover>
      ),
    },
  ];
  if (sendingLinked && icps.length) {
    todos.push({
      key: "campaigns",
      label: unmapped.length ? `Choose a campaign for ${unmapped.map((i) => i.label).join(" and ")}` : "Each group has a campaign",
      done: unmapped.length === 0,
      action:
        unmapped.length && campaigns.length ? (
          <Popover label="Choose" title={`Campaign for ${unmapped[0].label}`} strong>
            {(close) => (
              <CampaignPicker
                campaigns={campaigns}
                value={null}
                onPick={(v) => {
                  set((d) => ({ ...d, campaignMap: { ...d.campaignMap, [unmapped[0].slug]: v } }), "campaigns");
                  close();
                }}
              />
            )}
          </Popover>
        ) : null,
    });
  }
  todos.push({
    key: "leads",
    label: data.leadSources.length ? `Leads from ${data.leadSources.map((l) => l.icp).join(", ")}` : "Add a lead list",
    done: data.leadSources.length > 0,
    action: data.leadSources.length ? null : (
      <a href={bridge("source-connect")} className="text-[13px] font-medium text-[var(--text-primary)] underline underline-offset-4">
        Add
      </a>
    ),
  });
  todos.push({
    key: "live",
    label: p.daily.liveSendEnabled ? "Live sending is on" : "Switch on live sending when you're ready (until then, emails are drafts)",
    done: p.daily.liveSendEnabled,
    action: p.daily.liveSendEnabled ? null : (
      <a href={bridge("daily-send")} className="text-[13px] text-[var(--text-muted)] underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)]">
        Later
      </a>
    ),
  });
  const ready = todos.filter((t) => t.key !== "live").every((t) => t.done);

  // ── Focused view: a skill's own settings. ──
  if (focus) {
    const f = COLD_OPEN_FOCUS[focus] ?? { rows: [], todos: [], save: false, about: "" };
    const rowKeys = new Set(f.rows);
    const shownFindings = findings.filter((n) => rowKeys.has((n as any)?.key));
    const shownDecisions = decisions.filter((n) => rowKeys.has((n as any)?.key) || f.rows.some((r) => r.endsWith("-") && String((n as any)?.key ?? "").startsWith(r)));
    const shownTodos = todos.filter((t) => f.todos.includes(t.key));
    const own = focus === "source-connect" || focus === "daily-send";
    return (
      <div className="space-y-8 pb-10">
        <ColdOpenHeader
          size={36}
          leading={leading}
          eyebrow="Cold Open"
          title={anySkillDisplayName(focus)}
          subtitle={<p className="text-[14px] leading-relaxed text-[var(--text-secondary)]">{f.about}</p>}
          trailing={
            <a
              href={bridge("icp-lock")}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Full setup <ArrowUpRight className="h-3 w-3" />
            </a>
          }
        />
        {(shownFindings.length > 0 || shownDecisions.length > 0 || own) && (
          <ul className="divide-y">
            {shownFindings}
            {shownDecisions}
            {focus === "source-connect" && <LeadLists engagementId={data.engagementId} icps={icps} />}
            {focus === "daily-send" && (
              <>
                <LiveSending engagementId={data.engagementId} daily={p.daily} onChanged={reload} />
                <HeldLeads engagementId={data.engagementId} />
              </>
            )}
          </ul>
        )}
        {shownTodos.length > 0 && (
          <section className="space-y-2 border-t pt-5">
            <h2 className="text-[13px] font-medium text-[var(--text-secondary)]">Left to do</h2>
            <ul className="divide-y">
              {shownTodos.map((t) => (
                <TodoRow key={t.key} done={t.done} optional={t.optional} label={t.label} action={t.action} />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ── Full review. ──
  const sendingLabel = p.daily.liveSendEnabled ? "Sending" : "Drafts only";
  const stateWord = ready ? sendingLabel : "Not sending yet";
  const needed: { key: string; label: string; action: ReactNode }[] = [];
  if (!draft.product.name.trim() || !draft.product.valueProp.trim()) {
    needed.push({
      key: "offer",
      label: "We couldn't fully read your offer. Add what you sell and what it does.",
      action: (
        <Popover label="Edit" title="Your offer" strong>
          {(close) => <OfferEditor value={draft.product} onSave={(v) => (set((d) => ({ ...d, product: v }), "offer"), close())} />}
        </Popover>
      ),
    });
  }
  if (icps.length === 0) {
    needed.push({
      key: "buyers",
      label: "Say who you sell to — one or more groups.",
      action: (
        <Popover label="Add" title="Who you sell to" strong>
          {(close) => (
            <BuyersEditor
              value={draft.icps}
              showShare={false}
              onSave={(list) => {
                set((d) => ({ ...d, icps: list }), "buyers");
                close();
              }}
            />
          )}
        </Popover>
      ),
    });
  }
  if (!draft.voice.greeting.trim() || !draft.voice.signOff.trim() || !draft.voice.tone.trim()) {
    needed.push({
      key: "voice",
      label: "Set how the emails open, sign off and sound.",
      action: (
        <Popover label="Edit" title="How you write" strong>
          {(close) => <VoiceEditor value={draft.voice} onSave={(v) => (set((d) => ({ ...d, voice: v }), "voice"), close())} />}
        </Popover>
      ),
    });
  }

  return (
    <div className="space-y-8 pb-4">
      <ColdOpenHeader
        size={44}
        leading={leading}
        eyebrow="Cold Open"
        title={
          <>
            {draft.product.name || "Your offer"} <span className="text-[var(--text-muted)]">to</span> {icps.map((i) => i.label).join(" and ") || "your buyers"}
          </>
        }
        subtitle={
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Send className="h-3 w-3" />
              {stateWord}
            </span>
            <span aria-hidden>·</span>
            <span>{draft.volume} a day at {hourLabel(draft.localHour)}</span>
            <span aria-hidden>·</span>
            <span>Sounds {draft.voice.tone.toLowerCase() || "plain"}</span>
            <span aria-hidden>·</span>
            <span>{draft.copyMode === "upload" ? "Your own emails" : "Written per lead"}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={onReread}
              className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" /> Read again
            </button>
          </p>
        }
      />

      <StillNeeded items={needed} />

      {findings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">What we read</h2>
          <ul className="divide-y">{findings}</ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">What we decided</h2>
          <p className="text-[12px] text-[var(--text-muted)]">Tap any value to change it.</p>
        </div>
        <ul className="divide-y">{decisions}</ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{ready ? "Ready" : "Left to do"}</h2>
        <ul className="divide-y">
          {todos.map((t) => (
            <TodoRow key={t.key} done={t.done} optional={t.optional} label={t.label} action={t.action} />
          ))}
        </ul>
      </section>
    </div>
  );
}

// ── Editors ────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-background px-3 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40";

function Labeled({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function OfferEditor({ value, onSave }: { value: Draft["product"]; onSave: (v: Draft["product"]) => void }) {
  const [v, setV] = useState(value);
  const up = (k: keyof Draft["product"]) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => (e.preventDefault(), onSave({ ...v, name: v.name.trim(), price: v.price.trim(), valueProp: v.valueProp.trim(), url: v.url.trim() }))}
      className="space-y-3"
    >
      <Labeled label="What you sell">
        <input autoFocus value={v.name} onChange={up("name")} className={cn(inputCls, "h-10")} />
      </Labeled>
      <Labeled label="What it does for people">
        <textarea value={v.valueProp} onChange={up("valueProp")} rows={2} className={cn(inputCls, "resize-none py-2 leading-relaxed")} />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Price (optional)">
          <input value={v.price} onChange={up("price")} className={cn(inputCls, "h-10")} />
        </Labeled>
        <Labeled label="Links go to">
          <input value={v.url} onChange={up("url")} className={cn(inputCls, "h-10")} />
        </Labeled>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!v.name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function VoiceEditor({ value, onSave }: { value: Draft["voice"]; onSave: (v: Draft["voice"]) => void }) {
  const [v, setV] = useState(value);
  return (
    <form onSubmit={(e) => (e.preventDefault(), onSave({ greeting: v.greeting.trim(), signOff: v.signOff.trim(), tone: v.tone.trim() }))} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Opens with">
          <input autoFocus value={v.greeting} onChange={(e) => setV((x) => ({ ...x, greeting: e.target.value }))} placeholder="Hi" className={cn(inputCls, "h-10")} />
        </Labeled>
        <Labeled label="Signs off">
          <input value={v.signOff} onChange={(e) => setV((x) => ({ ...x, signOff: e.target.value }))} placeholder="Best," className={cn(inputCls, "h-10")} />
        </Labeled>
      </div>
      <Labeled label="Sounds">
        <input value={v.tone} onChange={(e) => setV((x) => ({ ...x, tone: e.target.value }))} placeholder="Plain and friendly" className={cn(inputCls, "h-10")} />
      </Labeled>
      <p className="text-[12px] text-[var(--text-muted)]">Their first name goes after the greeting.</p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!v.greeting.trim() || !v.signOff.trim() || !v.tone.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function BuyersEditor({ value, showShare, onSave }: { value: IcpDraft[]; showShare: boolean; onSave: (v: IcpDraft[]) => void }) {
  const [list, setList] = useState<IcpDraft[]>(() =>
    value.length ? value : [{ slug: `icp-${Date.now().toString(36)}`, label: "", share: 100, min: "", max: "", disqualifyIf: [], evidence: null, tier: "done" }],
  );
  const up = (i: number, patch: Partial<IcpDraft>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch, tier: "done" } : x)));
  const many = showShare || list.length > 1;
  return (
    <form
      onSubmit={(e) => (e.preventDefault(), onSave(list.filter((x) => x.label.trim()).map((x) => ({ ...x, label: x.label.trim() }))))}
      className="space-y-3"
    >
      {list.map((g, i) => (
        <div key={g.slug} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <input autoFocus={i === 0} value={g.label} onChange={(e) => up(i, { label: e.target.value })} placeholder="e.g. Marketing agencies" className={cn(inputCls, "h-9")} />
            <button
              type="button"
              aria-label="Remove"
              onClick={() => setList((l) => l.filter((_, j) => j !== i))}
              className="text-[var(--text-muted)] hover:text-[var(--error)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <input
              inputMode="numeric"
              value={g.min}
              onChange={(e) => up(i, { min: e.target.value.replace(/\D/g, "") })}
              placeholder="any"
              className={cn(inputCls, "h-8 w-14 px-2 text-center")}
            />
            to
            <input
              inputMode="numeric"
              value={g.max}
              onChange={(e) => up(i, { max: e.target.value.replace(/\D/g, "") })}
              placeholder="any"
              className={cn(inputCls, "h-8 w-14 px-2 text-center")}
            />
            people
            {many && (
              <>
                <span className="ml-auto" />
                <input
                  inputMode="numeric"
                  value={String(g.share)}
                  onChange={(e) => up(i, { share: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  className={cn(inputCls, "h-8 w-12 px-2 text-center")}
                />
                % of leads
              </>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setList((l) => [...l, { slug: `icp-${Date.now().toString(36)}`, label: "", share: 0, min: "", max: "", disqualifyIf: [], evidence: null, tier: "done" }])
          }
          className="inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Plus className="h-3 w-3" /> Another group
        </button>
        <Button type="submit" size="sm" disabled={!list.some((x) => x.label.trim())}>
          Save
        </Button>
      </div>
    </form>
  );
}

function ScheduleEditor({ value, onSave }: { value: { volume: number; localHour: number; timezone: string }; onSave: (v: { volume: number; localHour: number; timezone: string }) => void }) {
  const [v, setV] = useState({ ...value, volume: String(value.volume) });
  return (
    <form
      onSubmit={(e) =>
        (e.preventDefault(),
        onSave({ volume: Math.max(1, Math.min(500, Number(v.volume) || value.volume)), localHour: v.localHour, timezone: v.timezone.trim() }))
      }
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="New leads a day">
          <input autoFocus inputMode="numeric" value={v.volume} onChange={(e) => setV((x) => ({ ...x, volume: e.target.value.replace(/\D/g, "") }))} className={cn(inputCls, "h-10")} />
        </Labeled>
        <Labeled label="Queued at">
          <select value={v.localHour} onChange={(e) => setV((x) => ({ ...x, localHour: Number(e.target.value) }))} className={cn(inputCls, "h-10 cursor-pointer")}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </Labeled>
      </div>
      <Labeled label="Time zone">
        <select value={v.timezone} onChange={(e) => setV((x) => ({ ...x, timezone: e.target.value }))} className={cn(inputCls, "h-10")}>
          <option value="">The client&apos;s time zone</option>
          {v.timezone && !isValidTimezone(v.timezone) && <option value={v.timezone}>{v.timezone} (not recognized)</option>}
          {[...COMMON_TIMEZONES.map((z) => z.value), ...allTimezones().filter((z) => !COMMON_TIMEZONES.some((c) => c.value === z))].map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Labeled>
      <div className="flex justify-end">
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}

function CampaignPicker({ campaigns, value, onPick }: { campaigns: { id: string; name: string; replyRate: number | null }[]; value: string | null | undefined; onPick: (id: string) => void }) {
  return (
    <ul className="space-y-1">
      {campaigns.map((c) => {
        const active = value === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className={cn(
                "flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--accent-dim)] cursor-pointer",
                active && "bg-[var(--accent-dim)]",
              )}
            >
              <span className="min-w-0 truncate text-[var(--text-primary)]">{c.name}</span>
              {c.replyRate != null && <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{c.replyRate}% replied</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Lead lists (Source Connect) ────────────────────────────────────────

interface LeadSource {
  icp: string;
  fetcherType: "csv" | "apify" | "sales_nav";
  dailyLimit?: number;
  csvContent?: string;
  csvMapping?: Record<string, string>;
  apifyActorId?: string;
  salesNavExportNote?: string;
}

const csvRows = (text?: string) => (text ? Math.max(0, text.trim().split(/\r?\n/).length - 1) : 0);
const csvHeader = (text: string) =>
  (text.split(/\r?\n/)[0] ?? "")
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

function guessColumns(headers: string[]): Record<string, string> {
  const find = (re: RegExp) => headers.find((h) => re.test(h));
  const out: Record<string, string> = {};
  const pairs: [string, RegExp][] = [
    ["email", /e-?mail/i],
    ["companyName", /company|organi[sz]ation|account|business/i],
    ["firstName", /first/i],
    ["lastName", /last|surname/i],
  ];
  for (const [field, re] of pairs) {
    const h = find(re);
    if (h) out[field] = h;
  }
  return out;
}

function describeSource(s: LeadSource): string {
  if (s.fetcherType === "csv") return `${csvRows(s.csvContent).toLocaleString()} people from a CSV`;
  if (s.fetcherType === "apify") return `pulled from the Apify actor ${s.apifyActorId ?? ""}`.trim();
  return "from a Sales Navigator export";
}

function LeadLists({ engagementId, icps }: { engagementId: string; icps: { slug: string; label: string }[] }) {
  const toast = useToast();
  const url = `/api/engagements/${engagementId}/bridges/source-connect`;
  const [state, setState] = useState<{ sources: LeadSource[]; apifyConnected: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Couldn't load your lead lists.");
        setState({ sources: body.leadSources ?? [], apifyConnected: body.defaultFetcherType === "apify" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your lead lists.");
      }
    })();
  }, [url]);

  async function put(slug: string, source: Omit<LeadSource, "icp"> | null): Promise<string | null> {
    if (!state) return "Still loading.";
    const next = [...state.sources.filter((s) => s.icp !== slug), ...(source ? [{ ...source, icp: slug }] : [])];
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadSources: next }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return body.error ?? "Couldn't save the list.";
    setState((s) => (s ? { sources: next, apifyConnected: s.apifyConnected || source?.fetcherType === "apify" } : s));
    toast.success(source ? "Lead list saved." : "Lead list removed.");
    return null;
  }

  if (error) return <li className="py-3 text-sm text-[var(--error)]">{error}</li>;
  if (!state) {
    return (
      <li className="py-3 text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </li>
    );
  }
  if (icps.length === 0) {
    return (
      <li className="flex gap-3 py-5">
        <MissingMark />
        <p className="text-[15px] leading-snug text-[var(--text-secondary)]">Say who you sell to in the full setup first, then add a list for each group.</p>
      </li>
    );
  }
  return (
    <>
      {icps.map((i) => {
        const s = state.sources.find((x) => x.icp === i.slug);
        return (
          <li key={i.slug} className="flex gap-3 py-5">
            {s ? <FoundMark /> : <MissingMark />}
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug text-[var(--text-secondary)]">
                {s ? (
                  <>
                    <span className="font-semibold text-[var(--text-primary)]">{i.label}</span>: {describeSource(s)}
                  </>
                ) : (
                  <>
                    No leads for <span className="font-semibold text-[var(--text-primary)]">{i.label}</span> yet
                  </>
                )}
              </p>
              <div className="mt-2">
                <Popover label={s ? "Change" : "Add"} title={s ? `Change the list for ${i.label}` : `Add a list for ${i.label}`} strong={!s}>
                  {(close) => (
                    <LeadListEditor
                      engagementId={engagementId}
                      current={s ?? null}
                      apifyConnected={state.apifyConnected}
                      onSave={async (src) => {
                        const err = await put(i.slug, src);
                        if (!err) close();
                        return err;
                      }}
                    />
                  )}
                </Popover>
              </div>
            </div>
          </li>
        );
      })}
    </>
  );
}

function LeadListEditor({
  engagementId,
  current,
  apifyConnected,
  onSave,
}: {
  engagementId: string;
  current: LeadSource | null;
  apifyConnected: boolean;
  onSave: (s: Omit<LeadSource, "icp"> | null) => Promise<string | null>;
}) {
  const [kind, setKind] = useState<"csv" | "apify">(current?.fetcherType === "apify" ? "apify" : "csv");
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [actor, setActor] = useState(current?.apifyActorId ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const headers = file ? csvHeader(file.text) : [];
  const rows = csvRows(file?.text);
  const ready = kind === "csv" ? Boolean(file && rows > 0 && columns.email && columns.companyName) : Boolean(actor.trim() && (apifyConnected || token.trim()));

  async function read(f: File) {
    const text = await f.text();
    setFile({ name: f.name, text });
    setColumns(guessColumns(csvHeader(text)));
  }

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setErr(null);
    try {
      const e = await fn();
      if (e) setErr(e);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const submit = () =>
    run(async () => {
      if (kind === "apify" && !apifyConnected) {
        const res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ engagementId, provider: "cold_open_apify", value: token.trim() }),
        });
        if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "Couldn't save the Apify key.";
      }
      const base = { dailyLimit: current?.dailyLimit };
      return onSave(kind === "csv" ? { ...base, fetcherType: "csv", csvContent: file!.text, csvMapping: columns } : { ...base, fetcherType: "apify", apifyActorId: actor.trim() });
    });

  const missingColumns = (["email", "companyName"] as const).filter((k) => !columns[k]);
  const columnLabel: Record<string, string> = { email: "Which column has the email?", companyName: "Which column has the company?" };

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {(
          [
            { value: "csv", label: "Upload a CSV" },
            { value: "apify", label: "Pull from an Apify actor" },
          ] as const
        ).map((o) => (
          <li key={o.value}>
            <button
              type="button"
              onClick={() => setKind(o.value)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--accent-dim)] cursor-pointer",
                kind === o.value && "bg-[var(--accent-dim)]",
              )}
            >
              <span className="text-[var(--text-primary)]">{o.label}</span>
              {kind === o.value && <Check className="h-3.5 w-3.5 text-[var(--ink)]" strokeWidth={3} />}
            </button>
          </li>
        ))}
      </ul>
      {kind === "csv" ? (
        <div className="space-y-2">
          <label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-dashed text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            {file ? file.name : current?.fetcherType === "csv" ? "Choose a file to replace this list" : "Choose a CSV file"}
            <input type="file" accept=".csv,text/csv" aria-label="CSV file" className="sr-only" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
          </label>
          {file && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {rows.toLocaleString()} people.
              {columns.email ? ` Emails from \u201c${columns.email}\u201d` : ""}
              {columns.companyName ? `, companies from \u201c${columns.companyName}\u201d` : ""}
              {columns.firstName ? `, names from \u201c${columns.firstName}\u201d${columns.lastName ? ` and \u201c${columns.lastName}\u201d` : ""}` : ""}.
            </p>
          )}
          {file &&
            missingColumns.map((k) => (
              <Labeled key={k} label={columnLabel[k]}>
                <select aria-label={columnLabel[k]} value="" onChange={(e) => setColumns((c) => ({ ...c, [k]: e.target.value }))} className={cn(inputCls, "h-9")}>
                  <option value="" disabled>
                    Choose a column
                  </option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Labeled>
            ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Labeled label="Actor">
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="code_crafter/leads-finder" spellCheck={false} className={cn(inputCls, "h-9")} />
          </Labeled>
          {!apifyConnected && (
            <Labeled label="Your Apify key">
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="apify_api_..." autoComplete="off" className={cn(inputCls, "h-9 font-mono")} />
            </Labeled>
          )}
        </div>
      )}
      {err && <p className="text-[13px] text-[var(--error)]">{err}</p>}
      <div className="flex items-center justify-between pt-1">
        {current ? (
          <button type="button" disabled={busy} onClick={() => run(() => onSave(null))} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            Stop using this list
          </button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" disabled={!ready || busy} onClick={submit}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Use this list
        </Button>
      </div>
    </div>
  );
}

// ── Live sending and held leads (Daily Send) ───────────────────────────

function LiveSending({ engagementId, daily, onChanged }: { engagementId: string; daily: ColdOpenSetupState["proposal"]["daily"]; onChanged: () => Promise<unknown> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = daily.liveSendEnabled;

  // Only ever switched by this explicit step; saving the setup never turns it on.
  async function flip(close: () => void) {
    setBusy(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/daily-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: daily.volume, localHour: daily.localHour, timezone: daily.timezone ?? undefined, copyMode: daily.copyMode, liveSendEnabled: !on }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't change live sending.");
      toast.success(on ? "Live sending is off. Runs are dry runs again." : "Live sending is on. Real emails go out from the next run.");
      close();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change live sending.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex gap-3 py-5">
      {on ? <WarnMark /> : <MissingMark />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug text-[var(--text-secondary)]">
          {on ? (
            <>
              Live sending is <span className="font-semibold text-[var(--text-primary)]">on</span>. Real emails go out every day.
            </>
          ) : (
            <>
              Live sending is <span className="font-semibold text-[var(--text-primary)]">off</span>. Each run picks leads and writes emails, but sends nothing.
            </>
          )}
        </p>
        {!on && <p className="mt-1 text-[12px] text-[var(--text-muted)]">Turn it on once a dry run looks right.</p>}
        <div className="mt-2">
          <Popover label={on ? "Turn off" : "Turn on"} title={on ? "Turn off live sending" : "Turn on live sending"} strong={!on}>
            {(close) => (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {on ? "Runs go back to dry runs. Nothing is sent." : `Real emails go out from the next run, up to ${daily.volume} a day.`}
                </p>
                <div className="flex justify-end">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void flip(close)}>
                    {busy ? <Loader2 className="animate-spin" /> : null}
                    {on ? "Turn off live sending" : "Turn on live sending"}
                  </Button>
                </div>
              </div>
            )}
          </Popover>
        </div>
      </div>
    </li>
  );
}

interface HeldLead {
  id: string;
  email: string;
  companyName: string;
  firstName: string | null;
  lastName: string | null;
  statusDetail: { copy?: { subject: string } } | null;
}

function HeldLeads({ engagementId }: { engagementId: string }) {
  const toast = useToast();
  const url = `/api/engagements/${engagementId}/bridges/daily-send/held-leads`;
  const [leads, setLeads] = useState<HeldLead[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      const body = res?.ok ? await res.json().catch(() => ({})) : {};
      setLeads(body.leads ?? []);
    })();
  }, [url]);

  async function act(id: string, action: "approve" | "discard") {
    setBusy(id);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: id, action }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't do that.");
      setLeads((ls) => ls.filter((l) => l.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {leads.map((l) => (
        <li key={l.id} className="flex gap-3 py-5">
          <WarnMark />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{[l.firstName, l.lastName].filter(Boolean).join(" ") || l.email}</span>
              {l.companyName ? ` at ${l.companyName}` : ""} is held for your review
            </p>
            {l.statusDetail?.copy?.subject && <p className="mt-1 text-[12px] text-[var(--text-muted)]">&ldquo;{l.statusDetail.copy.subject}&rdquo;</p>}
            <div className="mt-2 flex gap-4 text-[13px]">
              <button
                type="button"
                disabled={busy === l.id}
                onClick={() => void act(l.id, "approve")}
                className="font-medium text-[var(--text-primary)] underline underline-offset-4 cursor-pointer disabled:opacity-50"
              >
                Approve and send
              </button>
              <button
                type="button"
                disabled={busy === l.id}
                onClick={() => void act(l.id, "discard")}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
              >
                Discard
              </button>
            </div>
          </div>
        </li>
      ))}
    </>
  );
}

// ── Save bar ───────────────────────────────────────────────────────────
//
// One row, one idea. When something's still needed, the block at the top
// of the screen already says so; this bar doesn't repeat it.

function ApproveBar({
  label = "Approve",
  note,
  error,
  saving,
  disabled,
  onApprove,
  onCancel,
  cancelLabel,
}: {
  label?: string;
  note?: string;
  error: string | null;
  saving: boolean;
  disabled: boolean;
  onApprove: () => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 mt-8 border-t border-[var(--border)] bg-background/95 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          {error ? (
            <p className="flex items-center gap-2 text-[13px] text-[var(--error)]">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          ) : note ? (
            <p className="text-[13px] text-[var(--text-muted)]">{note}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button onClick={onApprove} disabled={saving || disabled}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}