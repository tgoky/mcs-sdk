"use client";

// src/components/product-setup/showtime-setup.tsx
//
// Showtime's setup, for every Showtime skill at once (the confirmation page,
// the pre-call sequence and brief, no-show recovery, the funnel audit). Two
// things drive it: the client's website and the tools they already use.
//
//   welcome  - the website (already filled in when we know it) and the tools
//              as round logos. One button: Activate.
//   working  - Activate streams back each real step as it finishes: reading
//              (or reusing) the site, what it found, checking accounts, and
//              Jev picking the lists and sites from the connected accounts.
//   review   - what we set up, as sentences. Anything can be clicked and
//              changed; how each value looks says how sure we are
//              (fact-trust.ts). One button saves it all.
//
// Saving goes through the same POST bridges/pin-down the old dossier used,
// so validation, decision recording and the Pin-Down run are unchanged.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { useTour } from "@/components/tours/tour-provider";
import { anySkillDisplayName } from "@/lib/any-skill";
import { VERTICALS, verticalLabel } from "@/lib/verticals";
import { CRM_NOTE_PLATFORMS, SHOWTIME_TOOL_GROUPS, findShowtimeTool, type ToolGroupId } from "@/lib/showtime-setup/catalog";
import { PICK_PURPOSE, showtimePickTargets } from "@/lib/showtime-setup/picks";
import type { ActivationStep, PickSlot, SetupValue, ShowtimeSetupState, TrustTier } from "@/lib/showtime-setup/types";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ChoiceList, FactToken, TextEditor } from "./fact-token";
import { ActivationSteps } from "./activation-steps";
import { ConfirmationPreview } from "./confirmation-preview";
import { cn } from "@/lib/utils";

// ── Draft ──────────────────────────────────────────────────────────────

type OfferKey = "offerName" | "offerPrice" | "offerVertical" | "offerIcp" | "trafficTemperature" | "castingChoice" | "heroVideoUrl";
type ChoiceKey = "smsPlatform" | "adDataPlatform" | "briefLandingDestination";
type Pick = { id: string; name: string };

interface Draft {
  domain: string;
  offer: Record<OfferKey, string>;
  platforms: Record<ToolGroupId, string | null>;
  choices: Record<ChoiceKey, string | null>;
  slackWebhookUrl: string;
  picks: Partial<Record<PickSlot, Pick | null>>;
}

const OFFER_KEYS: OfferKey[] = ["offerName", "offerPrice", "offerVertical", "offerIcp", "trafficTemperature", "castingChoice", "heroVideoUrl"];
const CHOICE_KEYS: ChoiceKey[] = ["smsPlatform", "adDataPlatform", "briefLandingDestination"];
const GROUPS: ToolGroupId[] = ["booking", "email", "hosting"];

/** A value is only put in front of someone as an answer when it isn't a question. */
const usable = (v: SetupValue | undefined) => (v && v.tier !== "ask" && v.value ? v.value : null);

function draftFrom(data: ShowtimeSetupState, prev: Draft | null, touched: Set<string>): Draft {
  const keep = (key: string) => prev !== null && touched.has(key);
  const offer = {} as Record<OfferKey, string>;
  for (const k of OFFER_KEYS) offer[k] = keep(`offer.${k}`) ? prev!.offer[k] : usable(data.offer[k]) ?? "";
  const platforms = {} as Record<ToolGroupId, string | null>;
  for (const g of GROUPS) platforms[g] = keep(`platform.${g}`) ? prev!.platforms[g] : usable(data.platforms[g]);
  const choices = {} as Record<ChoiceKey, string | null>;
  for (const k of CHOICE_KEYS) choices[k] = keep(`choice.${k}`) ? prev!.choices[k] : usable(data.choices[k]);
  const picks: Draft["picks"] = {};
  for (const [slot, p] of Object.entries(data.picks) as [PickSlot, NonNullable<ShowtimeSetupState["picks"][PickSlot]>][]) {
    picks[slot] = keep(`pick.${slot}`) ? prev!.picks[slot] ?? null : p.tier !== "ask" ? p.value : null;
  }
  return {
    domain: prev?.domain || data.website.domain || "",
    offer,
    platforms,
    choices,
    slackWebhookUrl: keep("slack") ? prev!.slackWebhookUrl : data.choices.slackWebhookUrl,
    picks,
  };
}

// ── Words ──────────────────────────────────────────────────────────────

const TEMPERATURES = [
  { value: "cold", label: "cold", hint: "They don't know the business yet. The page does more explaining." },
  { value: "warm", label: "warm", hint: "They've heard of the business: a list, a referral, a retargeted visitor." },
  { value: "hot", label: "hot", hint: "They're ready to buy and mostly comparing options." },
] as const;

const CASTING = [
  { value: "founder_on_camera", label: "the founder", hint: "The owner is the face of the business." },
  { value: "coach_on_camera", label: "a coach or expert", hint: "A named coach or practitioner leads the calls and videos." },
  { value: "animation", label: "the product itself", hint: "Product visuals or brand motion, no one person on camera." },
  { value: "other", label: "the team", hint: "A team or brand voice rather than one person." },
] as const;

const SMS_LABEL: Record<string, string> = { twilio: "sent through Twilio", ghl_sms: "sent through GoHighLevel", hubspot_sms: "sent through HubSpot", none: "off" };
const AD_LABEL: Record<string, string> = { hyros: "Hyros", native_crm: "your CRM", google_sheets: "Google Sheets", none: "nowhere yet" };

function toolLabel(provider: string | null | undefined): string {
  if (!provider) return "";
  return findShowtimeTool(provider)?.label ?? provider;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sourceText(v: SetupValue | undefined, domain: string): string | null {
  if (!v || !v.source) return null;
  const site = domain || "your website";
  switch (v.source) {
    case "saved":
      return "Saved earlier for this client.";
    case "user":
      return "You set this.";
    case "website":
      return `Found on ${site}.`;
    case "llm":
      return `Read from ${site}.`;
    case "jev":
      return `Worked out from ${site}${v.confidence != null ? `, ${v.confidence}% sure` : ""}.`;
    case "account":
      return `From your ${toolLabel(v.sourceDetail) || "connected"} account.`;
    case "rule":
      return v.evidence;
    case "default":
      return v.evidence ?? "Our default. Change it anytime.";
    default:
      return null;
  }
}

function bareHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

// ── Component ──────────────────────────────────────────────────────────

export function ShowtimeSetup({
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
  const { start: startTour } = useTour();

  const [data, setData] = useState<ShowtimeSetupState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"welcome" | "working" | "review">("welcome");
  const [draft, setDraft] = useState<Draft | null>(null);
  const touched = useRef(new Set<string>());
  const [steps, setSteps] = useState<ActivationStep[]>([]);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [flashGroup, setFlashGroup] = useState<ToolGroupId | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const storageKey = `showtime-setup:${engagementId}:domain`;

  const load = useCallback(
    async (opts: { initial?: boolean } = {}) => {
      const res = await fetch(`/api/engagements/${engagementId}/setup/showtime`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load Showtime's setup.");
      const next = body as ShowtimeSetupState;
      setData(next);
      setDraft((prev) => {
        const d = draftFrom(next, prev, touched.current);
        if (opts.initial) {
          // A domain typed before leaving to sign in to a tool comes back.
          try {
            const kept = sessionStorage.getItem(storageKey);
            if (kept) {
              d.domain = kept;
              sessionStorage.removeItem(storageKey);
            }
          } catch {
            // Private mode: nothing kept, nothing lost.
          }
        }
        return d;
      });
      if (opts.initial) setPhase(next.configured ? "review" : "welcome");
      return next;
    },
    [engagementId, storageKey]
  );

  useEffect(() => {
    void (async () => {
      try {
        await load({ initial: true });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load Showtime's setup.");
      }
    })();
    // Back from a Composio sign-in: say so, and clean the address bar.
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("composio_connected");
    const failed = url.searchParams.get("composio_error");
    if (connected) toast.success(`${toolLabel(connected)} connected.`);
    if (failed) toast.error(failed);
    if (connected || failed) {
      url.searchParams.delete("composio_connected");
      url.searchParams.delete("composio_error");
      window.history.replaceState(null, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const touch = (key: string) => touched.current.add(key);
  const update = (fn: (d: Draft) => Draft, key: string) => {
    touch(key);
    setDraft((d) => (d ? fn(d) : d));
  };
  const setOffer = (k: OfferKey, v: string) => update((d) => ({ ...d, offer: { ...d.offer, [k]: v } }), `offer.${k}`);
  const setChoice = (k: ChoiceKey, v: string | null) => update((d) => ({ ...d, choices: { ...d.choices, [k]: v } }), `choice.${k}`);
  const setPlatform = (g: ToolGroupId, v: string | null) => update((d) => ({ ...d, platforms: { ...d.platforms, [g]: v } }), `platform.${g}`);
  const setPick = (s: PickSlot, v: Pick | null) => update((d) => ({ ...d, picks: { ...d.picks, [s]: v } }), `pick.${s}`);
  const tierOf = (key: string, v: SetupValue | undefined): TrustTier => (touched.current.has(key) ? "done" : v?.tier ?? "ask");

  // ── Tools ──
  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return res.ok ? null : ((json.error as string) ?? "Something went wrong. Try again.");
  };
  const toolActions: ToolActions = {
    useSaved: async (tool, vaultId) => {
      const err = await post(`/api/engagements/${engagementId}/setup/showtime/connect`, { provider: tool.provider, vaultId });
      if (err) return err;
      setPlatform(tool.group, tool.provider);
      await load().catch(() => undefined);
      return null;
    },
    connectKey: async (tool, value, extra) => {
      const err = await post(`/api/engagements/${engagementId}/setup/showtime/connect`, { provider: tool.provider, value, ...extra });
      if (err) return err;
      setPlatform(tool.group, tool.provider);
      toast.success(`${tool.label} connected.`);
      await load().catch(() => undefined);
      return null;
    },
    signIn: async (tool) => {
      try {
        if (draft?.domain) sessionStorage.setItem(storageKey, draft.domain);
      } catch {
        // Nothing to keep across the redirect; the domain is re-read on return.
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
      const err = await post(`/api/engagements/${engagementId}/setup/showtime/connect`, { provider: tool.provider, disconnect: true });
      if (err) return err;
      if (draft?.platforms[tool.group] === tool.provider) setPlatform(tool.group, null);
      await load().catch(() => undefined);
      return null;
    },
    choose: (tool) => setPlatform(tool.group, tool.provider),
  };

  // ── Activate ──
  async function activate() {
    if (!draft) return;
    setPhase("working");
    setSteps([]);
    setActivateError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/showtime/activate`, {
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
      await load();
      // A beat on the finished list before the review replaces it.
      await new Promise((r) => setTimeout(r, 700));
      setPhase("review");
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  // ── Save ──
  const blockers = useMemo(() => (data && draft ? findBlockers(data, draft) : []), [data, draft]);
  const canSaveAtAll = Boolean(draft?.offer.trafficTemperature && (draft.domain || data?.website.domain));

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setSaveError(null);
    // Only ids picked from the tools chosen right now: a list picked from
    // Klaviyo means nothing once email moves to HubSpot.
    const current = new Map(
      showtimePickTargets({ emailPlatform: draft.platforms.email, hostingPlatform: draft.platforms.hosting, activecampaignBaseUrl: "known" }).map((t) => [t.slot, t.resource])
    );
    const autoPicks = Object.fromEntries(
      Object.entries(draft.picks).filter(([slot, v]) => v && current.get(slot as PickSlot) === data.picks[slot as PickSlot]?.resource)
    ) as Record<string, Pick>;
    const body: Record<string, unknown> = {
      buyerDomain: draft.domain || data.website.domain,
      offerName: draft.offer.offerName,
      offerPrice: draft.offer.offerPrice,
      offerVertical: draft.offer.offerVertical,
      offerIcp: draft.offer.offerIcp,
      trafficTemperature: draft.offer.trafficTemperature,
      castingChoice: draft.offer.castingChoice,
      bookingPlatform: draft.platforms.booking ?? "",
      emailPlatform: draft.platforms.email ?? "",
      hostingPlatform: draft.platforms.hosting ?? "",
      smsPlatform: draft.choices.smsPlatform ?? "",
      adDataPlatform: draft.choices.adDataPlatform ?? "",
      briefLandingDestination: draft.choices.briefLandingDestination ?? "",
      autoPicks,
    };
    // Only sent when there's something to set: an empty string would clear
    // a saved value on the server.
    if (draft.offer.heroVideoUrl.trim()) body.heroVideoUrl = draft.offer.heroVideoUrl.trim();
    if (draft.choices.briefLandingDestination === "slack" && draft.slackWebhookUrl.trim()) body.slackWebhookUrl = draft.slackWebhookUrl.trim();

    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/pin-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      toast.success(blockers.length === 0 ? `Showtime is on for ${data.buyer}.` : `Saved. ${blockers.length} thing${blockers.length === 1 ? "" : "s"} left before everything runs.`);
      touched.current.clear();
      router.refresh();
      startTour("showtime");
      if (onSaved) onSaved({ runId: json.runId });
      else await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──
  if (loadError) {
    return (
      <div className="flex items-start gap-3 rounded-xl border p-5 text-sm text-[var(--error)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {loadError}
      </div>
    );
  }
  if (!data || !draft) return <SetupSkeleton />;

  const domain = bareHost(draft.domain || data.website.domain);
  const toolState = (provider: string, group: ToolGroupId) => data.tools.find((t) => t.provider === provider && t.group === group);

  const toolRows = (compact: boolean) => (
    <div ref={toolsRef} className={cn("space-y-5", compact && "space-y-4")}>
      {SHOWTIME_TOOL_GROUPS.map((group) => (
        <motion.div
          key={group.id}
          animate={flashGroup === group.id ? { backgroundColor: ["rgba(0,0,0,0)", "var(--surface-prefill)", "rgba(0,0,0,0)"] } : {}}
          transition={{ duration: 1.4 }}
          className="-mx-3 grid grid-cols-1 gap-3 rounded-xl px-3 py-1 @xl:grid-cols-[140px_1fr] @xl:items-center"
        >
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{group.label}</p>
            <p className="text-xs text-[var(--text-muted)]">{group.hint}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {group.tools.map((tool) => (
              <ToolAvatar
                key={`${group.id}-${tool.provider}`}
                tool={tool}
                state={toolState(tool.provider, group.id)}
                selected={draft.platforms[group.id] === tool.provider}
                buyer={data.buyer}
                actions={toolActions}
                size={compact ? 42 : 48}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="@container w-full font-sans text-[var(--text-secondary)] antialiased">
      <AnimatePresence mode="wait" initial={false}>
        {phase !== "review" ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-2xl py-4 @3xl:py-10"
          >
            <Welcome
              data={data}
              draft={draft}
              setDomain={(v) => setDraft((d) => (d ? { ...d, domain: v } : d))}
              toolRows={toolRows(false)}
              phase={phase}
              steps={steps}
              activateError={activateError}
              onActivate={activate}
              onCancel={onCancel}
              cancelLabel={cancelLabel}
              onBackToReview={data.configured ? () => setPhase("review") : undefined}
            />
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <Review
              data={data}
              draft={draft}
              domain={domain}
              tierOf={tierOf}
              openKey={openKey}
              setOpenKey={setOpenKey}
              setOffer={setOffer}
              setChoice={setChoice}
              setPick={setPick}
              setSlack={(v) => update((d) => ({ ...d, slackWebhookUrl: v }), "slack")}
              toolRows={toolRows(true)}
              onReread={() => {
                setPhase("welcome");
              }}
              onFocusGroup={(g) => {
                toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                setFlashGroup(g);
                setTimeout(() => setFlashGroup(null), 1500);
              }}
              engagementId={engagementId}
            />
            <SaveBar
              blockers={blockers}
              configured={data.configured}
              saving={saving}
              canSave={canSaveAtAll}
              error={saveError}
              onSave={save}
              onCancel={onCancel}
              cancelLabel={cancelLabel}
              onBlocker={(b) => {
                if (b.group) {
                  toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setFlashGroup(b.group);
                  setTimeout(() => setFlashGroup(null), 1500);
                } else if (b.openKey) {
                  setOpenKey(b.openKey);
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Welcome ────────────────────────────────────────────────────────────

function Welcome({
  data,
  draft,
  setDomain,
  toolRows,
  phase,
  steps,
  activateError,
  onActivate,
  onCancel,
  cancelLabel,
  onBackToReview,
}: {
  data: ShowtimeSetupState;
  draft: Draft;
  setDomain: (v: string) => void;
  toolRows: React.ReactNode;
  phase: "welcome" | "working" | "review";
  steps: ActivationStep[];
  activateError: string | null;
  onActivate: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onBackToReview?: () => void;
}) {
  const working = phase === "working";
  const host = bareHost(draft.domain);
  const known = data.website.domain && bareHost(data.website.domain) === host;
  const readHere = known && data.website.readDomain && bareHost(data.website.readDomain) === host;
  const readAgo = relativeTime(data.website.readAt);
  const connectedCount = data.tools.filter((t) => t.linked).length;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--text-prefill-accent)]" /> Showtime
        </p>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[32px]">
          Set up Showtime for {data.buyer}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed">
          Give us your website and the tools you already use. We&apos;ll set up every Showtime skill from them: the confirmation page, the
          pre-call emails and brief, no-show recovery and the funnel audit. You just check our work.
        </p>
      </header>

      <section className={cn("space-y-2.5 transition-opacity", working && "pointer-events-none opacity-50")}>
        <label htmlFor="showtime-website" className="text-sm font-medium text-[var(--text-primary)]">
          Your website
        </label>
        <div className="flex h-14 items-center border border-[var(--text-muted)]/40 bg-background transition-colors focus-within:border-[var(--text-primary)] dark:border-white/15">
          <span className="select-none pl-4 text-lg text-[var(--text-muted)]">https://</span>
          <input
            id="showtime-website"
            value={draft.domain.replace(/^https?:\/\//i, "")}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && host && onActivate()}
            placeholder="yourwebsite.com"
            autoComplete="url"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent pr-4 pl-0.5 text-lg text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/60"
          />
        </div>
        <AnimatePresence initial={false}>
          {known && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5 text-[13px] text-[var(--text-prefill-accent)]"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              {readHere && readAgo
                ? `We already read this site ${readAgo}. Activating takes seconds.`
                : `Already on file for ${data.buyer}.`}
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      <section className={cn("space-y-5 transition-opacity", working && "pointer-events-none opacity-50")}>
        <div>
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Connect your tools</h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            {connectedCount > 0
              ? `${connectedCount} already connected. The more we can see, the less you'll ever type.`
              : "Tap a logo. Tools you've connected for other clients show up ready to reuse."}
          </p>
        </div>
        {toolRows}
      </section>

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="steps" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 border-t pt-6">
              <ActivationSteps
                steps={steps}
                working={!activateError}
                workingLabel={steps.length === 0 ? `Reading ${host || "your site"}…` : "Setting up the rest…"}
              />
              {activateError && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[var(--error)]">{activateError}</p>
                  <Button variant="outline" size="sm" onClick={onActivate}>
                    <RotateCcw /> Try again
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate} disabled={!host}>
                Activate Showtime <ArrowRight />
              </Button>
              <p className="text-[13px] text-[var(--text-muted)]">
                {readHere ? "Takes a few seconds." : "About a minute the first time we read a site."}
              </p>
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
  domain,
  tierOf,
  openKey,
  setOpenKey,
  setOffer,
  setChoice,
  setPick,
  setSlack,
  toolRows,
  onReread,
  onFocusGroup,
  engagementId,
}: {
  data: ShowtimeSetupState;
  draft: Draft;
  domain: string;
  tierOf: (key: string, v: SetupValue | undefined) => TrustTier;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  setOffer: (k: OfferKey, v: string) => void;
  setChoice: (k: ChoiceKey, v: string | null) => void;
  setPick: (s: PickSlot, v: Pick | null) => void;
  setSlack: (v: string) => void;
  toolRows: React.ReactNode;
  onReread: () => void;
  onFocusGroup: (g: ToolGroupId) => void;
  engagementId: string;
}) {
  const o = draft.offer;
  const tokenProps = (key: string) => ({ open: openKey === key, onOpenChange: (open: boolean) => setOpenKey(open ? key : null) });
  const offerToken = (k: OfferKey, placeholder: string, title: string, editor: (close: () => void) => React.ReactNode, display?: string | null, width?: number) => (
    <FactToken
      {...tokenProps(`offer.${k}`)}
      display={display !== undefined ? display : o[k] || null}
      placeholder={placeholder}
      tier={tierOf(`offer.${k}`, data.offer[k])}
      title={title}
      source={o[k] ? sourceText(touchedSource(tierOf(`offer.${k}`, data.offer[k]), data.offer[k]), domain) : weakGuess(data.offer[k])}
      width={width}
    >
      {editor(() => setOpenKey(null))}
    </FactToken>
  );
  const readAgo = relativeTime(data.website.readAt);
  const name = usable(data.offer.operatorName) ?? data.buyer;
  const email = draft.platforms.email;
  const booking = draft.platforms.booking;
  const hosting = draft.platforms.hosting;
  const pick = (slot: PickSlot) => data.picks[slot];

  return (
    <div className="grid gap-x-12 gap-y-10 pb-28 @4xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-10">
        <header className="space-y-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
            {data.configured ? `Showtime for ${data.buyer}` : `Here's Showtime for ${data.buyer}`}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-muted)]">
            <span>
              Set up from <span className="font-medium text-[var(--text-secondary)]">{domain || "your website"}</span>
              {readAgo ? ` · read ${readAgo}` : ""}
            </span>
            <span aria-hidden>·</span>
            <button type="button" onClick={onReread} className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer">
              <RotateCcw className="h-3 w-3" /> Change website or read again
            </button>
          </p>
          {data.website.siteCheck && !data.website.siteCheck.isRealSite && (
            <p className="flex items-start gap-2 pt-1 text-[13px] text-[var(--error)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {domain} reads like a link page or placeholder, not the main site. If there&apos;s a better address, read that one instead.
            </p>
          )}
        </header>

        {/* What we learned */}
        <section className="space-y-3">
          <SectionTitle>What we learned</SectionTitle>
          <p className="max-w-[62ch] text-[17px] leading-[2.1] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{name}</span> sells{" "}
            {offerToken("offerName", "what they sell", "What they sell", (close) => (
              <TextEditor initial={o.offerName} placeholder="e.g. 12-week growth program" onSave={(v) => (setOffer("offerName", v), close())} />
            ))}
            {" "}for{" "}
            {offerToken(
              "offerPrice",
              "a price",
              "Price",
              (close) => (
                <TextEditor
                  initial={o.offerPrice}
                  placeholder="e.g. $2,500"
                  onSave={(v) => (setOffer("offerPrice", v), close())}
                  footer={
                    data.whopPlanOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {data.whopPlanOptions.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => (setOffer("offerPrice", String(p.price ?? "")), close())}
                            className="rounded-full border px-2.5 py-1 text-xs hover:bg-[var(--accent-dim)] cursor-pointer"
                          >
                            {p.name ? `${p.name}: ` : ""}
                            {p.price}
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                />
              )
            )}
            {" "}to{" "}
            {offerToken("offerIcp", "who it's for", "Who it's for", (close) => (
              <TextEditor multiline initial={o.offerIcp} placeholder="e.g. agency owners doing $30k+/month" onSave={(v) => (setOffer("offerIcp", v), close())} />
            ), undefined, 360)}
            . It&apos;s a{" "}
            {offerToken(
              "offerVertical",
              "type of",
              "Industry",
              (close) => (
                <ChoiceList
                  options={VERTICALS.map((v) => ({ value: v.id, label: v.label }))}
                  value={o.offerVertical}
                  onPick={(v) => (setOffer("offerVertical", v), close())}
                />
              ),
              o.offerVertical ? verticalLabel(o.offerVertical).toLowerCase() : null
            )}
            {" "}business. Leads usually arrive{" "}
            {offerToken(
              "trafficTemperature",
              "how warm?",
              "How warm are leads when they book?",
              (close) => (
                <ChoiceList options={[...TEMPERATURES]} value={o.trafficTemperature} onPick={(v) => (setOffer("trafficTemperature", v), close())} />
              ),
              o.trafficTemperature || null,
              340
            )}
            , and{" "}
            {offerToken(
              "castingChoice",
              "someone",
              "Who's on camera",
              (close) => <ChoiceList options={[...CASTING]} value={o.castingChoice} onPick={(v) => (setOffer("castingChoice", v), close())} />,
              CASTING.find((c) => c.value === o.castingChoice)?.label ?? null,
              340
            )}
            {" "}is on camera.
          </p>
        </section>

        {/* Tools */}
        <section className="space-y-4">
          <SectionTitle hint="Tap a logo to connect, switch or disconnect.">Your tools</SectionTitle>
          {toolRows}
        </section>

        {/* What runs */}
        <section className="space-y-1">
          <SectionTitle hint="Every Showtime skill, set up from the above.">What runs</SectionTitle>
          <ul className="divide-y">
            <RunLine skill={anySkillDisplayName("pin-down")} icon="1">
              A confirmation page in your brand after every booking, with{" "}
              {offerToken(
                "heroVideoUrl",
                "a video placeholder",
                "Video on the page",
                (close) => (
                  <TextEditor initial={o.heroVideoUrl} placeholder="YouTube, Vimeo or Loom link" onSave={(v) => (setOffer("heroVideoUrl", v), close())} />
                ),
                o.heroVideoUrl ? "your video" : null
              )}{" "}
              at the top.{" "}
              {!hosting ? (
                <InlineLink onClick={() => onFocusGroup("hosting")}>Choose where it&apos;s hosted</InlineLink>
              ) : hosting === "webflow" && pick("webflow_site_id") ? (
                <>
                  Published to{" "}
                  <PickToken slot="webflow_site_id" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which Webflow site?" />
                  {" "}on Webflow.
                </>
              ) : hosting === "nextjs_vercel" && pick("vercel_project_name") ? (
                <>
                  Published to the{" "}
                  <PickToken slot="vercel_project_name" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which project?" />
                  {" "}project on Vercel.
                </>
              ) : hosting === "plain_html" || hosting === "lovable" ? (
                "We host it and hand you the link."
              ) : (
                `Published on ${toolLabel(hosting)}.`
              )}
            </RunLine>

            <RunLine skill={anySkillDisplayName("pile-on")} icon="2">
              {email ? (
                <>
                  New bookings get warm-up emails through {toolLabel(email)}
                  {pick("target_list_id") ? (
                    <>
                      , from the{" "}
                      <PickToken slot="target_list_id" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which list?" />
                      {" "}list
                    </>
                  ) : null}
                  . Text reminders are{" "}
                  <ChoiceToken
                    k="smsPlatform"
                    data={data}
                    draft={draft}
                    tierOf={tierOf}
                    setChoice={setChoice}
                    tokenProps={tokenProps}
                    domain={domain}
                    title="Text messages"
                    options={smsOptions(draft)}
                    display={(v) => SMS_LABEL[v] ?? v}
                  />
                  , and booked-lead data goes to{" "}
                  <ChoiceToken
                    k="adDataPlatform"
                    data={data}
                    draft={draft}
                    tierOf={tierOf}
                    setChoice={setChoice}
                    tokenProps={tokenProps}
                    domain={domain}
                    title="Where booked-lead data goes"
                    options={adOptions(draft)}
                    display={(v) => AD_LABEL[v] ?? v}
                  />
                  .
                </>
              ) : (
                <>
                  Warm-up emails before every call. <InlineLink onClick={() => onFocusGroup("email")}>Connect where emails send from</InlineLink>
                </>
              )}
            </RunLine>

            <RunLine skill={anySkillDisplayName("pre-call-read")} icon="3">
              Before every call, a brief on the prospect lands{" "}
              <ChoiceToken
                k="briefLandingDestination"
                data={data}
                draft={draft}
                tierOf={tierOf}
                setChoice={setChoice}
                tokenProps={tokenProps}
                domain={domain}
                title="Where briefs land"
                options={briefOptions(draft)}
                display={(v) => (v === "crm_note" ? `as a note in ${toolLabel(email) || "your CRM"}` : "in Slack")}
                placeholder="somewhere"
                extra={
                  draft.choices.briefLandingDestination === "slack" ? (
                    <SlackField value={draft.slackWebhookUrl} onSave={setSlack} />
                  ) : null
                }
              />
              .
            </RunLine>

            <RunLine skill={anySkillDisplayName("win-back")} icon="4">
              {email || booking ? (
                <>
                  No-shows get a rebooking sequence
                  {pick("recovery_list_id") ? (
                    <>
                      {" "}from the{" "}
                      <PickToken slot="recovery_list_id" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which list?" />
                      {" "}list
                    </>
                  ) : pick("recovery_workflow_id") ? (
                    <>
                      {" "}through the{" "}
                      <PickToken slot="recovery_workflow_id" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which workflow?" />
                      {" "}workflow
                    </>
                  ) : email ? (
                    ` through ${toolLabel(email)}`
                  ) : null}
                  {booking ? `, with live ${toolLabel(booking)} times to pick from.` : "."}
                </>
              ) : (
                <>
                  No-shows get a rebooking sequence. <InlineLink onClick={() => onFocusGroup("booking")}>Connect your booking tool</InlineLink>
                </>
              )}
            </RunLine>

            <RunLine skill={anySkillDisplayName("leak-map")} icon="5">
              Every Monday, a report on where booked calls leak out of the funnel, on your dashboard.
            </RunLine>
          </ul>
        </section>
      </div>

      <aside className="hidden @4xl:block">
        <div className="sticky top-6 space-y-3">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Your confirmation page</p>
          <ConfirmationPreview
            buyer={data.buyer}
            offerName={o.offerName}
            offerPrice={o.offerPrice}
            offerIcp={o.offerIcp}
            trafficTemperature={o.trafficTemperature}
            heroVideoUrl={o.heroVideoUrl}
            designSignal={data.preview.designSignal}
            template={data.preview.template}
          />
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {data.preview.designSignal ? `In ${domain}'s colors and fonts. ` : ""}Updates as you edit. Nothing is published until you turn Showtime on.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** A value the person just picked reads as theirs, whatever its old source. */
function touchedSource(tier: TrustTier, v: SetupValue | undefined): SetupValue | undefined {
  return tier === "done" && v && v.tier !== "done" ? { ...v, source: "user" } : v;
}

/** For an empty field with a weak guess behind it: say what the guess was. */
function weakGuess(v: SetupValue | undefined): string | null {
  return v && v.tier === "ask" && v.value ? `Our best guess was "${v.value}", but we're not sure enough to use it.` : "We couldn't find this. Add it and we'll use it everywhere.";
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-2.5">
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{children}</h2>
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

function RunLine({ skill, icon, children }: { skill: string; icon: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-1 gap-1 py-4 @xl:grid-cols-[170px_1fr] @xl:gap-6">
      <p className="flex items-center gap-2.5 text-sm font-medium text-[var(--text-primary)]">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
          {icon}
        </span>
        {skill}
      </p>
      <p className="text-[15px] leading-[1.95] text-[var(--text-secondary)]">{children}</p>
    </li>
  );
}

function InlineLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline font-medium text-[var(--text-primary)] underline decoration-dashed decoration-[var(--text-muted)] underline-offset-4 hover:decoration-[var(--text-primary)] cursor-pointer"
    >
      {children}
    </button>
  );
}

type TokenProps = (key: string) => { open: boolean; onOpenChange: (open: boolean) => void };

function ChoiceToken({
  k,
  data,
  draft,
  tierOf,
  setChoice,
  tokenProps,
  domain,
  title,
  options,
  display,
  placeholder = "choose",
  extra,
}: {
  k: ChoiceKey;
  data: ShowtimeSetupState;
  draft: Draft;
  tierOf: (key: string, v: SetupValue | undefined) => TrustTier;
  setChoice: (k: ChoiceKey, v: string | null) => void;
  tokenProps: TokenProps;
  domain: string;
  title: string;
  options: { value: string; label: string; hint?: string }[];
  display: (v: string) => string;
  placeholder?: string;
  extra?: React.ReactNode;
}) {
  const value = draft.choices[k];
  const tp = tokenProps(`choice.${k}`);
  const tier = tierOf(`choice.${k}`, data.choices[k]);
  return (
    <FactToken
      {...tp}
      display={value ? display(value) : null}
      placeholder={placeholder}
      tier={tier}
      title={title}
      source={value ? sourceText(touchedSource(tier, data.choices[k]), domain) : null}
    >
      <ChoiceList
        options={options}
        value={value}
        onPick={(v) => {
          setChoice(k, v);
          if (!(k === "briefLandingDestination" && v === "slack")) tp.onOpenChange(false);
        }}
      />
      {extra}
    </FactToken>
  );
}

function SlackField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <label className="text-xs font-medium text-[var(--text-secondary)]">Slack incoming-webhook URL</label>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onSave(v.trim())}
        placeholder="https://hooks.slack.com/services/…"
        className="h-9 w-full rounded-lg border bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
      />
    </div>
  );
}

function PickToken({
  slot,
  data,
  draft,
  setPick,
  tokenProps,
  engagementId,
  placeholder,
}: {
  slot: PickSlot;
  data: ShowtimeSetupState;
  draft: Draft;
  setPick: (s: PickSlot, v: Pick | null) => void;
  tokenProps: TokenProps;
  engagementId: string;
  placeholder: string;
}) {
  const state = data.picks[slot];
  const value = draft.picks[slot] ?? null;
  const tp = tokenProps(`pick.${slot}`);
  if (!state) return null;
  const tier: TrustTier = value && value.id === state.value?.id && state.tier !== "done" ? state.tier : value ? "done" : "ask";
  const source =
    value && state.source === "jev" && value.id === state.value?.id
      ? `Picked by matching your lists to this offer${state.confidence != null ? `, ${state.confidence}% sure` : ""}.`
      : state.noneFit
        ? "None of the lists in your account looked right, so we didn't guess."
        : null;
  return (
    <FactToken {...tp} display={value?.name ?? null} placeholder={placeholder} tier={tier} title={PICK_PURPOSE[slot]} source={source} width={340}>
      {tp.open && (
        <LiveOptions
          engagementId={engagementId}
          resource={state.resource}
          params={state.resourceParams}
          value={value?.id ?? null}
          onPick={(p) => {
            setPick(slot, p);
            tp.onOpenChange(false);
          }}
        />
      )}
    </FactToken>
  );
}

function LiveOptions({
  engagementId,
  resource,
  params,
  value,
  onPick,
}: {
  engagementId: string;
  resource: string;
  params?: Record<string, string>;
  value: string | null;
  onPick: (p: Pick | null) => void;
}) {
  const [options, setOptions] = useState<Pick[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let cancelled = false;
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    fetch(`/api/engagements/${engagementId}/stack-options/${resource}${qs}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(body.error ?? "Couldn't load the options.");
        else setOptions((body.options ?? []) as Pick[]);
      })
      .catch(() => !cancelled && setError("Couldn't load the options."));
    return () => {
      cancelled = true;
    };
  }, [engagementId, resource, params]);

  if (error) return <p className="text-xs text-[var(--error)]">{error}</p>;
  if (!options)
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading from your account…
      </p>
    );
  const shown = query ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())) : options;
  return (
    <div className="space-y-2">
      {options.length > 8 && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
        />
      )}
      {options.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Nothing in the connected account yet. Create one there, then come back.</p>
      ) : (
        <ChoiceList options={shown.map((o) => ({ value: o.id, label: o.name }))} value={value} onPick={(id) => onPick(options.find((o) => o.id === id) ?? null)} />
      )}
    </div>
  );
}

function smsOptions(draft: Draft) {
  const out: { value: string; label: string; hint?: string }[] = [{ value: "none", label: "Off", hint: "Emails only." }];
  if (draft.platforms.email === "ghl" || draft.platforms.booking === "ghl_calendar") out.unshift({ value: "ghl_sms", label: "Through GoHighLevel" });
  if (draft.platforms.email === "hubspot") out.unshift({ value: "hubspot_sms", label: "Through HubSpot", hint: "Runs through a HubSpot workflow." });
  out.unshift({ value: "twilio", label: "Through Twilio", hint: "Needs a Twilio number connected in Settings → Apps." });
  return out;
}

function adOptions(draft: Draft) {
  const out: { value: string; label: string; hint?: string }[] = [];
  if (draft.platforms.email && CRM_NOTE_PLATFORMS.has(draft.platforms.email)) {
    out.push({ value: "native_crm", label: `${toolLabel(draft.platforms.email)}`, hint: "Booked leads are tagged right in your CRM." });
  }
  out.push({ value: "hyros", label: "Hyros" }, { value: "google_sheets", label: "Google Sheets" }, { value: "none", label: "Nowhere yet" });
  return out;
}

function briefOptions(draft: Draft) {
  const out: { value: string; label: string; hint?: string }[] = [];
  if (draft.platforms.email && CRM_NOTE_PLATFORMS.has(draft.platforms.email)) {
    out.push({ value: "crm_note", label: `A note in ${toolLabel(draft.platforms.email)}`, hint: "On the prospect's contact, right where the rep looks." });
  }
  out.push({ value: "slack", label: "Slack", hint: "Posted to a channel through an incoming webhook." });
  return out;
}

// ── Blockers + save bar ────────────────────────────────────────────────

interface Blocker {
  key: string;
  label: string;
  openKey?: string;
  group?: ToolGroupId;
}

/** What Showtime's own readiness checks (worker-config-completeness.ts)
 * would still stop on, in the words of this screen. */
function findBlockers(data: ShowtimeSetupState, d: Draft): Blocker[] {
  const out: Blocker[] = [];
  if (!d.offer.trafficTemperature) out.push({ key: "temp", label: "How warm leads are", openKey: "offer.trafficTemperature" });
  if (!d.offer.offerName) out.push({ key: "offer", label: "What they sell", openKey: "offer.offerName" });
  if (!d.offer.offerPrice) out.push({ key: "price", label: "The price", openKey: "offer.offerPrice" });
  if (!d.offer.offerIcp) out.push({ key: "icp", label: "Who it's for", openKey: "offer.offerIcp" });
  if (!d.offer.offerVertical) out.push({ key: "vertical", label: "The industry", openKey: "offer.offerVertical" });
  const linked = (g: ToolGroupId) => {
    const p = d.platforms[g];
    if (!p) return false;
    const tool = findShowtimeTool(p, g);
    if (tool && !tool.needsKey) return true;
    // Hosting on a site builder without a publish API needs nothing more.
    if (g === "hosting" && !["webflow", "wordpress", "nextjs_vercel"].includes(p)) return true;
    return Boolean(data.tools.find((t) => t.provider === p && t.group === g)?.linked);
  };
  if (!linked("booking")) out.push({ key: "booking", label: "A booking tool", group: "booking" });
  if (!linked("email")) out.push({ key: "email", label: "An email tool", group: "email" });
  if (!linked("hosting")) out.push({ key: "hosting", label: "Where the page is hosted", group: "hosting" });
  if (!d.choices.briefLandingDestination) out.push({ key: "brief", label: "Where briefs land", openKey: "choice.briefLandingDestination" });
  else if (d.choices.briefLandingDestination === "slack" && !d.slackWebhookUrl.trim())
    out.push({ key: "slack", label: "The Slack webhook", openKey: "choice.briefLandingDestination" });
  return out;
}

function SaveBar({
  blockers,
  configured,
  saving,
  canSave,
  error,
  onSave,
  onCancel,
  cancelLabel,
  onBlocker,
}: {
  blockers: Blocker[];
  configured: boolean;
  saving: boolean;
  canSave: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onBlocker: (b: Blocker) => void;
}) {
  const ready = blockers.length === 0;
  return (
    <div className="sticky bottom-0 z-20 mt-2 border-t bg-background/95 px-4 py-3 backdrop-blur-md shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-4">
        <div className="min-w-0 flex-1">
          {error ? (
            <p className="flex items-center gap-2 text-sm text-[var(--error)]">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </p>
          ) : ready ? (
            <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </span>
              Everything&apos;s set. Check anything above, then turn it on.
            </p>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto text-sm [scrollbar-width:none] @3xl:flex-wrap">
              <span className="mr-1 shrink-0 text-[var(--text-secondary)]">
                {blockers.length} thing{blockers.length === 1 ? "" : "s"} need{blockers.length === 1 ? "s" : ""} you:
              </span>
              {blockers.slice(0, 4).map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onBlocker(b)}
                  className="shrink-0 rounded-full border border-dashed border-[var(--text-muted)]/60 px-2.5 py-0.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--text-primary)] hover:bg-[var(--accent-dim)] cursor-pointer"
                >
                  {b.label}
                </button>
              ))}
              {blockers.length > 4 && <span className="text-xs text-[var(--text-muted)]">+{blockers.length - 4} more</span>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" className="hidden @md:inline-flex" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          {!ready && canSave && (
            <Button variant="outline" onClick={onSave} disabled={saving}>
              Save for now
            </Button>
          )}
          <Button size="lg" className="h-10 px-5" onClick={onSave} disabled={saving || !ready}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {configured ? "Save changes" : "Turn on Showtime"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SetupSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-8 py-10" role="status" aria-label="Loading setup">
      <div className="space-y-3">
        <div className="h-3 w-20 rounded-full bg-[var(--accent-dim)]" />
        <div className="h-8 w-80 max-w-full rounded-lg bg-[var(--accent-dim)]" />
        <div className="h-4 w-full max-w-lg rounded bg-[var(--accent-dim)]" />
      </div>
      <div className="h-14 w-full bg-[var(--accent-dim)]" />
      <div className="flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-12 rounded-full bg-[var(--accent-dim)]" />
        ))}
      </div>
    </div>
  );
}

