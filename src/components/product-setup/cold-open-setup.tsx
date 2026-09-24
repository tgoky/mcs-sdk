"use client";

// src/components/product-setup/cold-open-setup.tsx
//
// Cold Open's setup, one page, the same shape as Showtime's and
// Reputation Manager's:
//   welcome   the website (remembered) and the sending tool plus CRM
//             (already-connected ones show as such; one connection per
//             client serves every product)
//   working   "Set it up" streams its real steps
//   review    how outreach has gone so far, then what they sell, who to,
//             in whose voice, which subject lines and emails, into which
//             campaigns, how many a day. Save. Live sending stays off
//             until someone switches it on in Daily Send.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { COLD_OPEN_SEND_TOOLS, findSetupTool, findShowtimeTool } from "@/lib/showtime-setup/catalog";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { ColdOpenSetupState, TrustTier } from "@/lib/cold-open-setup/types";
import type { ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ChoiceList } from "./fact-token";
import { ApproveBar, ChipRow, Pill, Popover, FeedRow, Labeled, SettingsHeader, Todos, ToggleList, inputCls, pick, type FeedEntry } from "./review-kit";
import { anySkillDisplayName } from "@/lib/any-skill";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { cn } from "@/lib/utils";

// ── Skills ─────────────────────────────────────────────────────────────

/** Setup steps this page fills in; always on once saved. */
const SETUP_SKILLS: ColdOpenSkillId[] = ["voice-capture", "source-connect", "send-connect"];
/** The day-to-day workers a person can switch off. */
const RUN_SKILLS: ColdOpenSkillId[] = ["daily-send", "reply-sort", "send-report"];
/** What each skill's own settings show: the review rows (and "Left to do"
 * steps) it owns, whether it has anything to save, and a line on what it
 * does when it has nothing to set. */
const COLD_OPEN_FOCUS: Record<string, { rows: string[]; todos: string[]; save: boolean; about?: string }> = {
  "icp-lock": { rows: ["site", "offer", "buyers", "crm"], todos: [], save: true },
  "voice-capture": { rows: ["voice", "subjects", "emails"], todos: [], save: true },
  "send-connect": { rows: ["outbound", "dns-", "campaign-"], todos: ["tool", "campaigns"], save: true, about: "Where your emails go out, and which campaign each group of buyers goes into." },
  "source-connect": { rows: [], todos: [], save: false, about: "Where each group's leads come from. A list is used as soon as you add it." },
  "daily-send": { rows: ["schedule", "emails"], todos: [], save: true },
  "reply-sort": {
    rows: ["outbound"],
    todos: ["tool"],
    save: false,
    about: "Sorts each reply as it comes in (interested, not now, not a fit, an objection, an auto-reply or an unsubscribe) and sends anything real to your Queue. There's nothing to set: it reads replies from your sending tool.",
  },
  "send-report": { rows: [], todos: [], save: false, about: "Sums up each week's sending: how many emails went out, what happened to them, and how people replied. There's nothing to set." },
};

const STAGES: ActivationStage[] = [
  { label: "Reading the site", prefix: "" },
  { label: "What you sell and to whom", prefix: "found-" },
  { label: "Your past outreach and customers", prefix: "account-" },
  { label: "Matching campaigns", prefix: "match-" },
];

const HUBSPOT = findShowtimeTool("hubspot");

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

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

// ── Component ──────────────────────────────────────────────────────────

export function ColdOpenSetup({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Cancel",
  focus,
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
  /** Opens as this one skill's own settings once Cold Open is set up: only
   * the rows it owns, saved without touching which skills are on. */
  focus?: string;
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

  const set = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));

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
      if (!err) await load().catch(() => undefined);
      return err;
    },
    connectKey: async (tool, value, extra) => {
      const err = await post(connectPath, { provider: tool.provider, value, ...extra });
      if (!err) {
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
      if (!err) await load().catch(() => undefined);
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
  const missing = useMemo(() => {
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
  const dirty = useMemo(() => (data && draft ? JSON.stringify({ ...draft, domain: "" }) !== JSON.stringify({ ...draftFrom(data), domain: "" }) : false), [data, draft]);

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setSaveError(null);
    const icps = draft.icps.filter((i) => i.label.trim());
    const body = {
      product: draft.product,
      // A group added here gets its slug from its name on the server.
      icps: icps.map((i) => ({ slug: data.proposal.icps.some((x) => x.slug === i.slug) ? i.slug : "", label: i.label.trim(), weight: i.share, teamSizeMin: Number(i.min) || null, teamSizeMax: Number(i.max) || null, disqualifyIf: i.disqualifyIf })),
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
      const res = await fetch(`/api/engagements/${engagementId}/setup/cold-open/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.step ? `${json.step}: ${json.error}` : (json.error ?? "Couldn't save."));
      await load({ fresh: true }).catch(() => undefined);
      if (settings) {
        // The panel it opened in says it saved; elsewhere, say so here.
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
    <div ref={topRef} className="@container mx-auto w-full max-w-3xl px-1 pb-4">
      {phase === "review" ? (
        <>
          <Review data={data} draft={draft} set={set} onReread={() => setPhase("welcome")} toolRow={toolRow} focus={settings ? focus : undefined} reload={() => load()} />
          {settings ? (
            COLD_OPEN_FOCUS[focus!]?.save && (
              <ApproveBar
                label="Save"
                note={missing.length ? "Something the full setup needs is missing. Open the full setup to add it." : undefined}
                error={saveError}
                saving={saving}
                disabled={!dirty || missing.length > 0}
                onApprove={save}
                onCancel={onCancel}
                cancelLabel={cancelLabel}
              />
            )
          ) : (
            <ApproveBar
              note={missing.length ? "Add what we couldn't find above, then approve." : undefined}
              error={saveError}
              saving={saving}
              disabled={missing.length > 0}
              onApprove={save}
              onCancel={onCancel}
              cancelLabel={cancelLabel}
            />
          )}
        </>
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
        />
      )}
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function ColdOpenMark({ size = 44 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-elevation-1 ring-1 ring-black/5 dark:ring-white/10" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static product mark, same as the Library's */}
      <img src="/images/cold-open.svg" alt="" className="h-[82%] w-[82%] object-contain" />
    </span>
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
}) {
  const host = bareHost(draft.domain);
  const known = Boolean(data.website.domain) && bareHost(data.website.domain ?? "") === host;
  const sender = data.tools.find((t) => t.group === "sending" && t.linked);
  return (
    <div className="space-y-9">
      <header className="flex items-start gap-4">
        <ColdOpenMark />
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[30px]">Cold email for {data.buyer}</h1>
          <p className="max-w-xl text-[15px] leading-relaxed">
            We learn what you sell, who buys it, and what has already worked in your outreach, then set up the daily sending. You check our work, and nothing goes out until you say so.
          </p>
        </div>
      </header>

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
                Set it up <ArrowRight />
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

// ── Review ─────────────────────────────────────────────────────────────

// ── Review: the campaign, what we did, what's left ─────────────────────
//
// What "Set it up" found, said back as a short feed the person approves:
// the campaign at a glance, each thing we did with where it came from
// (Change opens a small editor; Undo puts back what we found), and the
// few steps left before anything sends. No form on the page itself.

function Review({
  data,
  draft,
  set,
  onReread,
  toolRow,
  focus,
  reload,
}: {
  data: ColdOpenSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  onReread: () => void;
  toolRow: ReactNode;
  focus?: string;
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
  // "your website" -> "From your website"; a default says so plainly.
  const from = (source: string) => (source === "saved" ? "Saved" : source === "a common default" ? "A starting point. Change it anytime." : source ? `From ${source}` : "");

  const entries: FeedEntry[] = [];

  entries.push(
    data.website.domain
      ? { key: "site", text: <>Read <b>{data.website.domain}</b></>, source: data.website.readAt ? `Read ${new Date(data.website.readAt).toLocaleDateString()}` : "" }
      : { key: "site", todo: true, text: <>No website yet</>, action: { label: "Add it", onClick: onReread } }
  );

  const offerEditor = (close: () => void) => (
    <OfferEditor
      value={draft.product}
      onSave={(v) => {
        set((d) => ({ ...d, product: v }));
        close();
      }}
    />
  );
  entries.push(
    draft.product.name.trim()
      ? {
          key: "offer",
          text: (
            <>
              Your offer is <b>{draft.product.name}</b>
              {draft.product.price ? <> at <b>{draft.product.price}</b></> : null}
              {draft.product.valueProp ? <span className="block text-[var(--text-muted)]">{draft.product.valueProp}</span> : <span className="block text-[var(--text-muted)]">We still need a line on what it does for people.</span>}
            </>
          ),
          source: from(p.product.name.source),
          editor: offerEditor,
          undo: same(draft.product, initial.product) ? undefined : () => set((d) => ({ ...d, product: initial.product })),
          todo: !draft.product.valueProp.trim(),
        }
      : { key: "offer", todo: true, text: <>Couldn&apos;t tell what you sell</>, editor: offerEditor, editLabel: "Add it" }
  );

  const buyersEditor = (close: () => void) => (
    <BuyersEditor
      value={draft.icps}
      showShare={icps.length > 1}
      onSave={(list) => {
        set((d) => ({ ...d, icps: list }));
        close();
      }}
    />
  );
  entries.push(
    icps.length
      ? {
          key: "buyers",
          text: (
            <>
              Writing to{" "}
              {icps.map((i, n) => (
                <span key={i.slug}>
                  {n > 0 ? (n === icps.length - 1 ? " and " : ", ") : ""}
                  <b>{i.label}</b>
                  {i.min || i.max ? ` (${i.min || "1"}${i.max ? `-${i.max}` : "+"} people)` : ""}
                </span>
              ))}
            </>
          ),
          source: icps[0].evidence ?? (icps[0].tier === "done" ? "Saved" : "From your website"),
          editor: buyersEditor,
          undo: same(draft.icps, initial.icps) ? undefined : () => set((d) => ({ ...d, icps: initial.icps })),
        }
      : { key: "buyers", todo: true, text: <>Couldn&apos;t tell who you sell to</>, editor: buyersEditor, editLabel: "Add them" }
  );

  entries.push({
    key: "voice",
    text: (
      <>
        Emails open with <b>&ldquo;{draft.voice.greeting || "Hi"}&rdquo;</b>, sign off <b>&ldquo;{draft.voice.signOff || "Best,"}&rdquo;</b> and sound <b>{draft.voice.tone.toLowerCase() || "plain"}</b>
      </>
    ),
    source: from(p.voice.tone.source),
    editor: (close) => (
      <VoiceEditor
        value={draft.voice}
        onSave={(v) => {
          set((d) => ({ ...d, voice: v }));
          close();
        }}
      />
    ),
    undo: same(draft.voice, initial.voice) ? undefined : () => set((d) => ({ ...d, voice: initial.voice })),
  });

  if (out) {
    entries.push({
      key: "outbound",
      text: (
        <>
          Read {platformName}: <b>{out.campaigns.length} campaigns</b>
          {out.overallReplyRate != null ? <>, <b>{out.overallReplyRate}%</b> replied</> : null}
          {out.capacity != null ? <>, mailboxes send up to <b>{out.capacity} a day</b></> : null}
        </>
      ),
      source: `Read ${new Date(out.pulledAt).toLocaleDateString()}`,
    });
    for (const d of out.domains.filter((x) => !x.ok)) {
      entries.push({ key: `dns-${d.domain}`, warn: true, text: <><b>{d.domain}</b> is missing email records: {d.problems.join(" ")}</>, source: "Fix before sending more" });
    }
  }
  if (data.buyers) {
    const b = data.buyers;
    entries.push({
      key: "crm",
      text: (
        <>
          Your <b>{b.companies} customers</b> in HubSpot are mostly {b.industries[0] ? <b>{b.industries[0].industry}</b> : "varied"}
          {b.sweetSpot ? <>, <b>{b.sweetSpot.min}{b.sweetSpot.max ? `-${b.sweetSpot.max}` : "+"} people</b></> : null}
        </>
      ),
      source: `${b.wonDeals} won deals`,
    });
  }

  const subjectsOn = draft.subjects.filter((x) => x.on).length;
  if (draft.subjects.length || focus === "voice-capture") {
    const toggleSubject = (i: number) => set((d) => ({ ...d, subjects: d.subjects.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }));
    entries.push({
      key: "subjects",
      text: subjectsOn ? <>Reusing <b>{subjectsOn} of your best subject lines</b></> : <>No subject lines of your own, so each lead gets one written for them</>,
      source: draft.subjects.length ? (platformName ? `From ${platformName}` : "Saved") : undefined,
      // In Voice Capture's own settings the lines are chips to switch and add to.
      ...(focus
        ? {
            body: (
              <ChipRow
                items={draft.subjects.map((x) => ({ value: x.value, on: x.on, hint: x.replyRate != null ? `${x.replyRate}% replied` : undefined }))}
                onToggle={toggleSubject}
                onAdd={(v) => set((d) => (d.subjects.some((x) => x.value.toLowerCase() === v.toLowerCase()) ? d : { ...d, subjects: [...d.subjects, { value: v, source: "you", replyRate: null, on: true }] }))}
                addLabel="Add a subject line"
              />
            ),
          }
        : {
            editor: () => (
              <ToggleList items={draft.subjects.map((x) => ({ label: x.value, hint: x.replyRate != null ? `${x.replyRate}% replied` : undefined, on: x.on }))} onToggle={toggleSubject} />
            ),
          }),
    });
  }

  const ownOn = draft.touchsets.filter((t) => t.on).length;
  entries.push({
    key: "emails",
    text:
      draft.copyMode === "upload" ? (
        <>Sending <b>{ownOn} of your own sequences</b> as written</>
      ) : (
        <>Writing <b>fresh emails for each lead</b>, three per person</>
      ),
    source: draft.copyMode === "upload" ? `From ${platformName ?? "your saved emails"}` : "",
    editor: () => <EmailsEditor draft={draft} set={set} />,
  });

  if (campaigns.length) {
    for (const i of icps.filter((x) => draft.campaignMap[x.slug])) {
      const c = campaigns.find((x) => x.id === draft.campaignMap[i.slug]);
      entries.push({
        key: `campaign-${i.slug}`,
        text: <>{i.label} go into <b>{c?.name ?? "a campaign"}</b></>,
        source: p.campaignMap[i.slug]?.id === draft.campaignMap[i.slug] ? "Matched by Jev" : "",
        editor: (close) => <CampaignPicker campaigns={campaigns} value={draft.campaignMap[i.slug]} onPick={(v) => (set((d) => ({ ...d, campaignMap: { ...d.campaignMap, [i.slug]: v } })), close())} />,
      });
    }
  }

  entries.push({
    key: "schedule",
    text: (
      <>
        <b>{draft.volume} new leads a day</b> at <b>{hourLabel(draft.localHour)}</b>
        {draft.timezone ? <> {draft.timezone.replace(/_/g, " ")}</> : null}
      </>
    ),
    source: p.daily.volumeSource === "saved" ? "Saved" : p.daily.volumeSource.charAt(0).toUpperCase() + p.daily.volumeSource.slice(1),
    editor: (close) => (
      <ScheduleEditor
        value={{ volume: draft.volume, localHour: draft.localHour, timezone: draft.timezone }}
        onSave={(v) => {
          set((d) => ({ ...d, ...v }));
          close();
        }}
      />
    ),
  });

  // ── Left to do ──
  const todos: { key: string; label: string; done: boolean; action?: ReactNode }[] = [
    { key: "tool", label: sendingLinked ? `Sending through ${platformName ?? "your tool"}` : "Connect your sending tool", done: sendingLinked, action: sendingLinked ? null : <Popover label="Connect" title="Your sending tool" strong>{() => <div className="py-1">{toolRow}</div>}</Popover> },
  ];
  if (sendingLinked && icps.length) {
    todos.push({
      key: "campaigns",
      label: unmapped.length ? `Choose a campaign for ${unmapped.map((i) => i.label).join(" and ")}` : "Each group has a campaign",
      done: unmapped.length === 0,
      action: unmapped.length && campaigns.length ? (
        <Popover label="Choose" title={`Campaign for ${unmapped[0].label}`} strong>
          {(close) => <CampaignPicker campaigns={campaigns} value={null} onPick={(v) => (set((d) => ({ ...d, campaignMap: { ...d.campaignMap, [unmapped[0].slug]: v } })), close())} />}
        </Popover>
      ) : null,
    });
  }
  todos.push({
    key: "leads",
    label: data.leadSources.length ? `Leads from ${data.leadSources.map((l) => l.icp).join(", ")}` : "Add a lead list",
    done: data.leadSources.length > 0,
    action: data.leadSources.length ? null : <a href={bridge("source-connect")} className="text-[13px] font-medium text-[var(--text-primary)] underline underline-offset-4">Add</a>,
  });
  todos.push({
    key: "live",
    label: p.daily.liveSendEnabled ? "Live sending is on" : "Switch on live sending when you're ready (until then, emails are drafts)",
    done: p.daily.liveSendEnabled,
    action: p.daily.liveSendEnabled ? null : <a href={bridge("daily-send")} className="text-[13px] text-[var(--text-muted)] underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)]">Later</a>,
  });
  const ready = todos.filter((t) => t.key !== "live").every((t) => t.done);

  if (focus) {
    const f = COLD_OPEN_FOCUS[focus] ?? { rows: [], todos: [], save: false };
    const rows = pick(entries, f.rows);
    const steps = pick(todos, f.todos);
    const own = focus === "source-connect" || focus === "daily-send";
    return (
      <div className="space-y-6">
        <SettingsHeader mark={<ColdOpenMark size={36} />} name={anySkillDisplayName(focus)} buyer={data.buyer} fullSetupHref={bridge("icp-lock")} />
        {f.about && <p className="px-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{f.about}</p>}
        {(rows.length > 0 || own) && (
          <ol className="space-y-1">
            {rows.map((e) => (
              <FeedRow key={e.key} entry={e} />
            ))}
            {focus === "source-connect" && <LeadLists engagementId={data.engagementId} icps={icps} />}
            {focus === "daily-send" && (
              <>
                <LiveSending engagementId={data.engagementId} daily={p.daily} onChanged={reload} />
                <HeldLeads engagementId={data.engagementId} />
              </>
            )}
          </ol>
        )}
        {steps.length > 0 && <Todos items={steps} />}
      </div>
    );
  }

  return (
    <div className="space-y-9">
      {/* The campaign at a glance */}
      <header className="rounded-2xl bg-black/[0.025] p-5 ring-1 ring-inset ring-black/[0.05] dark:bg-white/[0.035] dark:ring-white/[0.06] @xl:p-6">
        <div className="flex items-start gap-4">
          <ColdOpenMark size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{data.buyer}&apos;s cold email</p>
            <h1 className="mt-1 text-[22px] font-semibold leading-snug tracking-tight text-[var(--text-primary)] @xl:text-[26px]">
              {draft.product.name || "Your offer"} <span className="text-[var(--text-muted)]">to</span> {icps.map((i) => i.label).join(" and ") || "your buyers"}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              <Pill>{draft.volume} a day at {hourLabel(draft.localHour)}</Pill>
              <Pill>Sounds {draft.voice.tone.toLowerCase() || "plain"}</Pill>
              <Pill>{draft.copyMode === "upload" ? "Your own emails" : "Written per lead"}</Pill>
              <Pill tone={ready && p.daily.liveSendEnabled ? "on" : "off"}>{ready ? (p.daily.liveSendEnabled ? "Sending" : "Drafts only") : "Not sending yet"}</Pill>
            </div>
          </div>
        </div>
      </header>

      {/* What we did */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 px-1">
          <h2 className="text-[13px] font-medium text-[var(--text-secondary)]">What we did</h2>
          <button type="button" onClick={onReread} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            Read again
          </button>
        </div>
        <ol className="space-y-1">
          {entries.map((e) => (
            <FeedRow key={e.key} entry={e} />
          ))}
        </ol>
      </section>

      {/* Left to do */}
      <section className="space-y-3">
        <h2 className="px-1 text-[13px] font-medium text-[var(--text-secondary)]">{ready ? "Ready" : "Left to do"}</h2>
        <ul className="rounded-2xl bg-black/[0.025] px-4 py-1 ring-1 ring-inset ring-black/[0.05] dark:bg-white/[0.035] dark:ring-white/[0.06]">
          {todos.map((t) => (
            <li key={t.key} className="flex items-center gap-3 py-3">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", t.done ? "bg-[var(--ink)] text-[var(--ink-foreground)]" : "ring-1 ring-inset ring-[var(--text-muted)]/50")}>
                {t.done && <Check className="h-3 w-3" strokeWidth={3.5} />}
              </span>
              <span className={cn("min-w-0 flex-1 text-[14px]", t.done ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>{t.label}</span>
              {t.action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function OfferEditor({ value, onSave }: { value: Draft["product"]; onSave: (v: Draft["product"]) => void }) {
  const [v, setV] = useState(value);
  const up = (k: keyof Draft["product"]) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => (e.preventDefault(), onSave({ ...v, name: v.name.trim(), price: v.price.trim(), valueProp: v.valueProp.trim(), url: v.url.trim() }))} className="space-y-3">
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
  const [list, setList] = useState<IcpDraft[]>(() => (value.length ? value : [{ slug: `icp-${Date.now().toString(36)}`, label: "", share: 100, min: "", max: "", disqualifyIf: [], evidence: null, tier: "done" }]));
  const up = (i: number, patch: Partial<IcpDraft>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch, tier: "done" } : x)));
  const many = showShare || list.length > 1;
  return (
    <form onSubmit={(e) => (e.preventDefault(), onSave(list.filter((x) => x.label.trim()).map((x) => ({ ...x, label: x.label.trim() }))))} className="space-y-3">
      {list.map((g, i) => (
        <div key={g.slug} className="space-y-2 rounded-xl border p-3">
          <div className="flex items-center gap-2">
            <input autoFocus={i === 0} value={g.label} onChange={(e) => up(i, { label: e.target.value })} placeholder="e.g. Marketing agencies" className={cn(inputCls, "h-9")} />
            <button type="button" aria-label="Remove" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--error)] cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
            <input inputMode="numeric" value={g.min} onChange={(e) => up(i, { min: e.target.value.replace(/\D/g, "") })} placeholder="any" className={cn(inputCls, "h-8 w-14 px-2 text-center")} />
            to
            <input inputMode="numeric" value={g.max} onChange={(e) => up(i, { max: e.target.value.replace(/\D/g, "") })} placeholder="any" className={cn(inputCls, "h-8 w-14 px-2 text-center")} />
            people
            {many && (
              <>
                <span className="ml-auto" />
                <input inputMode="numeric" value={String(g.share)} onChange={(e) => up(i, { share: Number(e.target.value.replace(/\D/g, "")) || 0 })} className={cn(inputCls, "h-8 w-12 px-2 text-center")} />% of leads
              </>
            )}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setList((l) => [...l, { slug: `icp-${Date.now().toString(36)}`, label: "", share: 0, min: "", max: "", disqualifyIf: [], evidence: null, tier: "done" }])}
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
    <form onSubmit={(e) => (e.preventDefault(), onSave({ volume: Math.max(1, Math.min(500, Number(v.volume) || value.volume)), localHour: v.localHour, timezone: v.timezone.trim() }))} className="space-y-3">
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
        <input value={v.timezone} onChange={(e) => setV((x) => ({ ...x, timezone: e.target.value }))} placeholder="e.g. America/New_York" className={cn(inputCls, "h-10")} />
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
  return <ChoiceList options={campaigns.map((c) => ({ value: c.id, label: c.name, hint: c.replyRate != null ? `${c.replyRate}% replied` : undefined }))} value={value ?? null} onPick={onPick} />;
}



// ── Emails ─────────────────────────────────────────────────────────────

function EmailsEditor({ draft, set }: { draft: Draft; set: (fn: (d: Draft) => Draft) => void }) {
  const [writing, setWriting] = useState(false);
  return (
    <div className="space-y-3">
      <ChoiceList
        options={[
          { value: "generate", label: "Write fresh for each lead" },
          { value: "upload", label: "Send my own sequences as written", hint: draft.touchsets.length ? `${draft.touchsets.length} to choose from` : "Write at least two below" },
        ]}
        value={draft.copyMode}
        onPick={(v) => set((d) => ({ ...d, copyMode: v as Draft["copyMode"] }))}
      />
      {draft.copyMode === "upload" && draft.touchsets.length > 0 && (
        <ToggleList items={draft.touchsets.map((t) => ({ label: t.subject, hint: t.campaign, on: t.on }))} onToggle={(i) => set((d) => ({ ...d, touchsets: d.touchsets.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))} />
      )}
      {draft.copyMode === "upload" &&
        (writing ? (
          <SequenceWriter
            onAdd={(t) => {
              set((d) => ({ ...d, touchsets: [...d.touchsets, { ...t, campaign: "Written by you", on: true }] }));
              setWriting(false);
            }}
            onCancel={() => setWriting(false)}
          />
        ) : (
          <button type="button" onClick={() => setWriting(true)} className="inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            <Plus className="h-3 w-3" /> Write one yourself
          </button>
        ))}
    </div>
  );
}

function SequenceWriter({ onAdd, onCancel }: { onAdd: (t: { subject: string; body1: string; body2: string; body3: string }) => void; onCancel: () => void }) {
  const [t, setT] = useState({ subject: "", body1: "", body2: "", body3: "" });
  const up = (k: keyof typeof t) => (e: { target: { value: string } }) => setT((x) => ({ ...x, [k]: e.target.value }));
  const ready = Object.values(t).every((v) => v.trim());
  const area = cn(inputCls, "resize-y py-2 leading-relaxed");
  return (
    <div className="space-y-2.5 rounded-xl bg-black/[0.025] p-3 dark:bg-white/[0.035]">
      <Labeled label="Subject">
        <input autoFocus value={t.subject} onChange={up("subject")} className={cn(inputCls, "h-9")} />
      </Labeled>
      <Labeled label="First email">
        <textarea value={t.body1} onChange={up("body1")} rows={3} className={area} />
      </Labeled>
      <Labeled label="Follow-up">
        <textarea value={t.body2} onChange={up("body2")} rows={2} className={area} />
      </Labeled>
      <Labeled label="Last follow-up">
        <textarea value={t.body3} onChange={up("body3")} rows={2} className={area} />
      </Labeled>
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          Cancel
        </button>
        <Button type="button" size="sm" disabled={!ready} onClick={() => onAdd({ subject: t.subject.trim(), body1: t.body1.trim(), body2: t.body2.trim(), body3: t.body3.trim() })}>
          Add
        </Button>
      </div>
    </div>
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

/** Which column holds what, matched on the usual header names. */
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

  if (error) return <li className="px-1 py-2 text-sm text-[var(--error)]">{error}</li>;
  if (!state) {
    return (
      <li className="px-1 py-2 text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </li>
    );
  }
  if (icps.length === 0) return <FeedRow entry={{ key: "leads-none", todo: true, text: <>Say who you sell to in the full setup first, then add a list for each group.</> }} />;
  return (
    <>
      {icps.map((i) => {
        const s = state.sources.find((x) => x.icp === i.slug);
        return (
          <FeedRow
            key={i.slug}
            entry={{
              key: `leads-${i.slug}`,
              todo: !s,
              text: s ? (
                <>
                  <b>{i.label}</b>: {describeSource(s)}
                </>
              ) : (
                <>
                  No leads for <b>{i.label}</b> yet
                </>
              ),
              editLabel: s ? "Change" : "Add",
              editor: (close) => (
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
              ),
            }}
          />
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
        const res = await fetch("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId, provider: "cold_open_apify", value: token.trim() }) });
        if (!res.ok) return (await res.json().catch(() => ({}))).error ?? "Couldn't save the Apify key.";
      }
      const base = { dailyLimit: current?.dailyLimit };
      return onSave(kind === "csv" ? { ...base, fetcherType: "csv", csvContent: file!.text, csvMapping: columns } : { ...base, fetcherType: "apify", apifyActorId: actor.trim() });
    });

  const missingColumns = (["email", "companyName"] as const).filter((k) => !columns[k]);
  const columnLabel: Record<string, string> = { email: "Which column has the email?", companyName: "Which column has the company?" };

  return (
    <div className="space-y-3">
      <ChoiceList
        options={[
          { value: "csv", label: "Upload a CSV" },
          { value: "apify", label: "Pull from an Apify actor" },
        ]}
        value={kind}
        onPick={(v) => setKind(v as "csv" | "apify")}
      />
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
    <FeedRow
      entry={{
        key: "live",
        todo: !on,
        text: on ? (
          <>
            Live sending is <b>on</b>. Real emails go out every day.
          </>
        ) : (
          <>
            Live sending is <b>off</b>. Each run picks leads and writes emails, but sends nothing.
          </>
        ),
        source: on ? undefined : "Turn it on once a dry run looks right.",
        editLabel: on ? "Turn off" : "Turn on",
        editor: (close) => (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{on ? "Runs go back to dry runs. Nothing is sent." : `Real emails go out from the next run, up to ${daily.volume} a day.`}</p>
            <div className="flex justify-end">
              <Button type="button" size="sm" disabled={busy} onClick={() => void flip(close)}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {on ? "Turn off live sending" : "Turn on live sending"}
              </Button>
            </div>
          </div>
        ),
      }}
    />
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

/** Leads Daily Send set aside for a person to approve or drop. */
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
        <FeedRow
          key={l.id}
          entry={{
            key: `held-${l.id}`,
            warn: true,
            text: (
              <>
                <b>{[l.firstName, l.lastName].filter(Boolean).join(" ") || l.email}</b>
                {l.companyName ? ` at ${l.companyName}` : ""} is held for your review
              </>
            ),
            source: l.statusDetail?.copy?.subject ? `\u201c${l.statusDetail.copy.subject}\u201d` : undefined,
            body: (
              <div className="flex gap-4 text-[13px]">
                <button type="button" disabled={busy === l.id} onClick={() => void act(l.id, "approve")} className="font-medium text-[var(--text-primary)] underline underline-offset-4 cursor-pointer disabled:opacity-50">
                  Approve and send
                </button>
                <button type="button" disabled={busy === l.id} onClick={() => void act(l.id, "discard")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50">
                  Discard
                </button>
              </div>
            ),
          }}
        />
      ))}
    </>
  );
}
