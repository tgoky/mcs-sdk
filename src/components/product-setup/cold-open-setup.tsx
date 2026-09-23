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
import { AlertTriangle, ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { COLD_OPEN_SEND_TOOLS, findSetupTool, findShowtimeTool } from "@/lib/showtime-setup/catalog";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { ColdOpenSetupState, TrustTier } from "@/lib/cold-open-setup/types";
import type { ColdOpenSkillId } from "@/lib/cold-open-skill-manifest";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { SkillSwitchRow } from "./skill-switch";
import { cn } from "@/lib/utils";

// ── Skills ─────────────────────────────────────────────────────────────

/** Setup steps this page fills in; always on once saved. */
const SETUP_SKILLS: ColdOpenSkillId[] = ["voice-capture", "source-connect", "send-connect"];
/** The day-to-day workers a person can switch off. */
const RUN_SKILLS: ColdOpenSkillId[] = ["daily-send", "reply-sort", "send-report"];
const SKILL_BLURB: Partial<Record<ColdOpenSkillId, string>> = {
  "daily-send": "Picks the day's leads, writes their emails and queues them in your campaigns.",
  "reply-sort": "Sorts replies into interested, not now, not a fit and unsubscribe.",
  "send-report": "A weekly summary of what was sent and what came back.",
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

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;

// ── Component ──────────────────────────────────────────────────────────

export function ColdOpenSetup({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Cancel",
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
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
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/cold-open/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.step ? `${json.step}: ${json.error}` : (json.error ?? "Couldn't save."));
      toast.success(data.configured ? "Saved." : "Cold Open is set up. Live sending is still off.");
      await load({ fresh: true }).catch(() => undefined);
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
          <Review data={data} draft={draft} set={set} skills={skills} setSkills={setSkills} onReread={() => setPhase("welcome")} toolRow={toolRow} />
          <div className="sticky bottom-0 z-20 mt-8 border-t bg-background/95 px-4 py-3 backdrop-blur-md shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-4">
              <div className="min-w-0 flex-1 text-sm">
                {saveError ? (
                  <p className="flex items-center gap-2 text-[var(--error)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
                  </p>
                ) : missing.length ? (
                  <p className="text-[var(--text-secondary)]">Add {missing.join(", ")} to save.</p>
                ) : (
                  <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                    Ready. Nothing is sent until you switch live sending on.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" className="hidden @md:inline-flex" onClick={onCancel} disabled={saving}>
                  {cancelLabel}
                </Button>
                <Button size="lg" className="h-10 px-5" onClick={save} disabled={saving || missing.length > 0}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {data.configured ? "Save changes" : "Save setup"}
                </Button>
              </div>
            </div>
          </div>
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

function Review({
  data,
  draft,
  set,
  skills,
  setSkills,
  onReread,
  toolRow,
}: {
  data: ColdOpenSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  setSkills: (fn: (s: string[]) => string[]) => void;
  onReread: () => void;
  toolRow: ReactNode;
}) {
  const p = data.proposal;
  const out = data.outbound;
  const platformName = p.platform ? (findSetupTool(`cold_open_${p.platform}`)?.label ?? p.platform) : null;
  const setIcp = (i: number, patch: Partial<IcpDraft>) => set((d) => ({ ...d, icps: d.icps.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const shareTotal = draft.icps.reduce((a, i) => a + (i.label.trim() ? i.share : 0), 0);
  const liveOn = p.daily.liveSendEnabled;
  const bridge = (worker: string) => `/dashboard/engagements/${data.engagementId}/bridges/${worker}`;

  return (
    <div className="space-y-11">
      <header className="flex items-start gap-4">
        <ColdOpenMark />
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)]">{draft.product.name || data.buyer}&apos;s cold email</h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            {data.website.domain ?? "No website yet"} ·{" "}
            <button type="button" onClick={onReread} className="font-medium underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
              Change website or tools
            </button>
          </p>
        </div>
      </header>

      {(out || data.buyers) && <Findings data={data} />}

      <Section title="What you sell">
        <div className="space-y-4">
          <TextField label="Product" value={draft.product.name} tier={p.product.name.tier} onChange={(v) => set((d) => ({ ...d, product: { ...d.product, name: v } }))} />
          <TextField label="Web address" value={draft.product.url} tier={p.product.url.tier} onChange={(v) => set((d) => ({ ...d, product: { ...d.product, url: v } }))} />
          <TextField label="Price" value={draft.product.price} tier={p.product.price.tier} placeholder="Optional" onChange={(v) => set((d) => ({ ...d, product: { ...d.product, price: v } }))} />
          <TextField label="What it does for people" value={draft.product.valueProp} tier={p.product.valueProp.tier} multiline onChange={(v) => set((d) => ({ ...d, product: { ...d.product, valueProp: v } }))} />
        </div>
      </Section>

      <Section title="Who you sell to" hint={shareTotal && shareTotal !== 100 ? `Shares add to ${shareTotal}%. We scale them to 100.` : "Each group gets its share of the day's leads."}>
        <ul className="space-y-5">
          {draft.icps.map((icp, i) => (
            <li key={icp.slug} className="space-y-2 border-l-2 pl-4" style={{ borderColor: icp.tier === "likely" ? "var(--text-prefill-accent)" : undefined }}>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={icp.label}
                  onChange={(e) => setIcp(i, { label: e.target.value })}
                  placeholder="e.g. Marketing agencies"
                  className="h-9 min-w-0 flex-1 border-b border-[var(--text-muted)]/40 bg-transparent text-[16px] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
                />
                <label className="flex items-center gap-1 text-[13px] text-[var(--text-secondary)]">
                  <input type="number" min={0} max={100} value={icp.share} onChange={(e) => setIcp(i, { share: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-14 border-b border-[var(--text-muted)]/40 bg-transparent text-right tabular-nums outline-none focus:border-[var(--text-primary)]" />%
                </label>
                <button type="button" aria-label="Remove" onClick={() => set((d) => ({ ...d, icps: d.icps.filter((_, j) => j !== i) }))} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-secondary)]">
                Team size
                <input inputMode="numeric" value={icp.min} onChange={(e) => setIcp(i, { min: e.target.value.replace(/\D/g, "") })} placeholder="any" className="h-7 w-14 border-b border-[var(--text-muted)]/40 bg-transparent text-center tabular-nums outline-none focus:border-[var(--text-primary)]" />
                to
                <input inputMode="numeric" value={icp.max} onChange={(e) => setIcp(i, { max: e.target.value.replace(/\D/g, "") })} placeholder="any" className="h-7 w-14 border-b border-[var(--text-muted)]/40 bg-transparent text-center tabular-nums outline-none focus:border-[var(--text-primary)]" />
                people
              </div>
              <Chips
                label="Skip if"
                items={icp.disqualifyIf}
                onRemove={(k) => setIcp(i, { disqualifyIf: icp.disqualifyIf.filter((_, j) => j !== k) })}
                onAdd={(v) => setIcp(i, { disqualifyIf: [...icp.disqualifyIf, v] })}
                placeholder="e.g. already a customer"
              />
              {icp.evidence && <p className="text-[12px] text-[var(--text-prefill-accent)]">{icp.evidence}.</p>}
              {out && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                  Goes into
                  <select
                    value={draft.campaignMap[icp.slug] ?? ""}
                    onChange={(e) => set((d) => ({ ...d, campaignMap: { ...d.campaignMap, [icp.slug]: e.target.value } }))}
                    className="h-8 max-w-[18rem] truncate border-b border-[var(--text-muted)]/40 bg-transparent text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] cursor-pointer"
                  >
                    <option value="">No campaign yet</option>
                    {out.campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.replyRate != null ? ` (${c.replyRate}% replied)` : ""}
                      </option>
                    ))}
                  </select>
                  {!draft.campaignMap[icp.slug] && p.campaignMap[icp.slug]?.tier === "ask" && (
                    <button type="button" onClick={() => set((d) => ({ ...d, campaignMap: { ...d.campaignMap, [icp.slug]: p.campaignMap[icp.slug]!.id } }))} className="rounded-full border border-dashed px-2.5 py-0.5 text-[12px] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] cursor-pointer">
                      Maybe {p.campaignMap[icp.slug]!.name}?
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => set((d) => ({ ...d, icps: [...d.icps, { slug: `icp-${Date.now().toString(36)}`, label: "", share: d.icps.length ? 0 : 100, min: "", max: "", disqualifyIf: [], evidence: null, tier: "done" }] }))}
          className="inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <Plus className="h-3 w-3" /> Add a group
        </button>
      </Section>

      <Section title="How you write" hint={p.voice.greeting.source && p.voice.greeting.source !== "saved" ? `From ${p.voice.greeting.source}` : undefined}>
        <div className="space-y-4">
          <TextField label="Greeting" value={draft.voice.greeting} tier={p.voice.greeting.tier} placeholder="e.g. Hi (their first name follows)" onChange={(v) => set((d) => ({ ...d, voice: { ...d.voice, greeting: v } }))} />
          <TextField label="Sign-off" value={draft.voice.signOff} tier={p.voice.signOff.tier} multiline onChange={(v) => set((d) => ({ ...d, voice: { ...d.voice, signOff: v } }))} />
          <TextField label="Tone" value={draft.voice.tone} tier={p.voice.tone.tier} placeholder="e.g. Plain, friendly, no hype" onChange={(v) => set((d) => ({ ...d, voice: { ...d.voice, tone: v } }))} />
        </div>
      </Section>

      <Section title="Subject lines" hint={draft.subjects.length ? "Rotated across leads. Tap to switch one off." : "Optional. Without them we write our own."}>
        <ul className="space-y-1.5">
          {draft.subjects.map((s, i) => (
            <li key={`${s.value}-${i}`}>
              <button type="button" onClick={() => set((d) => ({ ...d, subjects: d.subjects.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))} className={cn("flex w-full items-start gap-2.5 text-left cursor-pointer", s.on ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] line-through")}>
                <Tick on={s.on} />
                <span className="min-w-0 flex-1 text-[15px]">{s.value}</span>
                <span className="shrink-0 text-[12px] text-[var(--text-muted)] no-underline">
                  {s.replyRate != null ? `${s.replyRate}% replied` : s.source === "saved" ? "" : s.source}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <AddInline placeholder="Add a subject line, e.g. question about {company_name}" onAdd={(v) => set((d) => ({ ...d, subjects: [...d.subjects, { value: v, source: "you", replyRate: null, on: true }] }))} />
      </Section>

      <Section title="The emails" hint="Write fresh for each lead, or send your own proven sequence as written.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["generate", "upload"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={mode === "upload" && draft.touchsets.length === 0}
                onClick={() => set((d) => ({ ...d, copyMode: mode }))}
                className={cn("rounded-full border px-3.5 py-1.5 text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40", draft.copyMode === mode ? "border-[var(--text-primary)] text-[var(--text-primary)]" : "border-dashed text-[var(--text-muted)]")}
              >
                {mode === "generate" ? "Write for each lead" : "Send my own emails"}
              </button>
            ))}
          </div>
          {draft.touchsets.length > 0 && (
            <ul className="space-y-3">
              {draft.touchsets.map((t, i) => (
                <li key={i} className={cn("border p-3 transition-opacity", !t.on && "opacity-50")}>
                  <button type="button" onClick={() => set((d) => ({ ...d, touchsets: d.touchsets.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))} className="flex w-full items-start gap-2.5 text-left cursor-pointer">
                    <Tick on={t.on} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">{t.subject}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-relaxed text-[var(--text-secondary)]">{t.body1}</span>
                      <span className="mt-1 block text-[12px] text-[var(--text-muted)]">From {t.campaign === "saved" ? "your saved emails" : t.campaign}, 3 emails</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {p.touchsetsDropped > 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">
              {p.touchsetsDropped} more {p.touchsetsDropped === 1 ? "sequence uses" : "sequences use"} fields we can&apos;t fill in, so {p.touchsetsDropped === 1 ? "it's" : "they're"} left out.
            </p>
          )}
        </div>
      </Section>

      <Section title="Daily sending" hint={p.daily.volumeSource !== "saved" ? `Volume: ${p.daily.volumeSource}.` : undefined}>
        <div className="space-y-4">
          <Field label="New leads a day">
            <input type="number" min={1} max={500} value={draft.volume} onChange={(e) => set((d) => ({ ...d, volume: Math.max(1, Math.min(500, Number(e.target.value) || 1)) }))} className="h-9 w-24 border-b border-[var(--text-muted)]/40 bg-transparent tabular-nums text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]" />
            {out?.capacity != null && <span className="ml-3 text-[13px] text-[var(--text-muted)]">Your mailboxes send up to {out.capacity} a day.</span>}
          </Field>
          <Field label="Queued at">
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              <select value={draft.localHour} onChange={(e) => set((d) => ({ ...d, localHour: Number(e.target.value) }))} className="h-9 border-b border-[var(--text-muted)]/40 bg-transparent text-[var(--text-primary)] outline-none cursor-pointer">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
              <input value={draft.timezone} onChange={(e) => set((d) => ({ ...d, timezone: e.target.value }))} placeholder="Time zone, e.g. America/New_York" className="h-9 w-64 border-b border-[var(--text-muted)]/40 bg-transparent text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]" />
            </div>
          </Field>
          <Field label="Leads from">
            {data.leadSources.length ? (
              <p className="text-[14px] text-[var(--text-primary)]">
                {data.leadSources.map((s) => `${s.icp}${s.rows ? ` (${s.rows} rows)` : ""}`).join(", ")}{" "}
                <a href={bridge("source-connect")} className="ml-1 text-[13px] text-[var(--text-muted)] underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)]">
                  Change
                </a>
              </p>
            ) : (
              <a href={bridge("source-connect")} className="text-[14px] font-medium text-[var(--text-primary)] underline decoration-dashed underline-offset-4">
                Add a lead list
              </a>
            )}
          </Field>
          <Field label="Live sending">
            <p className="text-[14px] text-[var(--text-primary)]">
              {liveOn ? "On. Leads go into your campaigns each day." : "Off. Each day's emails are drafted for you to look over, not sent."}{" "}
              <a href={bridge("daily-send")} className="ml-1 text-[13px] text-[var(--text-muted)] underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)]">
                {liveOn ? "Change" : "Switch on when ready"}
              </a>
            </p>
          </Field>
        </div>
      </Section>

      <Section title="Skills" hint="Switch any of them off.">
        <ul className="divide-y">
          {RUN_SKILLS.map((id) => (
            <SkillSwitchRow key={id} skillId={id} blurb={SKILL_BLURB[id] ?? ""} on={skills.includes(id)} onChange={(v) => setSkills((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)))} />
          ))}
        </ul>
      </Section>

      <Section title="Your tools" hint={platformName ? `Sending through ${platformName}.` : "Connect your sending tool to pick campaigns."}>
        {toolRow}
      </Section>
    </div>
  );
}

function Findings({ data }: { data: ColdOpenSetupState }) {
  const out = data.outbound;
  const b = data.buyers;
  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (out) {
    stats.push({ value: String(out.campaigns.length), label: `campaigns in ${findSetupTool(`cold_open_${out.platform}`)?.label ?? out.platform}` });
    if (out.overallReplyRate != null) stats.push({ value: `${out.overallReplyRate}%`, label: "of people replied overall" });
    if (out.capacity != null) stats.push({ value: String(out.capacity), label: `emails a day across ${out.mailboxes.length} mailboxes` });
    const broken = out.mailboxes.filter((m) => m.broken || (m.health != null && m.health < 70)).length;
    if (broken) stats.push({ value: String(broken), label: "mailboxes unhealthy or not sending", warn: true });
  }
  if (b) stats.push({ value: String(b.companies), label: `customers behind ${b.wonDeals} won deals` });
  const best = out?.campaigns.filter((c) => c.replyRate != null).slice(0, 3) ?? [];
  const badDomains = out?.domains.filter((d) => !d.ok) ?? [];

  return (
    <section className="space-y-5">
      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-3">
          {stats.slice(0, 6).map((s) => (
            <div key={s.label} className="min-w-0">
              <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", s.warn ? "text-[var(--error)]" : "text-[var(--text-primary)]")}>{s.value}</p>
              <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {best.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">What worked best</p>
            <ul className="space-y-1.5">
              {best.map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{c.replyRate}% of {c.sent}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {b && (b.industries.length > 0 || b.sweetSpot) && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Who really buys</p>
            <ul className="space-y-1.5 text-[13px] text-[var(--text-secondary)]">
              {b.industries.slice(0, 3).map((i) => (
                <li key={i.industry}>
                  <span className="text-[var(--text-primary)]">{i.industry}</span>, {i.count} of {b.companies}
                </li>
              ))}
              {b.sweetSpot && (
                <li>
                  Mostly <span className="text-[var(--text-primary)]">{b.sweetSpot.min}{b.sweetSpot.max ? `-${b.sweetSpot.max}` : "+"} people</span> ({b.sweetSpot.share}%)
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {badDomains.length > 0 && (
        <div className="space-y-1.5 border-l-2 border-[var(--error)] pl-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">Fix before sending more</p>
          {badDomains.map((d) => (
            <p key={d.domain} className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{d.domain}:</span> {d.problems.join(" ")}
            </p>
          ))}
        </div>
      )}
      {out && out.blocked.length > 0 && <p className="text-xs text-[var(--text-muted)]">The key couldn&apos;t read: {out.blocked.join(", ")}.</p>}
    </section>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={cn("mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border", on ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--text-muted)]")}>
      {on && <Check className="h-3 w-3 text-[var(--ink-foreground)]" strokeWidth={3} />}
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 @xl:grid-cols-[170px_1fr] @xl:items-baseline @xl:gap-4">
      <p className="text-[13px] text-[var(--text-muted)]">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, tier, placeholder, multiline }: { label: string; value: string; onChange: (v: string) => void; tier: TrustTier; placeholder?: string; multiline?: boolean }) {
  const cls = cn(
    "w-full max-w-lg border-b bg-transparent text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]",
    tier === "likely" && value ? "border-[var(--text-prefill-accent)] bg-[var(--surface-prefill)]/50" : "border-[var(--text-muted)]/40"
  );
  return (
    <Field label={label}>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={cn(cls, "resize-y py-1.5 leading-relaxed")} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(cls, "h-10")} />
      )}
      {tier === "likely" && value && <p className="mt-1 text-[12px] text-[var(--text-prefill-accent)]">Our best guess. Check it.</p>}
    </Field>
  );
}

function Chips({ label, items, onRemove, onAdd, placeholder }: { label: string; items: string[]; onRemove: (i: number) => void; onAdd: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
      {label}
      {items.map((it, i) => (
        <button key={`${it}-${i}`} type="button" onClick={() => onRemove(i)} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[var(--text-primary)] cursor-pointer">
          {it} <X className="h-3 w-3 opacity-40" />
        </button>
      ))}
      <AddInline placeholder={placeholder} onAdd={onAdd} compact />
    </div>
  );
}

function AddInline({ placeholder, onAdd, compact }: { placeholder: string; onAdd: (v: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer", compact && "rounded-full border border-dashed px-2.5 py-0.5")}>
        <Plus className="h-3 w-3" /> {compact ? "Add" : placeholder}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") setOpen(false);
      }}
      onBlur={submit}
      placeholder={placeholder}
      className="h-8 w-72 max-w-full border-b border-[var(--text-primary)] bg-transparent text-[13px] text-[var(--text-primary)] outline-none"
    />
  );
}
