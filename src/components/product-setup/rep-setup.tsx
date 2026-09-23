"use client";

// src/components/product-setup/rep-setup.tsx
//
// Reputation Manager's setup, one page, the same shape as Showtime's:
//   welcome   pick what to watch, the website (remembered), and optional
//             tools that add names (already-connected ones show as such;
//             one connection per client serves every product)
//   working   "Set it up" streams its real steps
//   review    where the reputation stands right now, then every name the
//             watches will search for, each with where it came from and a
//             switch, then who's paged in a crisis. Preview and save.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, Loader2, Plus, Star, X } from "lucide-react";
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
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
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
  const authorityRef = useRef<HTMLDivElement>(null);
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
      skills: skills.filter((id) => id !== "rep-google-reviews-watch" || draft.googleListing),
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      toast.success(data.configured ? "Saved." : `Watching ${name} now.`);
      await load().catch(() => undefined);
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
    <div className="@container mx-auto w-full max-w-3xl px-1 pb-4">
      {phase === "review" ? (
        <>
          <Review data={data} draft={draft} set={set} skills={skills} setSkills={setSkills} authorityRef={authorityRef} onReread={() => setPhase("welcome")} toolRow={toolRow} />
          <div className="sticky bottom-0 z-20 mt-8 border-t bg-background/95 px-4 py-3 backdrop-blur-md shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-4">
              <div className="min-w-0 flex-1 text-sm">
                {saveError ? (
                  <p className="flex items-center gap-2 text-[var(--error)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError}
                  </p>
                ) : missing.length ? (
                  <button type="button" onClick={() => authorityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} className="text-left text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                    Add {missing.join(" and ")} to start watching.
                  </button>
                ) : (
                  <p className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                    {skills.length} {skills.length === 1 ? "skill" : "skills"} ready. Nothing ever posts on your behalf.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" className="hidden @md:inline-flex" onClick={onCancel} disabled={saving}>
                  {cancelLabel}
                </Button>
                <Button size="lg" className="h-10 px-5" onClick={save} disabled={saving || missing.length > 0}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  {data.configured ? "Save changes" : "Start watching"}
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

      <section className={cn("transition-opacity", working && "pointer-events-none opacity-60")}>
        <h2 className="text-sm font-medium text-[var(--text-primary)]">What should we watch?</h2>
        <ul className="mt-1 divide-y">
          {REP_SETUP_SKILLS.map((id) => (
            <SkillSwitchRow key={id} skillId={id} blurb={SKILL_BLURB[id] ?? REP_SKILL_MANIFEST[id].description} on={skills.includes(id)} onChange={(v) => onToggleSkill(id, v)} />
          ))}
        </ul>
      </section>

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

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="progress" id="rep-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ActivationProgress stages={STAGES} steps={steps} working={!activateError} host={host} error={activateError} onRetry={onActivate} />
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate} disabled={skills.length === 0}>
                Set it up <ArrowRight />
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

function Review({
  data,
  draft,
  set,
  skills,
  setSkills,
  authorityRef,
  onReread,
  toolRow,
}: {
  data: RepSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  setSkills: (fn: (s: string[]) => string[]) => void;
  authorityRef: React.RefObject<HTMLDivElement | null>;
  onReread: () => void;
  toolRow: ReactNode;
}) {
  type ListKey = "aliases" | "domains" | "emails" | "offerings" | "competitors" | "press" | "prompts";
  const toggle = (key: ListKey, i: number) => set((d) => ({ ...d, [key]: d[key].map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }));
  const add = (key: ListKey, value: string) =>
    set((d) => (d[key].some((x) => x.value.toLowerCase() === value.toLowerCase()) ? d : { ...d, [key]: [...d[key], { value, on: true, sources: ["you"], tier: "done" as const }] }));
  const suggestion = data.proposal.soleAuthority.suggestion;

  return (
    <div className="space-y-11">
      <header className="flex items-start gap-4">
        <RepMark />
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)]">{draft.operatorName || data.buyer}, right now</h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            {data.website.domain ?? "No website yet"} ·{" "}
            <button type="button" onClick={onReread} className="font-medium underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
              Change website or tools
            </button>
          </p>
        </div>
      </header>

      {data.firstLook && <FirstLookPanel look={data.firstLook} />}

      <Section title="How you're known" hint="Every name here is searched daily. Tap to switch one off.">
        <div className="space-y-4">
          <Field label="Name">
            <input
              value={draft.operatorName}
              onChange={(e) => set((d) => ({ ...d, operatorName: e.target.value }))}
              className="h-10 w-full max-w-md border-b border-[var(--text-muted)]/40 bg-transparent text-[17px] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
            />
          </Field>
          <ChipField label="Also known as" items={draft.aliases} onToggle={(i) => toggle("aliases", i)} onAdd={(v) => add("aliases", v)} placeholder="Add a name" />
          <ChipField label="Websites" items={draft.domains} onToggle={(i) => toggle("domains", i)} onAdd={(v) => add("domains", bareHost(v))} placeholder="Add a domain" />
          <ChipField
            label="Handles"
            items={draft.handles.map((h) => ({ ...h, value: `${h.platform}: ${h.value}` }))}
            onToggle={(i) => set((d) => ({ ...d, handles: d.handles.map((h, j) => (j === i ? { ...h, on: !h.on } : h)) }))}
          />
          <ChipField label="Contact emails" items={draft.emails} onToggle={(i) => toggle("emails", i)} onAdd={(v) => add("emails", v.toLowerCase())} placeholder="Add an email" />
          {data.proposal.googleListing && (
            <Field label="Google listing">
              <button
                type="button"
                onClick={() => set((d) => ({ ...d, googleListing: d.googleListing ? null : data.proposal.googleListing!.listing }))}
                className={cn("flex w-full max-w-md items-center gap-3 border px-3 py-2.5 text-left transition-colors cursor-pointer", draft.googleListing ? "border-[var(--text-primary)]" : "border-dashed opacity-60")}
              >
                <PlatformLogo provider="google" size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{data.proposal.googleListing.listing.name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{data.proposal.googleListing.listing.address ?? data.proposal.googleListing.listing.site}</span>
                </span>
                <span className="text-xs text-[var(--text-secondary)]">{draft.googleListing ? "This is us" : "Not us"}</span>
              </button>
            </Field>
          )}
        </div>
      </Section>

      <Section title="What we watch for" hint="Starred brands are searched on Reddit and X every day.">
        <div className="space-y-4">
          <Field label="Brands">
            <div className="flex flex-wrap gap-1.5">
              {draft.entities.map((e, i) => (
                <span key={e.value} className={cn("inline-flex items-center overflow-hidden rounded-full border text-[13px]", e.on ? "text-[var(--text-primary)]" : "border-dashed text-[var(--text-muted)]")} title={`From ${e.sources.join(", ")}`}>
                  <button type="button" aria-label={e.highPriority ? "Unstar" : "Star"} onClick={() => set((d) => ({ ...d, entities: d.entities.map((x, j) => (j === i ? { ...x, highPriority: !x.highPriority, on: true } : x)) }))} className="pl-2.5 cursor-pointer">
                    <Star className={cn("h-3.5 w-3.5", e.highPriority ? "fill-current" : "opacity-40")} />
                  </button>
                  <button type="button" onClick={() => set((d) => ({ ...d, entities: d.entities.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))} className={cn("px-2 py-1 cursor-pointer", !e.on && "line-through")}>
                    {e.value}
                  </button>
                </span>
              ))}
            </div>
          </Field>
          <ChipField label="Products" items={draft.offerings} onToggle={(i) => toggle("offerings", i)} onAdd={(v) => add("offerings", v)} placeholder="Add a product" />
          <ChipField label="Competitors" items={draft.competitors} onToggle={(i) => toggle("competitors", i)} onAdd={(v) => add("competitors", v)} placeholder="Add a competitor" />
          <ChipField label="Press that's covered you" items={draft.press} onToggle={(i) => toggle("press", i)} onAdd={(v) => add("press", v)} placeholder="Add a publication" />
        </div>
      </Section>

      {draft.collisions.length > 0 && (
        <Section title="Not you" hint="Others with a similar name. We keep them apart from you.">
          <ul className="divide-y">
            {draft.collisions.map((c, i) => (
              <li key={c.name} className="flex items-start gap-3 py-3">
                <div className={cn("min-w-0 flex-1", !c.on && "opacity-50")}>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{c.whoTheyAre}</p>
                </div>
                <button type="button" onClick={() => set((d) => ({ ...d, collisions: d.collisions.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))} className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
                  {c.on ? "Remove" : "Keep apart"}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {skills.includes("rep-engine-panel") && (
        <Section title="What we ask the AI engines" hint="Asked on a schedule. The answers are watched for trouble.">
          <div className="space-y-4">
            <ul className="space-y-1.5">
              {draft.prompts.map((p, i) => (
                <li key={p.value}>
                  <button type="button" onClick={() => toggle("prompts", i)} className={cn("flex w-full items-start gap-2.5 text-left text-[15px] cursor-pointer", p.on ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] line-through")}>
                    <span className={cn("mt-1.5 h-3.5 w-3.5 shrink-0 rounded-sm border", p.on ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--text-muted)]")}>{p.on && <Check className="h-3 w-3 text-[var(--ink-foreground)]" strokeWidth={3} />}</span>
                    {p.value}
                  </button>
                </li>
              ))}
            </ul>
            <AddInline placeholder="Add a question people ask about you" onAdd={(v) => add("prompts", v)} />
            <div className="flex flex-wrap gap-1.5">
              {data.engines.available.map((e) => {
                const active = draft.engines.includes(e);
                return (
                  <button key={e} type="button" onClick={() => set((d) => ({ ...d, engines: active ? d.engines.filter((x) => x !== e) : [...d.engines, e] }))} className={cn("rounded-full border px-3 py-1 text-[13px] cursor-pointer", active ? "border-[var(--text-primary)] text-[var(--text-primary)]" : "border-dashed text-[var(--text-muted)]")}>
                    {REP_ENGINE_LABELS[e as RepEngineId] ?? e}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <div ref={authorityRef}>
        <Section title="When something's serious" hint="We page this person. Nothing is ever posted on your behalf.">
          <div className="space-y-4">
            <Field label="Who decides">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={draft.soleAuthority}
                  onChange={(e) => set((d) => ({ ...d, soleAuthority: e.target.value }))}
                  placeholder="Their name"
                  className="h-10 w-64 border-b border-[var(--text-muted)]/40 bg-transparent text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
                />
                {!draft.soleAuthority && suggestion && (
                  <button type="button" onClick={() => set((d) => ({ ...d, soleAuthority: suggestion.name }))} className="rounded-full border border-dashed px-3 py-1 text-[13px] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] cursor-pointer">
                    Use {suggestion.name}{suggestion.role ? `, ${suggestion.role}` : ""}
                  </button>
                )}
              </div>
            </Field>
            <Field label="Text them too">
              <input
                value={draft.phone}
                onChange={(e) => set((d) => ({ ...d, phone: e.target.value }))}
                placeholder="Optional phone number"
                inputMode="tel"
                className="h-10 w-64 border-b border-[var(--text-muted)]/40 bg-transparent text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
              />
            </Field>
            <Field label="Page at">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={draft.threshold ?? 80}
                  onChange={(e) => set((d) => ({ ...d, threshold: Number(e.target.value) === 80 ? null : Number(e.target.value) }))}
                  className="w-48 accent-[var(--ink)]"
                />
                <span className="text-[13px] text-[var(--text-secondary)]">
                  severity {draft.threshold ?? 80}
                  {draft.threshold == null ? " (default)" : ""}. Lower pages you sooner.
                </span>
              </div>
            </Field>
          </div>
        </Section>
      </div>

      <Section title="Skills" hint="Switch any of them off.">
        <ul className="divide-y">
          {REP_SETUP_SKILLS.map((id) => {
            const noListing = id === "rep-google-reviews-watch" && !draft.googleListing;
            return (
              <SkillSwitchRow
                key={id}
                skillId={id}
                blurb={noListing ? "No Google listing matched your website, so there's nothing to watch here yet." : (SKILL_BLURB[id] ?? "")}
                on={skills.includes(id) && !noListing}
                onChange={(v) => !noListing && setSkills((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)))}
              />
            );
          })}
        </ul>
      </Section>

      <Section title="Your tools" hint="Optional. Each one adds names to watch for.">
        {toolRow}
      </Section>
    </div>
  );
}

function FirstLookPanel({ look }: { look: FirstLook }) {
  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (look.google) {
    if (look.google.rating != null) stats.push({ value: `${look.google.rating}★`, label: `Google${look.google.reviews != null ? `, ${look.google.reviews} reviews` : ""}` });
    stats.push({ value: String(look.google.unansweredNegative), label: "bad Google reviews with no reply", warn: look.google.unansweredNegative > 0 });
  }
  if (look.trustpilot?.rating != null) stats.push({ value: `${look.trustpilot.rating}★`, label: `Trustpilot${look.trustpilot.reviews != null ? `, ${look.trustpilot.reviews} reviews` : ""}` });
  if (look.reddit) stats.push({ value: String(look.reddit.mentions), label: `Reddit mentions this month${look.reddit.negative ? `, ${look.reddit.negative} negative` : ""}`, warn: look.reddit.negative > 0 });
  if (look.x) stats.push({ value: String(look.x.mentions), label: `X mentions this month${look.x.negative ? `, ${look.x.negative} negative` : ""}`, warn: look.x.negative > 0 });
  if (look.news) stats.push({ value: String(look.news.articles), label: `news articles this month${look.news.negative ? `, ${look.news.negative} negative` : ""}`, warn: look.news.negative > 0 });
  const risky = look.search?.results.filter((r) => r.risky) ?? [];

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
      {look.engines.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">What the AI engines say</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {look.engines.map((e) => (
              <li key={e.engine} className="flex gap-2.5">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.sentiment === "negative" || e.flagged ? "bg-[var(--error)]" : e.sentiment === "positive" ? "bg-emerald-500" : "bg-[var(--text-muted)]")} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{e.engine}</p>
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">{e.excerpt}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(risky.length > 0 || (look.google?.recentNegative.length ?? 0) > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Worth a look</p>
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
                <span className="font-medium text-[var(--text-primary)]">#{r.position} on Google for {look.search!.query}:</span>{" "}
                <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-primary)]">
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {look.skipped.length > 0 && <p className="text-xs text-[var(--text-muted)]">Not checked this time: {look.skipped.join(", ")}.</p>}
    </section>
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
    <div className="grid gap-1.5 @xl:grid-cols-[150px_1fr] @xl:items-baseline @xl:gap-4">
      <p className="text-[13px] text-[var(--text-muted)]">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ChipField({
  label,
  items,
  onToggle,
  onAdd,
  placeholder,
}: {
  label: string;
  items: { value: string; on: boolean; sources: string[]; tier: TrustTier }[];
  onToggle: (i: number) => void;
  onAdd?: (value: string) => void;
  placeholder?: string;
}) {
  if (items.length === 0 && !onAdd) return null;
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <button
            key={`${it.value}-${i}`}
            type="button"
            onClick={() => onToggle(i)}
            title={`From ${it.sources.join(", ")}${it.on ? ". Tap to stop watching for it." : ". Tap to watch for it."}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] transition-colors cursor-pointer",
              it.on
                ? it.tier === "likely"
                  ? "border-transparent bg-[var(--surface-prefill)] text-[var(--text-primary)]"
                  : "text-[var(--text-primary)]"
                : "border-dashed text-[var(--text-muted)] line-through"
            )}
          >
            <span className="truncate">{it.value}</span>
            {it.on && <X className="h-3 w-3 shrink-0 opacity-40" />}
          </button>
        ))}
        {onAdd && <AddInline placeholder={placeholder ?? "Add"} onAdd={onAdd} compact />}
      </div>
    </Field>
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
      <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer", compact && "rounded-full border border-dashed px-2.5 py-1")}>
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
      className="h-8 w-56 border-b border-[var(--text-primary)] bg-transparent text-[13px] text-[var(--text-primary)] outline-none"
    />
  );
}
