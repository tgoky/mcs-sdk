"use client";

// src/components/product-setup/rep-setup.tsx
//
// Reputation Manager's setup, one page, the same shape as Showtime's:
//   welcome   pick what to watch, the website (remembered), and optional
//             tools that add names (already-connected ones show as such;
//             one connection per client serves every product)
//   working   "Set it up" streams its real steps
//   review    a findings report: what we found (counts as headlines),
//             what we looked for and didn't find (collapsed), what's
//             still needed from you (top, accent), and Approve.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  SearchX,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { PlatformLogo } from "@/components/platform-logo";
import { REP_SKILL_MANIFEST, type RepSkillId } from "@/lib/rep-skill-manifest";
import { REP_ENGINE_LABELS } from "@/features/reputation-manager/engine-models";
import { REP_TOOLS, REP_TOOL_ADDS } from "@/lib/rep-setup/tools";
import { findShowtimeTool } from "@/lib/showtime-setup/catalog";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { FirstLook, RepGoogleListing, RepSetupState, TrustTier } from "@/lib/rep-setup/types";
import type { RepEngineId } from "@/models/schema";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { SkillSwitchRow } from "./skill-switch";
import { cn } from "@/lib/utils";

// ── Skills ─────────────────────────────────────────────────────────────

const REP_SETUP_SKILLS: RepSkillId[] = [
  "rep-engine-panel",
  "rep-google-reviews-watch",
  "rep-trustpilot-watch",
  "rep-reddit-watch",
  "rep-twitter-watch",
  "rep-news-watch",
  "rep-search-watch",
  "rep-crisis-response",
  "rep-digest",
];

const SKILL_BLURB: Partial<Record<RepSkillId, string>> = {
  "rep-engine-panel": "What ChatGPT, Claude, Perplexity, Grok and Gemini say about you.",
  "rep-google-reviews-watch": "New reviews on your Google listing, and bad ones nobody answered.",
  "rep-trustpilot-watch": "New Trustpilot reviews, daily.",
  "rep-reddit-watch": "Reddit threads and comments that name you.",
  "rep-twitter-watch": "Posts on X that name you or your handle.",
  "rep-news-watch": "News articles about you, your founder or your products.",
  "rep-search-watch": "What Google's first page shows next to \"reviews\" or \"scam\".",
  "rep-crisis-response": "Pages you the moment serious findings add up. Never posts anything.",
  "rep-digest": "One daily summary of the quieter findings.",
};

/** What each skill's own settings show. Every watch has an entry so a
 * focused view never lands on an empty page. */
const REP_FOCUS: Record<string, { rows: string[]; todos: string[]; save: boolean; about: string }> = {
  "rep-onboarding": {
    rows: ["name", "aliases", "domains", "handles", "emails", "google", "brands", "offerings", "competitors", "press", "collisions"],
    todos: ["name", "tools"],
    save: true,
    about: "Every name we watch for you, and where each one came from. Anything you switch off here stops being watched everywhere.",
  },
  "rep-crisis-response": {
    rows: ["threshold"],
    todos: ["authority"],
    save: true,
    about: "Pages one person the moment serious findings add up. Nothing is ever posted on your behalf.",
  },
  "rep-google-reviews-watch": {
    rows: ["google"],
    todos: [],
    save: true,
    about: "New reviews on your Google listing, and bad ones nobody answered.",
  },
  "rep-trustpilot-watch": {
    rows: ["name", "brands"],
    todos: [],
    save: true,
    about: "New Trustpilot reviews, daily. The names above are what we search Trustpilot for.",
  },
  "rep-reddit-watch": {
    rows: ["name", "brands", "competitors"],
    todos: [],
    save: true,
    about: "Reddit threads and comments that name you. Starred brands are searched every day.",
  },
  "rep-twitter-watch": {
    rows: ["name", "brands"],
    todos: [],
    save: true,
    about: "Posts on X that name you or your handle.",
  },
  "rep-news-watch": {
    rows: ["name", "brands", "press"],
    todos: [],
    save: true,
    about: "News articles that name you, your brands or your products.",
  },
  "rep-search-watch": {
    rows: ["name", "aliases", "brands"],
    todos: [],
    save: true,
    about: "What Google's first page shows next to these names with \"reviews\" or \"scam\".",
  },
  "rep-engine-panel": {
    rows: ["name", "prompts"],
    todos: [],
    save: true,
    about: "The questions we ask each AI engine on a schedule, then watch the answers.",
  },
  "rep-digest": {
    rows: [],
    todos: [],
    save: false,
    about: "One daily summary of the quieter findings from every watch. There's nothing to set.",
  },
};

const STAGES: ActivationStage[] = [
  { label: "Reading the site", prefix: "" },
  { label: "Gathering your names", prefix: "found-" },
  { label: "Checking your tools and Google", prefix: "account-" },
  { label: "Taking a first look", prefix: "look-" },
];

// ── Draft ──────────────────────────────────────────────────────────────

interface Toggle {
  value: string;
  on: boolean;
  sources: string[];
  tier: TrustTier;
}
interface EntityToggle extends Toggle {
  type: "company" | "brand" | "product" | "service" | "publication";
  highPriority: boolean;
}
interface CollisionToggle {
  name: string;
  whoTheyAre: string;
  disambiguationNote: string;
  on: boolean;
}

interface Draft {
  domain: string;
  operatorName: string;
  aliases: Toggle[];
  domains: Toggle[];
  emails: Toggle[];
  handles: (Toggle & { platform: string })[];
  entities: EntityToggle[];
  offerings: Toggle[];
  competitors: Toggle[];
  collisions: CollisionToggle[];
  press: Toggle[];
  prompts: Toggle[];
  soleAuthority: string;
  googleListing: RepGoogleListing | null;
  engines: string[];
  threshold: number | null;
  phone: string;
}

function draftFrom(s: RepSetupState, prevDomain?: string): Draft {
  const p = s.proposal;
  return {
    domain: prevDomain || s.website.domain || "",
    operatorName: p.operatorName.value,
    aliases: p.aliases.map((a) => ({ ...a })),
    domains: p.domains.map((a) => ({ ...a })),
    emails: p.emailContacts.map((a) => ({ ...a })),
    handles: p.handles.map((h) => ({ value: h.handle, platform: h.platform, on: h.on, sources: h.sources, tier: h.tier })),
    entities: p.entities.map((e) => ({ ...e })),
    offerings: p.offerings.map((a) => ({ ...a })),
    competitors: p.competitors.map((a) => ({ ...a })),
    collisions: p.collisions.map((c) => ({ name: c.name, whoTheyAre: c.whoTheyAre, disambiguationNote: c.disambiguationNote, on: c.on })),
    press: p.trustedSources.map((a) => ({ ...a })),
    prompts: p.seedPrompts.map((a) => ({ ...a })),
    soleAuthority: p.soleAuthority.saved ?? "",
    googleListing: p.googleListing?.listing ?? null,
    engines: s.engines.active ?? s.engines.available,
    threshold: s.crisisThreshold,
    phone: s.operatorPagePhone ?? "",
  };
}

const on = <T extends { on: boolean }>(xs: T[]) => xs.filter((x) => x.on);
const tally = (xs: { on: boolean }[]) => xs.filter((x) => x.on).length;

function bareHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

// ── Component ──────────────────────────────────────────────────────────

export function RepSetup({
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
  /** Opens as this one skill's own settings once Reputation Manager is set
   * up: only the rows it owns, saved without touching which skills are on. */
  focus?: string;
  /** The back chevron, when the caller renders one. Sits inline with the
   * title row so the header reads as one line, not two. */
  leading?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<RepSetupState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"welcome" | "working" | "review">("welcome");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [steps, setSteps] = useState<ActivationStep[]>([]);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const storageKey = `rep-setup:${engagementId}:domain`;
  // Which fields have been edited since load. Drives "unsaved changes" and
  // lets the settings view skip a save when nothing moved.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const markTouched = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  const [showMissing, setShowMissing] = useState(false);

  const load = useCallback(
    async (opts: { initial?: boolean } = {}) => {
      const res = await fetch(`/api/engagements/${engagementId}/setup/rep`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load Reputation Manager's setup.");
      const next = body as RepSetupState;
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
        return draftFrom(next, kept);
      });
      if (opts.initial) {
        setPhase(next.configured ? "review" : "welcome");
        setSkills(next.configured ? REP_SETUP_SKILLS.filter((id) => next.skills[id] !== false) : [...REP_SETUP_SKILLS]);
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
        setLoadError(e instanceof Error ? e.message : "Couldn't load Reputation Manager's setup.");
      }
    })();
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("composio_connected");
    const failed = url.searchParams.get("composio_error");
    if (connected) toast.success(`${findShowtimeTool(connected)?.label ?? connected} connected.`);
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
    setExtra: async (tool, extras) => {
      const err = await post(connectPath, { provider: tool.provider, ...extras });
      if (!err) {
        markTouched("tools");
        await load().catch(() => undefined);
      }
      return err;
    },
  };

  // ── Set it up ──
  async function activate() {
    if (!draft) return;
    setPhase("working");
    setSteps([]);
    setActivateError(null);
    setTimeout(() => document.getElementById("rep-progress")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/rep/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: draft.domain, skills }),
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
      const next = await load();
      if (!next.proposal.googleListing) setSkills((s) => s.filter((id) => id !== "rep-google-reviews-watch"));
      await new Promise((r) => setTimeout(r, 700));
      setPhase("review");
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  // ── Save ──
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!draft?.operatorName.trim()) m.push("your name");
    if (!draft?.soleAuthority.trim()) m.push("who we page in a crisis");
    return m;
  }, [draft]);

  const settings = Boolean(focus && data?.configured);
  const dirty = touched.size > 0;

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setSaveError(null);
    const name = draft.operatorName.trim();
    const entities = on(draft.entities).map((e) => ({
      name: e.value,
      aliases: [],
      type: e.type,
      domainsOwned: e.value === name ? on(draft.domains).map((d) => d.value) : [],
      handles: {},
      highPriority: e.highPriority,
    }));
    if (!entities.some((e) => e.name === name)) {
      entities.unshift({ name, aliases: [], type: "company", domainsOwned: on(draft.domains).map((d) => d.value), handles: {}, highPriority: true });
    }
    const body = {
      operatorName: name,
      operatorAliases: on(draft.aliases).map((a) => a.value),
      operatorDomains: on(draft.domains).map((d) => d.value),
      operatorEmailContacts: on(draft.emails).map((e) => e.value),
      operatorHandles: Object.fromEntries(on(draft.handles).map((h) => [h.platform, h.value])),
      entities,
      offerings: on(draft.offerings).map((o) => ({ name: o.value, aliases: [], surfaces: [], parentEntityName: name })),
      competitors: on(draft.competitors).map((c) => ({ name: c.value, monitorFor: [], highPriority: false })),
      collisions: on(draft.collisions).map((c) => ({ name: c.name, whoTheyAre: c.whoTheyAre, disambiguationNote: c.disambiguationNote })),
      trustedSources: on(draft.press).map((p) => p.value),
      seedPanelPrompts: on(draft.prompts).map((p) => p.value),
      soleAuthorityName: draft.soleAuthority.trim(),
      crisisThresholdOverride: draft.threshold,
      activeEngines: draft.engines.length === data.engines.available.length ? null : draft.engines,
      operatorPagePhone: draft.phone.trim() || null,
      googleListing: draft.googleListing,
      ...(settings ? {} : { skills: skills.filter((id) => id !== "rep-google-reviews-watch" || draft.googleListing) }),
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      await load().catch(() => undefined);
      if (settings) {
        if (onSaved) onSaved({});
        else toast.success("Saved.");
        return;
      }
      toast.success(data.configured ? "Saved." : `Watching ${name} now.`);
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

  const toolRow = <ToolRow data={data} buyer={data.buyer} actions={toolActions} />;

  return (
    <div className="@container w-full px-1">
      {phase === "review" ? (
        <div className="pb-16">
          <Review
            data={data}
            draft={draft}
            set={set}
            skills={skills}
            setSkills={setSkills}
            onReread={() => setPhase("welcome")}
            toolRow={toolRow}
            focus={settings ? focus : undefined}
            leading={leading}
            showMissing={showMissing}
            setShowMissing={setShowMissing}
          />
          {settings ? (
            REP_FOCUS[focus!]?.save ? (
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
              note={missing.length ? undefined : `${skills.length} ${skills.length === 1 ? "watch" : "watches"} on. Nothing ever posts on your behalf.`}
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
          skills={skills}
          onToggleSkill={(id, v) => setSkills((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)))}
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

// ── Pieces ─────────────────────────────────────────────────────────────

function RepMark({ size = 44 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-elevation-1 ring-1 ring-black/5 dark:ring-white/10" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static product mark, same as the Library's */}
      <img src="/images/repm.png" alt="" className="h-[82%] w-[82%] object-contain" />
    </span>
  );
}

function ToolRow({ data, buyer, actions }: { data: RepSetupState; buyer: string; actions: ToolActions }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-4">
      {REP_TOOLS.map((tool) => {
        const state = data.tools.find((t) => t.provider === tool.provider);
        return (
          <div key={tool.provider} className="flex w-[72px] flex-col items-center" title={`Adds ${REP_TOOL_ADDS[tool.provider]}`}>
            <ToolAvatar tool={tool} state={state} selected={Boolean(state?.linked)} buyer={buyer} actions={actions} />
          </div>
        );
      })}
      <a href={data.whop.connectHref} className="group flex w-[72px] flex-col items-center gap-1.5" title="Adds your product names">
        <span className={cn("relative flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 transition-shadow", data.whop.linked ? "ring-2 ring-[var(--ink)]" : "ring-[var(--border)] group-hover:ring-[var(--text-muted)]")}>
          <PlatformLogo provider="whop" size={26} />
          {data.whop.linked && (
            <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--text-secondary)]">Whop</span>
      </a>
    </div>
  );
}

// ── Shared header, used by welcome, review and a skill's settings ──────

function RepHeader({
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
      <RepMark size={size} />
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p>}
        <h1 className={cn("font-semibold leading-tight tracking-tight text-[var(--text-primary)]", size === 44 ? "text-[26px] @xl:text-[30px]" : "text-[19px]")}>
          {title}
        </h1>
        {subtitle && <div className="mt-1.5">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}

function Welcome({
  data,
  draft,
  setDomain,
  skills,
  onToggleSkill,
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
  data: RepSetupState;
  draft: Draft;
  setDomain: (v: string) => void;
  skills: string[];
  onToggleSkill: (id: string, on: boolean) => void;
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
  const connected = data.tools.filter((t) => t.linked).length + (data.whop.linked ? 1 : 0);
  return (
    <div className="space-y-9">
      <RepHeader
        leading={leading}
        title={`Watch ${data.buyer}'s reputation`}
        subtitle={
          <p className="max-w-xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
            We find every name people know you by, see where your reputation stands today, and watch it every day after. You check our work.
          </p>
        }
      />

      <section className={cn("space-y-2.5 transition-opacity", working && "pointer-events-none opacity-60")}>
        <label htmlFor="rep-website" className="flex items-baseline gap-2 text-sm font-medium text-[var(--text-primary)]">
          Your website
          <span className="text-xs font-normal text-[var(--text-muted)]">Where we find your names, socials and Google listing</span>
        </label>
        <div className="flex h-14 items-center border border-[var(--text-muted)]/40 bg-background transition-colors focus-within:border-[var(--text-primary)] dark:border-white/15">
          <span className="select-none pl-4 text-lg text-[var(--text-muted)]">https://</span>
          <input
            id="rep-website"
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
          <h2 className="flex items-baseline gap-2 text-sm font-medium text-[var(--text-primary)]">
            Connect your tools <span className="text-xs font-normal text-[var(--text-muted)]">Optional</span>
          </h2>
          <p className="mt-0.5 max-w-xl text-[13px] text-[var(--text-muted)]">
            {connected > 0 ? `${connected} already connected for ${data.buyer}, so there's nothing to redo. ` : ""}
            Connecting lets us also watch for your founder&apos;s and closers&apos; names, your products and your sender name.
          </p>
        </div>
        {toolRow}
      </section>

      <section className={cn("transition-opacity", working && "pointer-events-none opacity-60")}>
        <h2 className="text-sm font-medium text-[var(--text-primary)]">What should we watch?</h2>
        <ul className="mt-1 divide-y">
          {REP_SETUP_SKILLS.map((id) => (
            <SkillSwitchRow key={id} skillId={id} blurb={SKILL_BLURB[id] ?? REP_SKILL_MANIFEST[id].description} on={skills.includes(id)} onChange={(v) => onToggleSkill(id, v)} />
          ))}
        </ul>
      </section>

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="progress" id="rep-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ActivationProgress stages={STAGES} steps={steps} working={!activateError} host={host} error={activateError} onRetry={onActivate} />
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate} disabled={skills.length === 0}>
                Set it up <ArrowUpRight />
              </Button>
              <p className="text-[13px] text-[var(--text-muted)]">{skills.length === 0 ? "Switch on at least one thing to watch." : "About a minute. We take a first look while we're at it."}</p>
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
//
// One mark per *kind* of row, so a glance tells findings from guesses
// from absences from things worth a look. Not dots, not pills: lucide
// icons sized to sit on the row's first line.

function FoundMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
      <Check className="h-3 w-3" strokeWidth={3.5} />
    </span>
  );
}
function GuessMark() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[var(--text-muted)]">
      <CircleDashed className="h-4 w-4" />
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

function markFor(kind: "found" | "guess" | "missing" | "warn" | "notfound") {
  switch (kind) {
    case "found": return <FoundMark />;
    case "guess": return <GuessMark />;
    case "missing": return <MissingMark />;
    case "warn": return <WarnMark />;
    case "notfound": return <NotFoundMark />;
  }
}

// ── Findings ───────────────────────────────────────────────────────────
//
// A finding row leads with its count, when the count is the point. The
// chip row underneath is the same in every case. Rows where there's
// nothing (0 products) don't get their own row — they collect into the
// collapsed "looked for and didn't find" block below.

function FindingRow({
  kind,
  count,
  noun,
  tail,
  source,
  action,
  body,
}: {
  kind: "found" | "guess" | "missing" | "warn";
  /** The headline number, when the count is the point. */
  count?: number;
  /** What we're counting. */
  noun?: string;
  /** Rest of the sentence, after the count + noun. */
  tail?: ReactNode;
  /** Where the value came from, in a line under the headline. */
  source?: ReactNode;
  /** A "Change" / "This is us" affordance on the right. */
  action?: { label: string; onClick: () => void };
  /** The chip row or list of values. */
  body?: ReactNode;
}) {
  return (
    <li className="flex gap-3 py-5">
      {markFor(kind)}
      <div className="min-w-0 flex-1">
        {typeof count === "number" ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-[28px] font-semibold leading-none tabular-nums tracking-tight text-[var(--text-primary)]">{count}</span>
              {noun && <span className="text-[14px] font-medium text-[var(--text-primary)]">{noun}</span>}
            </p>
            {tail && <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">{tail}</p>}
          </>
        ) : (
          <p className="text-[15px] leading-snug text-[var(--text-secondary)]">{tail}</p>
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
  guess,
  title,
  onClick,
  star,
  children,
}: {
  on: boolean;
  guess?: boolean;
  title?: string;
  onClick: () => void;
  star?: { on: boolean; onToggle: () => void };
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors",
        on ? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]" : "border-dashed border-[var(--border)] text-[var(--text-muted)] line-through",
        guess && on && "border-dotted",
      )}
    >
      {star && (
        <button
          type="button"
          onClick={star.onToggle}
          aria-label={star.on ? "Unstar" : "Star, search it daily"}
          className={cn("flex h-4 w-4 items-center justify-center transition-colors cursor-pointer", star.on ? "text-amber-500" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
        >
          <Star className={cn("h-3.5 w-3.5", star.on && "fill-current")} strokeWidth={2.5} />
        </button>
      )}
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
  items: {
    value: string;
    on: boolean;
    guess?: boolean;
    hint?: string;
    star?: { on: boolean; onToggle: () => void };
  }[];
  onToggle: (i: number) => void;
  onAdd?: (value: string) => void;
  addLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((x, i) => (
        <Chip key={`${x.value}-${i}`} on={x.on} guess={x.guess} title={x.hint} onClick={() => onToggle(i)} star={x.star}>
          {x.value}
        </Chip>
      ))}
      {onAdd && addLabel && (
        adding ? (
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
        )
      )}
    </div>
  );
}

// ── Popover ────────────────────────────────────────────────────────────
//
// A small anchored editor, opened from a "Change" action on a finding.

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
        <div className="absolute right-0 z-20 mt-2 w-[320px] max-w-[80vw] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-elevation-2">
          <p className="mb-2.5 text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ── Still needed ───────────────────────────────────────────────────────

function StillNeeded({ items }: { items: { key: string; label: ReactNode; action: ReactNode }[] }) {
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

// ── Looked for, didn't find ────────────────────────────────────────────

function NotFound({
  items,
  open,
  onToggle,
}: {
  items: { key: string; noun: string; addLabel: string; onAdd: (v: string) => void }[];
  open: boolean;
  onToggle: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="border-t pt-5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left cursor-pointer"
        aria-expanded={open}
      >
        <SearchX className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="text-[14px] font-medium text-[var(--text-secondary)]">
          Looked for, found nothing: <span className="text-[var(--text-muted)]">{items.map((i) => i.noun).join(", ")}</span>
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 border-l-2 border-dashed border-[var(--border)] pl-4">
              {items.map((it) => (
                <div key={it.key} className="flex flex-wrap items-center gap-3">
                  <p className="text-[13px] text-[var(--text-muted)]">Nothing for {it.noun}.</p>
                  <Popover label={it.addLabel} title={`Add ${it.noun}`}>
                    {(close) => <AddOne noun={it.noun} onAdd={it.onAdd} close={close} />}
                  </Popover>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function AddOne({ noun, onAdd, close }: { noun: string; onAdd: (v: string) => void; close: () => void }) {
  const [v, setV] = useState("");
  return (
    <div className="space-y-2">
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v.trim());
            close();
          }
        }}
        placeholder={`Add ${noun.replace(/s$/, "")}`}
        className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (v.trim()) onAdd(v.trim());
            close();
          }}
          className="h-8 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] cursor-pointer"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Review ─────────────────────────────────────────────────────────────

type ListKey = "aliases" | "domains" | "emails" | "offerings" | "competitors" | "press" | "prompts";

const chipData = (xs: { value: string; on: boolean; sources: string[]; tier: TrustTier }[]) =>
  xs.map((x) => ({
    value: x.value,
    on: x.on,
    guess: x.tier === "likely",
    hint: `From ${x.sources.join(", ")}${x.on ? ". Tap to stop watching for it." : ". Tap to watch for it."}`,
  }));

function Review({
  data,
  draft,
  set,
  skills,
  setSkills,
  onReread,
  toolRow,
  focus,
  leading,
  showMissing,
  setShowMissing,
}: {
  data: RepSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft, key?: string) => void;
  skills: string[];
  setSkills: (fn: (s: string[]) => string[]) => void;
  onReread: () => void;
  toolRow: ReactNode;
  focus?: string;
  leading?: ReactNode;
  showMissing: boolean;
  setShowMissing: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const toggle = (key: ListKey) => (i: number) =>
    set((d) => ({ ...d, [key]: d[key].map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }), key);
  const add =
    (key: ListKey, clean: (v: string) => string = (v) => v) =>
    (raw: string) => {
      const value = clean(raw);
      if (!value) return;
      set(
        (d) =>
          d[key].some((x) => x.value.toLowerCase() === value.toLowerCase())
            ? d
            : { ...d, [key]: [...d[key], { value, on: true, sources: ["you"], tier: "done" as const }] },
        key,
      );
    };
  const suggestion = data.proposal.soleAuthority.suggestion;
  const found = data.proposal;
  const look = data.firstLook;
  const name = draft.operatorName.trim();
  const connected = data.tools.filter((t) => t.linked).length + (data.whop.linked ? 1 : 0);
  const listing = found.googleListing?.listing ?? null;
  const showPreviewCard = Boolean(look) && (
    look!.google?.rating != null ||
    look!.trustpilot?.rating != null ||
    look!.reddit != null ||
    look!.x != null ||
    look!.news != null
  );

  // ── Findings ──
  // Only rows with something in them. Empties go to the collapsed block.
  const findings: ReactNode[] = [];
  const notFound: { key: string; noun: string; addLabel: string; onAdd: (v: string) => void }[] = [];

  if (name) {
    findings.push(
      <FindingRow
        key="name"
        kind="found"
        tail={
          <>
            Watching for <span className="font-semibold text-[var(--text-primary)]">{name}</span>
            {data.website.domain ? <>, from <span className="font-medium text-[var(--text-primary)]">{data.website.domain}</span></> : null}.
          </>
        }
        source={found.operatorName.source ? `From ${found.operatorName.source}` : undefined}
        action={{ label: "Change", onClick: () => {} }} // replaced by popover below
      />,
    );
  } else {
    notFound.push({ key: "name", noun: "your business name", addLabel: "Add", onAdd: () => {} });
  }

  const aliasCount = tally(draft.aliases);
  if (draft.aliases.length > 0) {
    findings.push(
      <FindingRow
        key="aliases"
        kind={draft.aliases.some((a) => a.tier === "likely") ? "guess" : "found"}
        count={aliasCount}
        noun={aliasCount === 1 ? "other name" : "other names"}
        tail={<>We watch these alongside the main one.</>}
        body={<ChipRow items={chipData(draft.aliases)} onToggle={toggle("aliases")} onAdd={add("aliases")} addLabel="Add a name" />}
      />,
    );
  } else {
    notFound.push({ key: "aliases", noun: "other names", addLabel: "Add", onAdd: add("aliases") });
  }

  const domainCount = tally(draft.domains);
  if (draft.domains.length > 0) {
    findings.push(
      <FindingRow
        key="domains"
        kind="found"
        count={domainCount}
        noun={domainCount === 1 ? "website" : "websites"}
        tail={<>you own.</>}
        body={<ChipRow items={chipData(draft.domains)} onToggle={toggle("domains")} onAdd={add("domains", bareHost)} addLabel="Add a domain" />}
      />,
    );
  }

  const handleCount = tally(draft.handles);
  if (draft.handles.length > 0) {
    findings.push(
      <FindingRow
        key="handles"
        kind="found"
        count={handleCount}
        noun={handleCount === 1 ? "social handle" : "social handles"}
        body={
          <ChipRow
            items={draft.handles.map((h) => ({
              value: `${h.platform}: ${h.value}`,
              on: h.on,
              guess: h.tier === "likely",
              hint: `From ${h.sources.join(", ")}`,
            }))}
            onToggle={(i) => set((d) => ({ ...d, handles: d.handles.map((h, j) => (j === i ? { ...h, on: !h.on } : h)) }), "handles")}
          />
        }
      />,
    );
  }

  const emailCount = tally(draft.emails);
  if (draft.emails.length > 0) {
    findings.push(
      <FindingRow
        key="emails"
        kind="found"
        count={emailCount}
        noun={emailCount === 1 ? "contact email" : "contact emails"}
        body={<ChipRow items={chipData(draft.emails)} onToggle={toggle("emails")} onAdd={add("emails", (v) => v.trim().toLowerCase())} addLabel="Add an email" />}
      />,
    );
  } else {
    notFound.push({ key: "emails", noun: "contact emails", addLabel: "Add", onAdd: add("emails", (v) => v.trim().toLowerCase()) });
  }

  if (listing) {
    findings.push(
      <FindingRow
        key="google"
        kind={draft.googleListing ? "found" : "missing"}
        tail={
          draft.googleListing ? (
            <>
              Matched your Google listing, <span className="font-semibold text-[var(--text-primary)]">{listing.name}</span>
              {listing.address ? <>, {listing.address}</> : null}.
            </>
          ) : (
            <>
              Not watching the Google listing <span className="font-medium text-[var(--text-primary)]">{listing.name}</span>. You said it isn&apos;t you.
            </>
          )
        }
        action={{
          label: draft.googleListing ? "Not us" : "This is us",
          onClick: () => {
            const next = draft.googleListing ? null : listing;
            set((d) => ({ ...d, googleListing: next }), "google");
            if (!next) setSkills((s) => s.filter((id) => id !== "rep-google-reviews-watch"));
          },
        }}
      />,
    );
  }

  const entityCount = tally(draft.entities);
  if (draft.entities.length > 0) {
    findings.push(
      <FindingRow
        key="brands"
        kind="found"
        count={entityCount}
        noun={entityCount === 1 ? "brand" : "brands"}
        tail={<>Starred ones are searched on Reddit and X every day.</>}
        body={
          <ChipRow
            items={draft.entities.map((e, i) => ({
              value: e.value,
              on: e.on,
              guess: e.tier === "likely",
              hint: `From ${e.sources.join(", ")}`,
              star: {
                on: e.highPriority,
                onToggle: () => set((d) => ({ ...d, entities: d.entities.map((x, j) => (j === i ? { ...x, highPriority: !x.highPriority, on: true } : x)) }), "entities"),
              },
            }))}
            onToggle={(i) => set((d) => ({ ...d, entities: d.entities.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }), "entities")}
          />
        }
      />,
    );
  }

  const offeringCount = tally(draft.offerings);
  if (draft.offerings.length > 0) {
    findings.push(
      <FindingRow
        key="offerings"
        kind="found"
        count={offeringCount}
        noun={offeringCount === 1 ? "product" : "products"}
        body={<ChipRow items={chipData(draft.offerings)} onToggle={toggle("offerings")} onAdd={add("offerings")} addLabel="Add a product" />}
      />,
    );
  } else {
    notFound.push({ key: "offerings", noun: "products", addLabel: "Add", onAdd: add("offerings") });
  }

  const competitorCount = tally(draft.competitors);
  if (draft.competitors.length > 0) {
    findings.push(
      <FindingRow
        key="competitors"
        kind="found"
        count={competitorCount}
        noun={competitorCount === 1 ? "competitor" : "competitors"}
        tail={<>so we can tell when you&apos;re compared.</>}
        body={<ChipRow items={chipData(draft.competitors)} onToggle={toggle("competitors")} onAdd={add("competitors")} addLabel="Add a competitor" />}
      />,
    );
  } else {
    notFound.push({ key: "competitors", noun: "competitors", addLabel: "Add", onAdd: add("competitors") });
  }

  const pressCount = tally(draft.press);
  if (draft.press.length > 0) {
    findings.push(
      <FindingRow
        key="press"
        kind="found"
        count={pressCount}
        noun={pressCount === 1 ? "publication" : "publications"}
        tail={<>that&apos;s covered you.</>}
        body={<ChipRow items={chipData(draft.press)} onToggle={toggle("press")} onAdd={add("press")} addLabel="Add a publication" />}
      />,
    );
  }

  if (draft.collisions.length > 0) {
    findings.push(
      <FindingRow
        key="collisions"
        kind="guess"
        count={tally(draft.collisions)}
        noun={tally(draft.collisions) === 1 ? "other" : "others"}
        tail={<>with a similar name. We keep them apart from you.</>}
        body={
          <ul className="space-y-1.5">
            {draft.collisions.map((c, i) => (
              <li key={c.name} className="flex items-baseline gap-3 text-[13px]">
                <span className={c.on ? "min-w-0 flex-1 text-[var(--text-secondary)]" : "min-w-0 flex-1 text-[var(--text-muted)] line-through"}>
                  <span className="font-medium text-[var(--text-primary)]">{c.name}</span>, {c.whoTheyAre}
                </span>
                <button
                  type="button"
                  onClick={() => set((d) => ({ ...d, collisions: d.collisions.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }), "collisions")}
                  className="shrink-0 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {c.on ? "Remove" : "Keep apart"}
                </button>
              </li>
            ))}
          </ul>
        }
      />,
    );
  }

  const promptCount = tally(draft.prompts);
  if (skills.includes("rep-engine-panel") && draft.prompts.length > 0) {
    findings.push(
      <FindingRow
        key="prompts"
        kind="found"
        count={promptCount}
        noun={promptCount === 1 ? "question" : "questions"}
        tail={<>{<>we&apos;ll ask</>} <span className="font-medium text-[var(--text-primary)]">{draft.engines.length} AI {draft.engines.length === 1 ? "engine" : "engines"}</span> on a schedule, then watch the answers.</>}
        body={
          <div className="space-y-2">
            <ChipRow items={chipData(draft.prompts)} onToggle={toggle("prompts")} onAdd={add("prompts")} addLabel="Add a question" />
            <ChipRow
              items={data.engines.available.map((e) => ({
                value: REP_ENGINE_LABELS[e as RepEngineId] ?? e,
                on: draft.engines.includes(e),
              }))}
              onToggle={(i) => {
                const e = data.engines.available[i];
                set((d) => ({ ...d, engines: d.engines.includes(e) ? d.engines.filter((x) => x !== e) : [...d.engines, e] }), "engines");
              }}
            />
          </div>
        }
      />,
    );
  } else if (skills.includes("rep-engine-panel")) {
    notFound.push({ key: "prompts", noun: "AI panel questions", addLabel: "Add", onAdd: add("prompts") });
  }

  if (skills.includes("rep-crisis-response") || focus === "rep-crisis-response") {
    findings.push(
      <FindingRow
        key="threshold"
        kind="found"
        tail={<>Page at severity <span className="font-semibold text-[var(--text-primary)] tabular-nums">{draft.threshold ?? 80}</span>{draft.threshold == null ? " (the default)" : ""}.</>}
        source="Lower pages you sooner."
        action={{ label: "Change", onClick: () => {} }}
      />,
    );
  }

  // ── The "what's happening right now" preview card, only if there's
  // something to show. Counts here are the current reputation, not what
  // we watch — the two don't share a register. ──
  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (look?.google?.rating != null) {
    stats.push({ value: `${look.google.rating}★`, label: `Google${look.google.reviews != null ? `, ${look.google.reviews} reviews` : ""}` });
  }
  if (look?.google && look.google.unansweredNegative > 0) {
    stats.push({ value: String(look.google.unansweredNegative), label: "bad reviews, no reply", warn: true });
  }
  if (look?.trustpilot?.rating != null) stats.push({ value: `${look.trustpilot.rating}★`, label: "Trustpilot" });
  if (look?.reddit) stats.push({ value: String(look.reddit.mentions), label: `Reddit this month${look.reddit.negative ? `, ${look.reddit.negative} negative` : ""}`, warn: look.reddit.negative > 0 });
  if (look?.x) stats.push({ value: String(look.x.mentions), label: `X this month${look.x.negative ? `, ${look.x.negative} negative` : ""}`, warn: look.x.negative > 0 });
  if (look?.news) stats.push({ value: String(look.news.articles), label: `news this month${look.news.negative ? `, ${look.news.negative} negative` : ""}`, warn: look.news.negative > 0 });

  // ── What's still needed from you: the only place we ask for something. ──
  const needed: { key: string; label: ReactNode; action: ReactNode }[] = [];
  if (!name) {
    needed.push({
      key: "name",
      label: <>Add the name you do business under.</>,
      action: (
        <Popover label="Add" title="Your name" strong>
          {(close) => <NameEditor draft={draft} set={set} close={close} />}
        </Popover>
      ),
    });
  }
  const authority = draft.soleAuthority.trim();
  if (!authority) {
    needed.push({
      key: "authority",
      label: <>Choose who&apos;s paged when something&apos;s serious. Nothing is ever posted on your behalf.</>,
      action: (
        <Popover label="Choose" title="Who's paged" strong>
          {(close) => <AuthorityEditor draft={draft} set={set} close={close} suggestion={suggestion} />}
        </Popover>
      ),
    });
  }

  // ── The focused view: a skill's own settings. ──
  if (focus) {
    const f = REP_FOCUS[focus] ?? { rows: [], todos: [], save: false, about: "" };
    const rowKeys = new Set(f.rows);
    const shown = findings.filter((_, i) => {
      // Findings preserve insertion order; the keys we accept are the ones
      // a skill declares. We map by matching the entry's react key.
      const key = (findings[i] as any)?.key as string | undefined;
      return key ? rowKeys.has(key) : true;
    });
    return (
      <div className="space-y-8 pb-10">
        <RepHeader
          size={36}
          leading={leading}
          eyebrow="Reputation Manager"
          title={REP_SKILL_MANIFEST[focus as RepSkillId]?.name ?? "Settings"}
          subtitle={<p className="text-[14px] leading-relaxed text-[var(--text-secondary)]">{f.about}</p>}
          trailing={
            <a
              href={`/dashboard/engagements/${data.engagementId}/bridges/rep-onboarding?from=${encodeURIComponent(pathname)}`}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Full setup <ArrowUpRight className="h-3 w-3" />
            </a>
          }
        />
        {shown.length > 0 && <ul className="divide-y">{shown}</ul>}
        {f.todos.length > 0 && (
          <section className="space-y-2 border-t pt-5">
            <h2 className="text-[13px] font-medium text-[var(--text-secondary)]">Still needed</h2>
            <ul className="space-y-3">
              {needed.filter((n) => f.todos.includes(n.key)).map((n) => (
                <li key={n.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <p className="min-w-0 text-[14px] leading-relaxed text-[var(--text-secondary)]">{n.label}</p>
                  <div className="shrink-0">{n.action}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ── The full review. ──
  return (
    <div className="space-y-8 pb-4">
      <RepHeader
        size={44}
        leading={leading}
        eyebrow="Reputation Manager"
        title={`${name || data.buyer}, right now`}
        subtitle={
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--text-muted)]">
            {data.website.domain && <span className="text-[var(--text-secondary)]">{data.website.domain}</span>}
            {data.website.domain && <span aria-hidden>·</span>}
            <span>{connected > 0 ? `${connected} ${connected === 1 ? "tool" : "tools"} connected` : "No tools yet"}</span>
            <span aria-hidden>·</span>
            <span>Never posts for you</span>
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

      {showPreviewCard && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Right now</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-4">
            {stats.slice(0, 4).map((x) => (
              <div key={x.label} className="min-w-0">
                <p className={cn("text-[32px] font-semibold leading-none tabular-nums tracking-tight", x.warn ? "text-[var(--error)]" : "text-[var(--text-primary)]")}>
                  {x.value}
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">{x.label}</p>
              </div>
            ))}
          </div>
          {look && look.skipped.length > 0 && (
            <p className="text-[12px] text-[var(--text-muted)]">Not checked this time: {look.skipped.join(", ")}.</p>
          )}
        </section>
      )}

      {look && (look.engines.length > 0 || (look.search?.results.some((r) => r.risky) ?? false) || (look.google?.recentNegative?.length ?? 0) > 0) && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">Worth a look today</h2>
          <WorthALook look={look} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">What we watch</h2>
        <ul className="divide-y">{findings}</ul>
      </section>

      <NotFound
        items={notFound}
        open={showMissing}
        onToggle={() => setShowMissing(!showMissing)}
      />

      {skills.includes("rep-digest") && (
        <p className="border-t pt-5 text-[13px] text-[var(--text-muted)]">
          A daily summary of the quieter findings from every watch lands on your dashboard, no setup needed.
        </p>
      )}
    </div>
  );
}

// ── Editors ────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-[var(--border)] bg-background px-3 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--ring)]/40";

function Done({ close }: { close: () => void }) {
  return (
    <div className="flex justify-end pt-1">
      <button type="button" onClick={close} className="h-8 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] cursor-pointer">
        Done
      </button>
    </div>
  );
}

function Labeled({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function NameEditor({ draft, set, close }: { draft: Draft; set: (fn: (d: Draft) => Draft, key?: string) => void; close: () => void }) {
  return (
    <div className="space-y-3">
      <Labeled label="The name you do business under">
        <input
          aria-label="Your name"
          autoFocus
          value={draft.operatorName}
          onChange={(e) => set((d) => ({ ...d, operatorName: e.target.value }), "name")}
          onKeyDown={(e) => e.key === "Enter" && close()}
          className={`${inputCls} h-9`}
        />
      </Labeled>
      <Done close={close} />
    </div>
  );
}

function AuthorityEditor({
  draft,
  set,
  close,
  suggestion,
}: {
  draft: Draft;
  set: (fn: (d: Draft) => Draft, key?: string) => void;
  close: () => void;
  suggestion: { name: string; role?: string | null } | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
        The one person who decides what to do when serious findings add up. Nothing is ever posted on your behalf.
      </p>
      <Labeled label="Their name">
        <input
          aria-label="Who's paged"
          autoFocus
          value={draft.soleAuthority}
          onChange={(e) => set((d) => ({ ...d, soleAuthority: e.target.value }), "authority")}
          placeholder="Their name"
          className={`${inputCls} h-9`}
        />
      </Labeled>
      {!draft.soleAuthority.trim() && suggestion && (
        <button
          type="button"
          onClick={() => set((d) => ({ ...d, soleAuthority: suggestion.name }), "authority")}
          className="rounded-full border border-dashed px-3 py-1 text-[13px] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          Use {suggestion.name}
          {suggestion.role ? `, ${suggestion.role}` : ""}
        </button>
      )}
      <Labeled label="Text them too (optional)">
        <input
          aria-label="Phone"
          value={draft.phone}
          onChange={(e) => set((d) => ({ ...d, phone: e.target.value }), "phone")}
          placeholder="Phone number"
          inputMode="tel"
          className={`${inputCls} h-9`}
        />
      </Labeled>
      <Done close={close} />
    </div>
  );
}

function ThresholdEditor({ draft, set, close }: { draft: Draft; set: (fn: (d: Draft) => Draft, key?: string) => void; close: () => void }) {
  return (
    <div className="space-y-3">
      <Labeled label={`Page at severity ${draft.threshold ?? 80}${draft.threshold == null ? " (the default)" : ""}`}>
        <input
          aria-label="Severity"
          type="range"
          min={50}
          max={95}
          step={5}
          value={draft.threshold ?? 80}
          onChange={(e) => set((d) => ({ ...d, threshold: Number(e.target.value) === 80 ? null : Number(e.target.value) }), "threshold")}
          className="w-full accent-[var(--ink)]"
        />
      </Labeled>
      <p className="text-[12px] text-[var(--text-muted)]">Lower pages you sooner.</p>
      <Done close={close} />
    </div>
  );
}

// ── Worth a look ───────────────────────────────────────────────────────

function WorthALook({ look }: { look: FirstLook }) {
  const risky = look.search?.results.filter((r) => r.risky) ?? [];
  return (
    <ul className="space-y-3">
      {look.engines.map((e) => (
        <li key={e.engine} className="flex gap-3">
          <span className={cn("mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center", e.sentiment === "negative" || e.flagged ? "text-[var(--error)]" : e.sentiment === "positive" ? "text-emerald-500" : "text-[var(--text-muted)]")}>
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">{e.engine}</p>
            <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{e.excerpt}</p>
          </div>
        </li>
      ))}
      {look.google?.recentNegative.map((r, i) => (
        <li key={`g${i}`} className="flex gap-3">
          <span className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--error)]">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">Google, {r.rating}★:</span> {r.text}
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        </li>
      ))}
      {risky.slice(0, 3).map((r) => (
        <li key={r.url} className="flex gap-3">
          <span className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--error)]">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">#{r.position} on Google for {look.search!.query}:</span>{" "}
            <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]">
              {r.title}
            </a>
          </p>
        </li>
      ))}
    </ul>
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