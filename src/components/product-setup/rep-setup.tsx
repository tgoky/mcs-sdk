"use client";

// src/components/product-setup/rep-setup.tsx
//
// Reputation Manager's setup, one page, the same shape as Showtime's:
//   welcome   pick what to watch, the website (remembered), and optional
//             tools that add names (already-connected ones show as such;
//             one connection per client serves every product)
//   working   "Set it up" streams its real steps
//   review    where the reputation stands right now, "What we did" (every
//             name the watches will search for, as chips switched in place,
//             each with where it came from), "Left to do" (who's paged in a
//             crisis, never pre-filled), and Approve.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, ExternalLink, Loader2 } from "lucide-react";
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
import { ApproveBar, ChipRow, Feed, Labeled, Pill, Popover, ReviewCard, SettingsHeader, Todos, ToggleList, inputCls, pick, type FeedEntry, type TodoItem } from "./review-kit";
import { cn } from "@/lib/utils";

// ── Skills ─────────────────────────────────────────────────────────────

/** Watch skills a person picks; Identity Setup itself is always on. */
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

/** What each skill's own settings show: the review rows (and "Left to do"
 * steps) it owns, and a line on what it does. */
const REP_FOCUS: Record<string, { rows: string[]; todos: string[]; save: boolean; about?: string }> = {
  "rep-onboarding": { rows: ["name", "aliases", "domains", "handles", "emails", "google", "brands", "offerings", "competitors", "press", "collisions"], todos: ["name", "tools"], save: true },
  "rep-crisis-response": { rows: ["threshold"], todos: ["authority"], save: true, about: "Pages this person the moment serious findings add up. Nothing is ever posted on your behalf." },
  "rep-google-reviews-watch": { rows: ["google"], todos: [], save: true, about: "New reviews on your Google listing, and bad ones nobody answered." },
  "rep-news-watch": { rows: ["name", "brands", "press"], todos: [], save: true, about: "News articles that name you, your brands or your products." },
  "rep-search-watch": { rows: ["name", "aliases", "brands"], todos: [], save: true, about: "What Google's first page shows next to these names with \u201creviews\u201d or \u201cscam\u201d." },
  "rep-digest": { rows: [], todos: [], save: false, about: "One daily summary of the quieter findings from every watch. There's nothing to set." },
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
    // Never pre-filled: a crisis contact is someone a person names.
    soleAuthority: p.soleAuthority.saved ?? "",
    googleListing: p.googleListing?.listing ?? null,
    engines: s.engines.active ?? s.engines.available,
    threshold: s.crisisThreshold,
    phone: s.operatorPagePhone ?? "",
  };
}

const on = <T extends { on: boolean }>(xs: T[]) => xs.filter((x) => x.on);

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
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
  /** Opens as this one skill's own settings once Reputation Manager is set
   * up: only the rows it owns, saved without touching which skills are on. */
  focus?: string;
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
    setExtra: async (tool, extras) => {
      const err = await post(connectPath, { provider: tool.provider, ...extras });
      if (!err) await load().catch(() => undefined);
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
      // No Google listing matched: that watch has nothing to watch.
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
  const dirty = useMemo(() => (data && draft ? JSON.stringify({ ...draft, domain: "" }) !== JSON.stringify({ ...draftFrom(data), domain: "" }) : false), [data, draft]);

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setSaveError(null);
    const name = draft.operatorName.trim();
    const entities = on(draft.entities).map((e) => ({ name: e.value, aliases: [], type: e.type, domainsOwned: e.value === name ? on(draft.domains).map((d) => d.value) : [], handles: {}, highPriority: e.highPriority }));
    // Offerings hang off an entity; the business itself is always one.
    if (!entities.some((e) => e.name === name)) entities.unshift({ name, aliases: [], type: "company", domainsOwned: on(draft.domains).map((d) => d.value), handles: {}, highPriority: true });
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
      // A skill's own settings leave which skills are on alone.
      ...(settings ? {} : { skills: skills.filter((id) => id !== "rep-google-reviews-watch" || draft.googleListing) }),
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      await load().catch(() => undefined);
      if (settings) {
        // The panel it opened in says it saved; elsewhere, say so here.
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

  const toolRow = (
    <ToolRow data={data} buyer={data.buyer} actions={toolActions} />
  );

  return (
    <div className="@container w-full px-1 pb-4">
      {phase === "review" ? (
        <>
          <Review data={data} draft={draft} set={set} skills={skills} setSkills={setSkills} onReread={() => setPhase("welcome")} toolRow={toolRow} focus={settings ? focus : undefined} />
          {settings ? (
            REP_FOCUS[focus!]?.save && (
              <ApproveBar
                label="Save"
                note={missing.length ? `Add ${missing.join(" and ")}, then save.` : undefined}
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
              note={missing.length ? `Add ${missing.join(" and ")} below, then approve.` : `${skills.length} ${skills.length === 1 ? "watch" : "watches"} ready. Nothing ever posts on your behalf.`}
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
}) {
  const host = bareHost(draft.domain);
  const known = Boolean(data.website.domain) && bareHost(data.website.domain ?? "") === host;
  const connected = data.tools.filter((t) => t.linked).length + (data.whop.linked ? 1 : 0);
  return (
    <div className="space-y-9">
      <header className="flex items-start gap-4">
        <RepMark />
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[30px]">Watch {data.buyer}&apos;s reputation</h1>
          <p className="max-w-xl text-[15px] leading-relaxed">
            We find every name people know you by, see where your reputation stands today, and watch it every day after. You check our work.
          </p>
        </div>
      </header>

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
            {connected > 0
              ? `${connected} already connected for ${data.buyer}, so there's nothing to redo. `
              : ""}
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

// ── Review ─────────────────────────────────────────────────────────────

type ListKey = "aliases" | "domains" | "emails" | "offerings" | "competitors" | "press" | "prompts";

const chips = (xs: { value: string; on: boolean; sources: string[]; tier: TrustTier }[]) =>
  xs.map((x) => ({
    value: x.value,
    on: x.on,
    guess: x.tier === "likely",
    hint: `From ${x.sources.join(", ")}${x.on ? ". Tap to stop watching for it." : ". Tap to watch for it."}`,
  }));

const count = (xs: { on: boolean }[], one: string, many = `${one}s`) => {
  const n = xs.filter((x) => x.on).length;
  return `${n} ${n === 1 ? one : many}`;
};

function Review({
  data,
  draft,
  set,
  skills,
  setSkills,
  onReread,
  toolRow,
  focus,
}: {
  data: RepSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  setSkills: (fn: (s: string[]) => string[]) => void;
  onReread: () => void;
  toolRow: ReactNode;
  focus?: string;
}) {
  const toggle = (key: ListKey) => (i: number) =>
    set((d) => ({
      ...d,
      [key]: d[key].map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
    }));
  const add =
    (key: ListKey, clean: (v: string) => string = (v) => v) =>
    (raw: string) => {
      const value = clean(raw);
      if (!value) return;
      set((d) =>
        d[key].some((x) => x.value.toLowerCase() === value.toLowerCase())
          ? d
          : {
              ...d,
              [key]: [...d[key], { value, on: true, sources: ["you"], tier: "done" as const }],
            },
      );
    };
  const suggestion = data.proposal.soleAuthority.suggestion;
  const found = data.proposal;
  const look = data.firstLook;
  const name = draft.operatorName.trim();
  const connected = data.tools.filter((t) => t.linked).length + (data.whop.linked ? 1 : 0);
  const listing = found.googleListing?.listing ?? null;

  const feed: FeedEntry[] = [];
  // Where the name lives follows what was found, so its editor stays open
  // while someone types it.
  const nameFound = Boolean(found.operatorName.value.trim());
  if (nameFound && name) {
    feed.push({
      key: "name",
      text: (
        <>
          Watching for <b>{name}</b>
          {data.website.domain ? <>, from {data.website.domain}</> : null}.
        </>
      ),
      source: found.operatorName.source ? `From ${found.operatorName.source}` : undefined,
      editor: (close) => <NameEditor draft={draft} set={set} close={close} />,
      undo: draft.operatorName !== found.operatorName.value ? () => set((d) => ({ ...d, operatorName: found.operatorName.value })) : undefined,
    });
  }
  feed.push({
    key: "aliases",
    text: (
      <>
        Also known as <b>{count(draft.aliases, "other name")}</b>.
      </>
    ),
    body: <ChipRow items={chips(draft.aliases)} onToggle={toggle("aliases")} onAdd={add("aliases")} addLabel="Add a name" />,
  });
  feed.push({
    key: "domains",
    text: (
      <>
        <b>{count(draft.domains, "website")}</b> you own.
      </>
    ),
    body: <ChipRow items={chips(draft.domains)} onToggle={toggle("domains")} onAdd={add("domains", bareHost)} addLabel="Add a domain" />,
  });
  if (draft.handles.length)
    feed.push({
      key: "handles",
      text: (
        <>
          <b>{count(draft.handles, "social handle")}</b>.
        </>
      ),
      body: (
        <ChipRow
          items={chips(
            draft.handles.map((h) => ({
              ...h,
              value: `${h.platform}: ${h.value}`,
            })),
          )}
          onToggle={(i) =>
            set((d) => ({
              ...d,
              handles: d.handles.map((h, j) => (j === i ? { ...h, on: !h.on } : h)),
            }))
          }
        />
      ),
    });
  feed.push({
    key: "emails",
    text: (
      <>
        <b>{count(draft.emails, "contact email")}</b>.
      </>
    ),
    body: <ChipRow items={chips(draft.emails)} onToggle={toggle("emails")} onAdd={add("emails", (v) => v.trim().toLowerCase())} addLabel="Add an email" />,
  });
  if (listing) {
    feed.push({
      key: "google",
      todo: !draft.googleListing,
      text: draft.googleListing ? (
        <>
          Matched your Google listing, <b>{listing.name}</b>
          {listing.address ? <>, {listing.address}</> : null}.
        </>
      ) : (
        <>
          Not watching the Google listing <b>{listing.name}</b>. You said it isn&apos;t you.
        </>
      ),
      action: {
        label: draft.googleListing ? "Not us" : "This is us",
        onClick: () => {
          const next = draft.googleListing ? null : listing;
          set((d) => ({ ...d, googleListing: next }));
          if (!next) setSkills((s) => s.filter((id) => id !== "rep-google-reviews-watch"));
        },
      },
    });
  }
  feed.push({
    key: "brands",
    text: (
      <>
        <b>{count(draft.entities, "brand")}</b>. Starred ones are searched on Reddit and X every day.
      </>
    ),
    body: (
      <ChipRow
        items={draft.entities.map((e, i) => ({
          value: e.value,
          on: e.on,
          guess: e.tier === "likely",
          hint: `From ${e.sources.join(", ")}`,
          star: {
            on: e.highPriority,
            onToggle: () =>
              set((d) => ({
                ...d,
                entities: d.entities.map((x, j) => (j === i ? { ...x, highPriority: !x.highPriority, on: true } : x)),
              })),
          },
        }))}
        onToggle={(i) =>
          set((d) => ({
            ...d,
            entities: d.entities.map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
          }))
        }
      />
    ),
  });
  feed.push({
    key: "offerings",
    text: (
      <>
        <b>{count(draft.offerings, "product")}</b>.
      </>
    ),
    body: <ChipRow items={chips(draft.offerings)} onToggle={toggle("offerings")} onAdd={add("offerings")} addLabel="Add a product" />,
  });
  feed.push({
    key: "competitors",
    text: (
      <>
        <b>{count(draft.competitors, "competitor")}</b>, so we can tell when you&apos;re compared.
      </>
    ),
    body: <ChipRow items={chips(draft.competitors)} onToggle={toggle("competitors")} onAdd={add("competitors")} addLabel="Add a competitor" />,
  });
  if (draft.press.length)
    feed.push({
      key: "press",
      text: (
        <>
          <b>{count(draft.press, "publication")}</b> that&apos;s covered you.
        </>
      ),
      body: <ChipRow items={chips(draft.press)} onToggle={toggle("press")} onAdd={add("press")} addLabel="Add a publication" />,
    });
  if (draft.collisions.length)
    feed.push({
      key: "collisions",
      text: (
        <>
          <b>{count(draft.collisions, "other", "others")}</b> with a similar name. We keep them apart from you.
        </>
      ),
      body: (
        <ul className="space-y-1.5">
          {draft.collisions.map((c, i) => (
            <li key={c.name} className="flex items-baseline gap-3 text-[13px]">
              <span className={c.on ? "min-w-0 flex-1 text-[var(--text-secondary)]" : "min-w-0 flex-1 text-[var(--text-muted)] line-through"}>
                <span className="font-medium text-[var(--text-primary)]">{c.name}</span>, {c.whoTheyAre}
              </span>
              <button
                type="button"
                onClick={() =>
                  set((d) => ({
                    ...d,
                    collisions: d.collisions.map((x, j) => (j === i ? { ...x, on: !x.on } : x)),
                  }))
                }
                className="shrink-0 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {c.on ? "Remove" : "Keep apart"}
              </button>
            </li>
          ))}
        </ul>
      ),
    });
  if (skills.includes("rep-engine-panel"))
    feed.push({
      key: "prompts",
      text: (
        <>
          <b>{count(draft.prompts, "question")}</b> we&apos;ll ask <b>{draft.engines.length} AI {draft.engines.length === 1 ? "engine" : "engines"}</b> on a schedule, then watch the answers.
        </>
      ),
      body: (
        <div className="space-y-2">
          <ChipRow items={chips(draft.prompts)} onToggle={toggle("prompts")} onAdd={add("prompts")} addLabel="Add a question" />
          <ChipRow
            items={data.engines.available.map((e) => ({
              value: REP_ENGINE_LABELS[e as RepEngineId] ?? e,
              on: draft.engines.includes(e),
            }))}
            onToggle={(i) => {
              const e = data.engines.available[i];
              set((d) => ({
                ...d,
                engines: d.engines.includes(e) ? d.engines.filter((x) => x !== e) : [...d.engines, e],
              }));
            }}
          />
        </div>
      ),
    });
  if (look?.engines.length)
    feed.push({
      key: "look-engines",
      text: <>Asked the AI engines about you once already.</>,
      body: <EngineAnswers look={look} />,
    });
  const risky = look?.search?.results.filter((r) => r.risky) ?? [];
  const badReviews = look?.google?.recentNegative ?? [];
  if (risky.length || badReviews.length)
    feed.push({
      key: "look-risky",
      warn: true,
      text: (
        <>
          <b>
            {risky.length + badReviews.length} {risky.length + badReviews.length === 1 ? "thing" : "things"}
          </b>{" "}
          worth a look today.
        </>
      ),
      body: <WorthALook look={look!} />,
    });
  if (skills.includes("rep-crisis-response") || focus === "rep-crisis-response")
    feed.push({
      key: "threshold",
      text: (
        <>
          Page at severity <b>{draft.threshold ?? 80}</b>
          {draft.threshold == null ? " (the default)" : ""}.
        </>
      ),
      source: "Lower pages you sooner.",
      editor: (close) => <ThresholdEditor draft={draft} set={set} close={close} />,
      undo: draft.threshold !== data.crisisThreshold ? () => set((d) => ({ ...d, threshold: data.crisisThreshold })) : undefined,
    });
  feed.push({
    key: "skills",
    text: (
      <>
        <b>
          {skills.length} of {REP_SETUP_SKILLS.length}
        </b>{" "}
        watches are on.
      </>
    ),
    editor: () => (
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">Watches</p>
        <ToggleList
          items={REP_SETUP_SKILLS.map((id) => {
            const noListing = id === "rep-google-reviews-watch" && !draft.googleListing;
            return {
              label: REP_SKILL_MANIFEST[id].name,
              hint: noListing ? "No Google listing is matched, so there's nothing to watch here yet." : SKILL_BLURB[id],
              on: skills.includes(id) && !noListing,
            };
          })}
          onToggle={(i) => {
            const id = REP_SETUP_SKILLS[i];
            if (id === "rep-google-reviews-watch" && !draft.googleListing) return;
            setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
          }}
        />
      </div>
    ),
  });

  const authority = draft.soleAuthority.trim();
  const todos: TodoItem[] = [];
  if (!nameFound || !name)
    todos.push({
      key: "name",
      label: name ? `Watching for ${name}` : "Add the name you do business under",
      done: Boolean(name),
      action: (
        <Popover label={name ? "Change" : "Add"} title="Your name" strong={!name}>
          {(close) => <NameEditor draft={draft} set={set} close={close} />}
        </Popover>
      ),
    });
  todos.push({
    key: "authority",
    label: authority ? (
      <>
        <b className="font-semibold text-[var(--text-primary)]">{authority}</b>{" "}is paged when something&apos;s serious
        {draft.phone.trim() ? <>, and texted at {draft.phone.trim()}</> : null}
      </>
    ) : (
      "Choose who's paged when something's serious"
    ),
    done: Boolean(authority),
    action: (
      <Popover label={authority ? "Change" : "Choose"} title="Who's paged" strong={!authority}>
        {(close) => <AuthorityEditor draft={draft} set={set} close={close} suggestion={suggestion} />}
      </Popover>
    ),
  });
  todos.push({
    key: "tools",
    label: connected ? `${connected} ${connected === 1 ? "tool" : "tools"} connected` : "Connect tools to also watch for your founder's and closers' names",
    done: connected > 0,
    optional: true,
    action: (
      <Popover label={connected ? "Change" : "Connect"} title="Your tools" strong={!connected}>
        {() => toolRow}
      </Popover>
    ),
  });

  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (look?.google) {
    if (look.google.rating != null)
      stats.push({
        value: `${look.google.rating}★`,
        label: `Google${look.google.reviews != null ? `, ${look.google.reviews} reviews` : ""}`,
      });
    stats.push({
      value: String(look.google.unansweredNegative),
      label: "bad reviews, no reply",
      warn: look.google.unansweredNegative > 0,
    });
  }
  if (look?.trustpilot?.rating != null) stats.push({ value: `${look.trustpilot.rating}★`, label: "Trustpilot" });
  if (look?.reddit)
    stats.push({
      value: String(look.reddit.mentions),
      label: `Reddit this month${look.reddit.negative ? `, ${look.reddit.negative} negative` : ""}`,
      warn: look.reddit.negative > 0,
    });
  if (look?.x)
    stats.push({
      value: String(look.x.mentions),
      label: `X this month${look.x.negative ? `, ${look.x.negative} negative` : ""}`,
      warn: look.x.negative > 0,
    });
  if (look?.news)
    stats.push({
      value: String(look.news.articles),
      label: `news this month${look.news.negative ? `, ${look.news.negative} negative` : ""}`,
      warn: look.news.negative > 0,
    });

  if (focus) {
    const f = REP_FOCUS[focus] ?? { rows: [], todos: [], save: false };
    const rows = pick(feed, f.rows);
    const steps = pick(todos, f.todos);
    const about = focus === "rep-google-reviews-watch" && !listing ? "No Google listing matched your website, so there's nothing to watch here yet." : f.about;
    return (
      <div className="space-y-6">
        <SettingsHeader mark={<RepMark size={36} />} name={REP_SKILL_MANIFEST[focus as RepSkillId]?.name ?? "Settings"} buyer={data.buyer} fullSetupHref={`/dashboard/engagements/${data.engagementId}/bridges/rep-onboarding`} />
        {about && <p className="px-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">{about}</p>}
        {rows.length > 0 && <Feed entries={rows} title={focus === "rep-onboarding" || focus === "rep-news-watch" || focus === "rep-search-watch" ? "What we watch" : "Settings"} />}
        {steps.length > 0 && <Todos items={steps} />}
      </div>
    );
  }

  return (
    <div className="space-y-9">
      <ReviewCard
        mark={<RepMark />}
        eyebrow="Reputation Manager"
        title={`${name || data.buyer}, right now`}
        pills={
          <>
            {data.website.domain && <Pill>{data.website.domain}</Pill>}
            <Pill tone={connected ? "on" : undefined}>{connected ? `${connected} ${connected === 1 ? "tool" : "tools"} connected` : "No tools yet"}</Pill>
            <Pill>Never posts for you</Pill>
          </>
        }
      >
        {stats.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-4">
            {stats.slice(0, 4).map((x) => (
              <div key={x.label} className="min-w-0">
                <p className={x.warn ? "text-2xl font-semibold tabular-nums tracking-tight text-[var(--error)]" : "text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]"}>
                  {x.value}
                </p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{x.label}</p>
              </div>
            ))}
          </div>
        )}
        {look && look.skipped.length > 0 && <p className="mt-3 text-[12px] text-[var(--text-muted)]">Not checked this time: {look.skipped.join(", ")}.</p>}
      </ReviewCard>
      <Feed entries={feed} onReread={onReread} />
      <Todos items={todos} />
    </div>
  );
}

function EngineAnswers({ look }: { look: FirstLook }) {
  return (
    <ul className="grid gap-3 @xl:grid-cols-2">
      {look.engines.map((e) => (
        <li key={e.engine} className="flex gap-2.5">
          <span
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              e.sentiment === "negative" || e.flagged ? "bg-[var(--error)]" : e.sentiment === "positive" ? "bg-emerald-500" : "bg-[var(--text-muted)]",
            )}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">{e.engine}</p>
            <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{e.excerpt}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function WorthALook({ look }: { look: FirstLook }) {
  const risky = look.search?.results.filter((r) => r.risky) ?? [];
  return (
    <ul className="space-y-2">
      {look.google?.recentNegative.map((r, i) => (
        <li key={`g${i}`} className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Google, {r.rating}★:</span> {r.text}
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </li>
      ))}
      {risky.slice(0, 3).map((r) => (
        <li key={r.url} className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            #{r.position} on Google for {look.search!.query}:
          </span>{" "}
          <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]">
            {r.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ── Editors ────────────────────────────────────────────────────────────

function Done({ close }: { close: () => void }) {
  return (
    <div className="flex justify-end pt-1">
      <button type="button" onClick={close} className="h-8 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] cursor-pointer">
        Done
      </button>
    </div>
  );
}

function NameEditor({ draft, set, close }: { draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void }) {
  return (
    <div className="space-y-3">
      <Labeled label="The name you do business under">
        <input
          aria-label="Your name"
          autoFocus
          value={draft.operatorName}
          onChange={(e) => set((d) => ({ ...d, operatorName: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && close()}
          className={`${inputCls} h-9`}
        />
      </Labeled>
      <Done close={close} />
    </div>
  );
}

function AuthorityEditor({ draft, set, close, suggestion }: { draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void; suggestion: { name: string; role?: string | null } | null }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--text-secondary)]">The one person who decides what to do when serious findings add up. Nothing is ever posted on your behalf.</p>
      <Labeled label="Their name">
        <input
          aria-label="Who's paged"
          autoFocus
          value={draft.soleAuthority}
          onChange={(e) => set((d) => ({ ...d, soleAuthority: e.target.value }))}
          placeholder="Their name"
          className={`${inputCls} h-9`}
        />
      </Labeled>
      {!draft.soleAuthority.trim() && suggestion && (
        <button
          type="button"
          onClick={() => set((d) => ({ ...d, soleAuthority: suggestion.name }))}
          className="rounded-full border border-dashed px-3 py-1 text-[13px] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          Use {suggestion.name}
          {suggestion.role ? `, ${suggestion.role}` : ""}
        </button>
      )}
      <Labeled label="Text them too (optional)">
        <input aria-label="Phone" value={draft.phone} onChange={(e) => set((d) => ({ ...d, phone: e.target.value }))} placeholder="Phone number" inputMode="tel" className={`${inputCls} h-9`} />
      </Labeled>
      <Done close={close} />
    </div>
  );
}

function ThresholdEditor({ draft, set, close }: { draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void }) {
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
          onChange={(e) =>
            set((d) => ({
              ...d,
              threshold: Number(e.target.value) === 80 ? null : Number(e.target.value),
            }))
          }
          className="w-full accent-[var(--ink)]"
        />
      </Labeled>
      <p className="text-[12px] text-[var(--text-muted)]">Lower pages you sooner.</p>
      <Done close={close} />
    </div>
  );
}