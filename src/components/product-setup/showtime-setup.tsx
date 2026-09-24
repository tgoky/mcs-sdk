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
import { AlertTriangle, ArrowRight, Check, Eye, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { useTour } from "@/components/tours/tour-provider";
import { VERTICALS, verticalLabel } from "@/lib/verticals";
import { CRM_NOTE_PLATFORMS, SHOWTIME_TOOL_GROUPS, findShowtimeTool, type ToolGroupId } from "@/lib/showtime-setup/catalog";
import { PICK_PURPOSE, showtimePickTargets } from "@/lib/showtime-setup/picks";
import type { ActivationStep, PickSlot, PinDownExtras, SetupValue, ShowtimeSetupState, TrustTier } from "@/lib/showtime-setup/types";
import { TEMPLATE_IDS, TEMPLATE_META, DEFAULT_TEMPLATE, type TemplateId } from "@/features/pin-down/server/templates/types";
import { ToolAvatar, type ToolActions } from "./tool-avatar";
import { ChoiceList, FactToken, TextEditor } from "./fact-token";
import { ActivationProgress } from "./activation-steps";
import { AnchoredCard } from "./anchored-card";
import { AccountReadSection, hasAccountRead } from "./account-read";
import { SkillSwitchRow, Switch } from "./skill-switch";
import { SHOWTIME_SKILLS, needsFor, type CombinedNeeds } from "@/lib/showtime-setup/skills";
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
  /** Keep the client's own confirmation page instead of building one. */
  keepPage: boolean;
  /** The booking event type that is the sales call. */
  salesCallEventId: string | null;
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
    keepPage: keep("keepPage") ? prev!.keepPage : data.existingPage.reuse,
    salesCallEventId: keep("salesCall")
      ? prev!.salesCallEventId
      : data.accountRead.salesCall && data.accountRead.salesCall.tier !== "ask"
        ? data.accountRead.salesCall.id
        : null,
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

/** Showtime's screen only ever shows Showtime's own tool groups. */
const showtimeGroup = (tool: { group: string }) => tool.group as ToolGroupId;

function bareHost(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

// ── Component ──────────────────────────────────────────────────────────

export function ShowtimeSetup({
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
  /** Open as this skill's own settings (see PinDownSettings) once Showtime
   * is set up. Before that, the full setup shows either way: there's
   * nothing to configure until it has run once. */
  focus?: "pin-down";
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
  // Which Showtime skills this client wants. A client already set up starts
  // from what's on; a new one starts with nothing picked, so nothing (not
  // even the confirmation page) is assumed.
  const [skills, setSkills] = useState<string[]>([]);
  const focused = focus === "pin-down" && Boolean(data?.configured);
  // Focused, only this skill's needs count: the Slack webhook Call Brief
  // needs is not something Show Rate Setup's settings should ask for.
  const baseNeeds = useMemo(() => needsFor(focused ? ["pin-down"] : skills), [focused, skills]);
  // Pin-Down's inputs the setup never asked for; saved separately, and
  // only the ones changed here (see savePinDownExtras).
  const [extras, setExtras] = useState<PinDownExtras | null>(null);
  const touchedExtras = useRef(new Set<keyof PinDownExtras>());
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
      if (opts.initial || touchedExtras.current.size === 0) setExtras(next.pinDown);
      if (opts.initial) {
        setPhase(next.configured ? "review" : "welcome");
        setSkills(next.configured ? SHOWTIME_SKILLS.filter((sk) => next.skills[sk.id]).map((sk) => sk.id) : []);
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
  // Keeping the client's own confirmation page means nothing to host or
  // publish to, so hosting drops out of what's asked.
  const needs = useMemo<CombinedNeeds>(() => {
    if (!draft?.keepPage || !data?.existingPage.url) return baseNeeds;
    const groups = new Set(baseNeeds.groups);
    groups.delete("hosting");
    const picks = new Set(baseNeeds.picks);
    picks.delete("webflow_site_id");
    picks.delete("vercel_project_name");
    return { ...baseNeeds, groups, picks };
  }, [baseNeeds, draft?.keepPage, data?.existingPage.url]);
  const setKeepPage = (v: boolean) => update((d) => ({ ...d, keepPage: v }), "keepPage");
  const setSalesCall = (id: string) => update((d) => ({ ...d, salesCallEventId: id }), "salesCall");
  const setExtra = <K extends keyof PinDownExtras>(k: K, v: PinDownExtras[K]) => {
    touchedExtras.current.add(k);
    setExtras((e) => (e ? { ...e, [k]: v } : e));
  };
  const toggleSkill = (id: string, on: boolean) =>
    setSkills((cur) => (on ? SHOWTIME_SKILLS.map((sk) => sk.id).filter((x) => x === id || cur.includes(x)) : cur.filter((x) => x !== id)));

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
      setPlatform(showtimeGroup(tool), tool.provider);
      await load().catch(() => undefined);
      return null;
    },
    connectKey: async (tool, value, extra) => {
      const err = await post(`/api/engagements/${engagementId}/setup/showtime/connect`, { provider: tool.provider, value, ...extra });
      if (err) return err;
      setPlatform(showtimeGroup(tool), tool.provider);
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
      if (draft?.platforms[showtimeGroup(tool)] === tool.provider) setPlatform(showtimeGroup(tool), null);
      await load().catch(() => undefined);
      return null;
    },
    choose: (tool) => setPlatform(showtimeGroup(tool), tool.provider),
  };

  // ── Activate ──
  async function activate() {
    if (!draft) return;
    setPhase("working");
    setSteps([]);
    setActivateError(null);
    // Bring the progress panel into view; it replaces the button at the bottom.
    setTimeout(() => document.getElementById("showtime-progress")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/showtime/activate`, {
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
      await load();
      // A beat on the finished list before the review replaces it.
      await new Promise((r) => setTimeout(r, 700));
      setPhase("review");
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  // ── Save ──
  const blockers = useMemo(() => (data && draft ? findBlockers(data, draft, needs) : []), [data, draft, needs]);
  // The save route's own hard requirements; everything else can be saved
  // and finished later. Switching everything off is allowed once set up.
  const canSaveAtAll =
    (skills.length > 0 || Boolean(data?.configured)) &&
    (!needs.offer || Boolean(draft?.offer.trafficTemperature && (draft.domain || data?.website.domain)));

  /** The touched extras, through the route the client details drawer uses. */
  async function savePinDownExtras() {
    if (!extras || touchedExtras.current.size === 0) return;
    const t = touchedExtras.current;
    const patch: Record<string, unknown> = {};
    if (t.has("template")) patch.confirmationPageTemplate = extras.template;
    if (t.has("animations")) patch.confirmationPageAnimationsEnabled = extras.animations;
    if (t.has("personalizedIntro")) patch.offerDetails = { hybrid_mode_enabled: extras.personalizedIntro };
    if (t.has("prospectMeets")) patch.prospectMeets = extras.prospectMeets;
    if (t.has("topCallQuestions")) patch.topCallQuestions = extras.topCallQuestions;
    if (t.has("topObjections")) patch.topObjections = extras.topObjections;
    if (t.has("brandVoice")) patch.rawVoiceCorpus = extras.brandVoice;
    const res = await fetch(`/api/engagements/${engagementId}/details`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
  }

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
    // Only the full setup decides which skills run. Sent from a skill's own
    // settings, this list would switch every other Showtime skill to
    // whatever the screen last loaded.
    if (!focused) body.skills = skills;
    if (draft.salesCallEventId) body.salesCallEventId = draft.salesCallEventId;
    if (data.existingPage.url) {
      body.existingConfirmationPageReuse = draft.keepPage;
      body.existingConfirmationPageUrl = data.existingPage.url;
    }
    // Only sent when there's something to set: an empty string would clear
    // a saved value on the server.
    if (draft.offer.heroVideoUrl.trim()) body.heroVideoUrl = draft.offer.heroVideoUrl.trim();
    if (draft.choices.briefLandingDestination === "slack" && draft.slackWebhookUrl.trim()) body.slackWebhookUrl = draft.slackWebhookUrl.trim();

    try {
      // First, so the Pin-Down run the save starts reads them.
      await savePinDownExtras();
      const res = await fetch(`/api/engagements/${engagementId}/bridges/pin-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      toast.success(
        focused
          ? blockers.length === 0
            ? "Show Rate Setup saved. The page is being rebuilt."
            : `Saved. ${blockers.length} thing${blockers.length === 1 ? "" : "s"} left before the page can be built.`
          : skills.length === 0
          ? `Showtime is off for ${data.buyer}.`
          : blockers.length === 0
            ? `${skills.length} Showtime skill${skills.length === 1 ? " is" : "s are"} on for ${data.buyer}.`
            : `Saved. ${blockers.length} thing${blockers.length === 1 ? "" : "s"} left before everything runs.`
      );
      touched.current.clear();
      touchedExtras.current.clear();
      router.refresh();
      if (!focused && skills.length > 0) startTour("showtime");
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

  const shownGroups = SHOWTIME_TOOL_GROUPS.filter((g) => needs.groups.has(g.id) || needs.optionalGroups.has(g.id));
  const toolRows = (compact: boolean) => (
    <div ref={toolsRef} className={cn("space-y-5", compact && "space-y-4")}>
      {shownGroups.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Switch on a skill above and we&apos;ll show only the tools it uses.</p>}
      {shownGroups.map((group) => (
        <motion.div
          key={group.id}
          animate={flashGroup === group.id ? { backgroundColor: ["rgba(0,0,0,0)", "var(--surface-prefill)", "rgba(0,0,0,0)"] } : {}}
          transition={{ duration: 1.4 }}
          className="-mx-3 grid grid-cols-1 gap-3 rounded-xl px-3 py-1 @xl:grid-cols-[140px_1fr] @xl:items-center"
        >
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {group.label}
              {!needs.groups.has(group.id) && <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">Optional</span>}
            </p>
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
              skills={skills}
              needs={needs}
              onToggleSkill={toggleSkill}
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
            {focused && extras ? (
              <PinDownSettings
                data={data}
                draft={draft}
                extras={extras}
                setExtra={setExtra}
                domain={domain}
                tierOf={tierOf}
                openKey={openKey}
                setOpenKey={setOpenKey}
                setOffer={setOffer}
                setPick={setPick}
                setKeepPage={setKeepPage}
                setSalesCall={setSalesCall}
                toolRows={toolRows(true)}
                onFocusGroup={(g) => {
                  toolsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setFlashGroup(g);
                  setTimeout(() => setFlashGroup(null), 1500);
                }}
                engagementId={engagementId}
              />
            ) : (
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
              skills={skills}
              needs={needs}
              onToggleSkill={toggleSkill}
              setKeepPage={setKeepPage}
              setSalesCall={setSalesCall}
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
            )}
            <SaveBar
              blockers={blockers}
              skillCount={focused ? 1 : skills.length}
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

/** Showtime's own product mark, the same art the Library shows. */
function ShowtimeMark({ size = 44 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-elevation-1 ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static product mark, same as the Library's */}
      <img src="/images/showtime.png" alt="" className="h-[82%] w-[82%] object-contain" />
    </span>
  );
}

function Welcome({
  data,
  draft,
  setDomain,
  toolRows,
  phase,
  steps,
  skills,
  needs,
  onToggleSkill,
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
  skills: string[];
  needs: CombinedNeeds;
  onToggleSkill: (id: string, on: boolean) => void;
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
  const canActivate = skills.length > 0 && (!needs.website || Boolean(host));

  return (
    <div className="space-y-9">
      <header className="flex items-start gap-4">
        <ShowtimeMark />
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[30px]">
            Set up Showtime for {data.buyer}
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed">
            Pick what you want running. We set it up from your website and the tools you already use, and you check our work.
          </p>
        </div>
      </header>

      <section className={cn("transition-opacity", working && "pointer-events-none opacity-60")}>
        <h2 className="text-sm font-medium text-[var(--text-primary)]">What should Showtime do?</h2>
        <ul className="mt-1 divide-y">
          {SHOWTIME_SKILLS.map((sk) => (
            <SkillSwitchRow key={sk.id} skillId={sk.id} blurb={sk.blurb} on={skills.includes(sk.id)} onChange={(on) => onToggleSkill(sk.id, on)} />
          ))}
        </ul>
      </section>

      <AnimatePresence initial={false}>
        {skills.length > 0 && (
          <motion.div
            key="inputs"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-9 overflow-hidden"
          >
            <section className={cn("space-y-2.5 transition-opacity", working && "pointer-events-none opacity-60")}>
              <label htmlFor="showtime-website" className="flex items-baseline gap-2 text-sm font-medium text-[var(--text-primary)]">
                Your website
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  {needs.website ? "The confirmation page is built from it" : "Optional. It helps us fill in the rest"}
                </span>
              </label>
              <div className="flex h-14 items-center border border-[var(--text-muted)]/40 bg-background transition-colors focus-within:border-[var(--text-primary)] dark:border-white/15">
                <span className="select-none pl-4 text-lg text-[var(--text-muted)]">https://</span>
                <input
                  id="showtime-website"
                  value={draft.domain.replace(/^https?:\/\//i, "")}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canActivate && onActivate()}
                  placeholder="yourwebsite.com"
                  autoComplete="url"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 bg-transparent pr-4 pl-0.5 text-lg text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/60"
                />
              </div>
              {known && (
                <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-prefill-accent)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  {readHere && readAgo ? `We already read this site ${readAgo}, so this takes seconds.` : `Already on file for ${data.buyer}.`}
                </p>
              )}
            </section>

            <section className={cn("space-y-5 transition-opacity", working && "pointer-events-none opacity-60")}>
              <div>
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Connect your tools</h2>
                <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                  {connectedCount > 0
                    ? `${connectedCount} already connected. Only the tools your skills use are shown.`
                    : "Tap a logo. Tools you've connected for other clients show up ready to reuse."}
                </p>
              </div>
              {toolRows}
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="progress" id="showtime-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ActivationProgress steps={steps} working={!activateError} host={host} error={activateError} onRetry={onActivate} />
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate} disabled={!canActivate}>
                {skills.length > 1 ? `Set up ${skills.length} skills` : "Set it up"} <ArrowRight />
              </Button>
              <p className="text-[13px] text-[var(--text-muted)]">
                {skills.length === 0
                  ? "Switch on at least one skill."
                  : needs.website && !host
                    ? "Add the website first."
                    : readHere || !host
                      ? "Takes a few seconds."
                      : "About a minute the first time we read a site."}
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
  skills,
  needs,
  onToggleSkill,
  setKeepPage,
  setSalesCall,
}: {
  skills: string[];
  needs: CombinedNeeds;
  onToggleSkill: (id: string, on: boolean) => void;
  setKeepPage: (v: boolean) => void;
  setSalesCall: (id: string) => void;
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
  const t = offerTokens({ data, draft, domain, tierOf, tokenProps, setOffer, setOpenKey });
  const readAgo = relativeTime(data.website.readAt);
  const name = usable(data.offer.operatorName) ?? data.buyer;
  const email = draft.platforms.email;
  const booking = draft.platforms.booking;
  const pick = (slot: PickSlot) => data.picks[slot];
  const isOn = (id: string) => skills.includes(id);
  const skillRow = (id: string) => {
    const sk = SHOWTIME_SKILLS.find((x) => x.id === id)!;
    return { skillId: id, blurb: sk.blurb, on: isOn(id), onChange: (v: boolean) => onToggleSkill(id, v) };
  };

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="min-w-0 space-y-10">
        <header className="flex items-start gap-4">
          <ShowtimeMark size={40} />
          <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
            {data.configured ? `Showtime for ${data.buyer}` : `Here's Showtime for ${data.buyer}`}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--text-muted)]">
            <span>
              {domain ? (
                <>
                  Set up from <span className="font-medium text-[var(--text-secondary)]">{domain}</span>
                </>
              ) : (
                "Set up from your tools"
              )}
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
          </div>
        </header>

        {/* What we learned: only the confirmation page needs the offer described */}
        {needs.offer && (
        <section className="space-y-3">
          <SectionTitle>What we learned</SectionTitle>
          <p className="max-w-[62ch] text-[17px] leading-[2.1] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{name}</span> sells{" "}
            {t.offerName}
            {" "}for{" "}
            {t.offerPrice}
            {" "}to{" "}
            {t.offerIcp}
            . It&apos;s a{" "}
            {t.offerVertical}
            {" "}business. Leads usually arrive{" "}
            {t.trafficTemperature}
            , and{" "}
            {t.castingChoice}
            {" "}is on camera.
          </p>
        </section>
        )}

        {/* What the connected tools showed: counted, not typed */}
        {hasAccountRead(data.accountRead) && (
          <section className="space-y-4">
            <SectionTitle hint="Counted from your connected tools. Nothing here was typed.">What your tools told us</SectionTitle>
            <AccountReadSection
              read={data.accountRead}
              salesCallId={draft.salesCallEventId}
              salesCallTier={tierOf("salesCall", data.accountRead.salesCall ? ({ tier: data.accountRead.salesCall.tier } as SetupValue) : undefined)}
              onPickSalesCall={setSalesCall}
              tokenProps={tokenProps}
            />
          </section>
        )}

        {/* Skills: switch each one on or off; what an on skill will do, editable */}
        <section className="space-y-1">
          <SectionTitle hint="Switch any skill on or off. Tap a highlighted word to change it.">Skills</SectionTitle>
          <ul className="divide-y">
            <SkillSwitchRow {...skillRow("pin-down")}>
              {data.existingPage.url && draft.keepPage ? (
                <>
                  We&apos;ll keep your own confirmation page at{" "}
                  <a href={data.existingPage.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--text-primary)] underline decoration-[var(--border)] underline-offset-4 hover:decoration-[var(--text-primary)]">
                    {bareHost(data.existingPage.url)}
                  </a>{" "}
                  and check it for gaps. Nothing gets published. <InlineLink onClick={() => setKeepPage(false)}>Build ours instead</InlineLink>
                </>
              ) : (
                <>
                  A confirmation page in your brand after every booking, with{" "}
                  {t.heroVideoUrl}{" "}
                  at the top.{" "}
                  <HostingTarget data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} onFocusGroup={onFocusGroup} />{" "}
                  <PagePreview
                    open={openKey === "preview"}
                    onOpenChange={(v) => setOpenKey(v ? "preview" : null)}
                    buyer={data.buyer}
                    offer={o}
                    designSignal={data.preview.designSignal}
                    template={data.preview.template}
                    domain={domain}
                  />
                  {(data.siteReading.testimonials.length > 0 || data.siteReading.faqs.length > 0) && (
                    <>
                      {" "}It uses{" "}
                      {data.siteReading.testimonials.length > 0 && (
                        <SiteListToken
                          tokenKey="site.testimonials"
                          tokenProps={tokenProps}
                          label={`${data.siteReading.testimonials.length} testimonial${data.siteReading.testimonials.length === 1 ? "" : "s"}`}
                          title="Testimonials from your site"
                          source={`Copied word for word from ${domain}.`}
                          items={data.siteReading.testimonials.map((t) => ({
                            primary: `“${t.quote}”`,
                            secondary: [t.name, t.role, t.company].filter(Boolean).join(", "),
                          }))}
                        />
                      )}
                      {data.siteReading.testimonials.length > 0 && data.siteReading.faqs.length > 0 ? " and " : ""}
                      {data.siteReading.faqs.length > 0 && (
                        <SiteListToken
                          tokenKey="site.faqs"
                          tokenProps={tokenProps}
                          label={`${data.siteReading.faqs.length} question${data.siteReading.faqs.length === 1 ? "" : "s"}`}
                          title="Questions from your FAQ"
                          source={`Your own FAQ on ${domain}, shown to bookers before the call.`}
                          items={data.siteReading.faqs.map((f) => ({ primary: f.question, secondary: f.answer }))}
                        />
                      )}{" "}
                      from your site.
                    </>
                  )}
                  {data.existingPage.url && (
                    <span className="mt-1 block text-[13px] text-[var(--text-muted)]">
                      You already have one at{" "}
                      <a href={data.existingPage.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        {bareHost(data.existingPage.url)}
                      </a>
                      . <InlineLink onClick={() => setKeepPage(true)}>Keep yours instead</InlineLink>
                    </span>
                  )}
                </>
              )}
            </SkillSwitchRow>

            <SkillSwitchRow {...skillRow("pile-on")}>
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
            </SkillSwitchRow>

            <SkillSwitchRow {...skillRow("pre-call-read")}>
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
              {data.siteReading.objections.length > 0 && (
                <>
                  {" "}Each one prepares the rep for the{" "}
                  <SiteListToken
                    tokenKey="site.objections"
                    tokenProps={tokenProps}
                    tier={data.siteReading.objectionsTier}
                    label={`${data.siteReading.objections.length} objection${data.siteReading.objections.length === 1 ? "" : "s"}`}
                    title="Objections your site answers"
                    source={
                      data.siteReading.objectionsTier === "done"
                        ? `Read from ${domain} and checked against it.`
                        : `Read from ${domain}. We're not fully sure of these yet.`
                    }
                    items={data.siteReading.objections.map((o) => ({ primary: o }))}
                  />{" "}
                  your site already answers.
                </>
              )}
            </SkillSwitchRow>

            <SkillSwitchRow {...skillRow("win-back")}>
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
            </SkillSwitchRow>

            <SkillSwitchRow {...skillRow("leak-map")}>
              Every Monday, a report on where booked calls leak out of the funnel, on your dashboard.
            </SkillSwitchRow>
          </ul>
        </section>

        {/* Tools: only the groups the switched-on skills use */}
        <section className="space-y-4">
          <SectionTitle hint="Tap a logo to connect, switch or disconnect.">Your tools</SectionTitle>
          {toolRows}
        </section>
      </div>

    </div>
  );
}

// ── Pieces shared by the setup and a skill's own settings ──────────────

interface OfferTokenArgs {
  data: ShowtimeSetupState;
  draft: Draft;
  domain: string;
  tierOf: (key: string, v: SetupValue | undefined) => TrustTier;
  tokenProps: TokenProps;
  setOffer: (k: OfferKey, v: string) => void;
  setOpenKey: (k: string | null) => void;
}

/** Each offer value as a tappable token with its editor. The setup reads
 * them as one sentence; Show Rate Setup's settings list them one per row. */
function offerTokens({ data, draft, domain, tierOf, tokenProps, setOffer, setOpenKey }: OfferTokenArgs): Record<OfferKey, React.ReactNode> {
  const o = draft.offer;
  const token = (k: OfferKey, placeholder: string, title: string, editor: (close: () => void) => React.ReactNode, display?: string | null, width?: number) => (
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
  return {
    offerName: token("offerName", "what they sell", "What they sell", (close) => (
      <TextEditor initial={o.offerName} placeholder="e.g. 12-week growth program" onSave={(v) => (setOffer("offerName", v), close())} />
    )),
    offerPrice: token("offerPrice", "a price", "Price", (close) => (
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
    )),
    offerIcp: token(
      "offerIcp",
      "who it's for",
      "Who it's for",
      (close) => <TextEditor multiline initial={o.offerIcp} placeholder="e.g. agency owners doing $30k+/month" onSave={(v) => (setOffer("offerIcp", v), close())} />,
      undefined,
      360
    ),
    offerVertical: token(
      "offerVertical",
      "type of",
      "Industry",
      (close) => (
        <ChoiceList options={VERTICALS.map((v) => ({ value: v.id, label: v.label }))} value={o.offerVertical} onPick={(v) => (setOffer("offerVertical", v), close())} />
      ),
      o.offerVertical ? verticalLabel(o.offerVertical).toLowerCase() : null
    ),
    trafficTemperature: token(
      "trafficTemperature",
      "how warm?",
      "How warm are leads when they book?",
      (close) => <ChoiceList options={[...TEMPERATURES]} value={o.trafficTemperature} onPick={(v) => (setOffer("trafficTemperature", v), close())} />,
      o.trafficTemperature || null,
      340
    ),
    castingChoice: token(
      "castingChoice",
      "someone",
      "Who's on camera",
      (close) => <ChoiceList options={[...CASTING]} value={o.castingChoice} onPick={(v) => (setOffer("castingChoice", v), close())} />,
      CASTING.find((c) => c.value === o.castingChoice)?.label ?? null,
      340
    ),
    heroVideoUrl: token(
      "heroVideoUrl",
      "a video placeholder",
      "Video on the page",
      (close) => <TextEditor initial={o.heroVideoUrl} placeholder="YouTube, Vimeo or Loom link" onSave={(v) => (setOffer("heroVideoUrl", v), close())} />,
      o.heroVideoUrl ? "your video" : null
    ),
  };
}

/** Where the confirmation page is published, with the site or project to
 * publish to when the host has one to pick. */
function HostingTarget({
  data,
  draft,
  setPick,
  tokenProps,
  engagementId,
  onFocusGroup,
}: {
  data: ShowtimeSetupState;
  draft: Draft;
  setPick: (s: PickSlot, v: Pick | null) => void;
  tokenProps: TokenProps;
  engagementId: string;
  onFocusGroup: (g: ToolGroupId) => void;
}) {
  const hosting = draft.platforms.hosting;
  if (!hosting) return <InlineLink onClick={() => onFocusGroup("hosting")}>Choose where it&apos;s hosted</InlineLink>;
  if (hosting === "webflow" && data.picks.webflow_site_id) {
    return (
      <>
        Published to{" "}
        <PickToken slot="webflow_site_id" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which Webflow site?" />
        {" "}on Webflow.
      </>
    );
  }
  if (hosting === "nextjs_vercel" && data.picks.vercel_project_name) {
    return (
      <>
        Published to the{" "}
        <PickToken slot="vercel_project_name" data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} placeholder="which project?" />
        {" "}project on Vercel.
      </>
    );
  }
  if (hosting === "plain_html" || hosting === "lovable") return <>We host it and hand you the link.</>;
  return <>Published on {toolLabel(hosting)}.</>;
}

// ── Show Rate Setup's own settings ─────────────────────────────────────

/** A labelled settings row: the name of the setting, then its value. */
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 @md:grid-cols-[150px_1fr] @md:gap-4">
      <p className="text-[13px] text-[var(--text-muted)] @md:pt-0.5">{label}</p>
      <div className="min-w-0 text-sm leading-relaxed text-[var(--text-primary)]">{children}</div>
    </div>
  );
}

function ToggleSetting({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

function SettingsGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <div className="divide-y">{children}</div>
    </section>
  );
}

/**
 * What the gear on Show Rate Setup opens once Showtime is set up: that
 * skill's settings and nothing else. The full setup (every Showtime skill
 * with an on/off switch, told as sentences) is onboarding; shown on a
 * revisit it read as a page about Showtime rather than this skill's
 * settings, and its switches turned other skills on and off from a
 * screen the person opened to change one thing. The setup stays one link
 * away for re-reading the website or choosing which skills run.
 */
function PinDownSettings({
  data,
  draft,
  extras,
  setExtra,
  setSalesCall,
  domain,
  tierOf,
  openKey,
  setOpenKey,
  setOffer,
  setPick,
  setKeepPage,
  toolRows,
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
  setPick: (s: PickSlot, v: Pick | null) => void;
  setKeepPage: (v: boolean) => void;
  toolRows: React.ReactNode;
  onFocusGroup: (g: ToolGroupId) => void;
  engagementId: string;
  extras: PinDownExtras;
  setExtra: <K extends keyof PinDownExtras>(k: K, v: PinDownExtras[K]) => void;
  setSalesCall: (id: string) => void;
}) {
  const tokenProps = (key: string) => ({ open: openKey === key, onOpenChange: (open: boolean) => setOpenKey(open ? key : null) });
  const t = offerTokens({ data, draft, domain, tierOf, tokenProps, setOffer, setOpenKey });
  const close = () => setOpenKey(null);
  // A saved value, tappable to change. Empty ones read as a question.
  const saved = (key: string, display: string | null, placeholder: string, title: string, editor: React.ReactNode, width?: number) => (
    <FactToken {...tokenProps(key)} display={display} placeholder={placeholder} tier="done" title={title} source={display ? "Saved for this client." : null} width={width}>
      {editor}
    </FactToken>
  );
  const list = (key: "topCallQuestions" | "topObjections", noun: string, title: string, placeholder: string) =>
    saved(
      `extra.${key}`,
      extras[key].length ? `${extras[key].length} ${noun}${extras[key].length === 1 ? "" : "s"}` : null,
      "none yet",
      title,
      <TextEditor
        multiline
        initial={extras[key].join("\n")}
        placeholder={placeholder}
        onSave={(v) => (setExtra(key, v.split("\n").map((x) => x.trim()).filter(Boolean)), close())}
      />,
      380
    );
  const template = (TEMPLATE_IDS as string[]).includes(extras.template) ? (extras.template as TemplateId) : DEFAULT_TEMPLATE;
  const eventTypes = data.accountRead.eventTypes;
  const salesCall = eventTypes.find((e) => e.id === draft.salesCallEventId) ?? null;
  const keepingOwn = Boolean(data.existingPage.url && draft.keepPage);
  const { testimonials, faqs } = data.siteReading;

  return (
    <div className="space-y-7 pb-4">
      <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
        The confirmation page {data.buyer}&apos;s bookers see, and what it says. Tap a value to change it.
        {domain ? <> Read from {domain}.</> : null}{" "}
        <a
          href={`/dashboard/engagements/${engagementId}/bridges/pin-down`}
          className="font-medium text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text-primary)]"
        >
          Full Showtime setup
        </a>
      </p>

      <SettingsGroup title="The page">
        {data.existingPage.url && (
          <SettingRow label="Which page">
            {keepingOwn ? (
              <>
                Your own, at{" "}
                <a href={data.existingPage.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  {bareHost(data.existingPage.url)}
                </a>
                . We check it for gaps and publish nothing. <InlineLink onClick={() => setKeepPage(false)}>Build ours instead</InlineLink>
              </>
            ) : (
              <>
                One we build in your brand. <InlineLink onClick={() => setKeepPage(true)}>Keep yours at {bareHost(data.existingPage.url)}</InlineLink>
              </>
            )}
          </SettingRow>
        )}
        {!keepingOwn && (
          <>
            <SettingRow label="Published to">
              <HostingTarget data={data} draft={draft} setPick={setPick} tokenProps={tokenProps} engagementId={engagementId} onFocusGroup={onFocusGroup} />
            </SettingRow>
            <SettingRow label="Design">
              {saved(
                "extra.template",
                TEMPLATE_META[template].name,
                "a design",
                "Page design",
                <ChoiceList
                  options={TEMPLATE_IDS.map((id) => ({ value: id, label: TEMPLATE_META[id].name, hint: TEMPLATE_META[id].bestFor }))}
                  value={template}
                  onPick={(v) => (setExtra("template", v), close())}
                />,
                360
              )}
            </SettingRow>
            <SettingRow label="Video at the top">{t.heroVideoUrl}</SettingRow>
            <SettingRow label="Personal intro">
              <ToggleSetting
                on={extras.personalizedIntro}
                onChange={(v) => setExtra("personalizedIntro", v)}
                label="An AI-written opening paragraph for each booker"
              />
            </SettingRow>
            <SettingRow label="Animations">
              <ToggleSetting on={extras.animations} onChange={(v) => setExtra("animations", v)} label="Sections fade in as the page loads" />
            </SettingRow>
            {(testimonials.length > 0 || faqs.length > 0) && (
              <SettingRow label="From your site">
                {testimonials.length > 0 && (
                  <SiteListToken
                    tokenKey="site.testimonials"
                    tokenProps={tokenProps}
                    label={`${testimonials.length} testimonial${testimonials.length === 1 ? "" : "s"}`}
                    title="Testimonials from your site"
                    source={`Copied word for word from ${domain}.`}
                    items={testimonials.map((x) => ({ primary: `“${x.quote}”`, secondary: [x.name, x.role, x.company].filter(Boolean).join(", ") }))}
                  />
                )}
                {testimonials.length > 0 && faqs.length > 0 ? " and " : ""}
                {faqs.length > 0 && (
                  <SiteListToken
                    tokenKey="site.faqs"
                    tokenProps={tokenProps}
                    label={`${faqs.length} question${faqs.length === 1 ? "" : "s"}`}
                    title="Questions from your FAQ"
                    source={`Your own FAQ on ${domain}, shown to bookers before the call.`}
                    items={faqs.map((f) => ({ primary: f.question, secondary: f.answer }))}
                  />
                )}
              </SettingRow>
            )}
            <SettingRow label="Preview">
              <PagePreview
                open={openKey === "preview"}
                onOpenChange={(v) => setOpenKey(v ? "preview" : null)}
                buyer={data.buyer}
                offer={draft.offer}
                designSignal={data.preview.designSignal}
                template={data.preview.template}
                domain={domain}
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title="The offer" hint="What the page tells bookers.">
        <SettingRow label="What they sell">{t.offerName}</SettingRow>
        <SettingRow label="Price">{t.offerPrice}</SettingRow>
        <SettingRow label="Who it's for">{t.offerIcp}</SettingRow>
        <SettingRow label="Industry">{t.offerVertical}</SettingRow>
        <SettingRow label="Leads arrive">{t.trafficTemperature}</SettingRow>
        <SettingRow label="On camera">{t.castingChoice}</SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Scripts and briefs" hint="What the video scripts and ad briefs are written from.">
        <SettingRow label="Who runs the calls">
          {saved(
            "extra.prospectMeets",
            extras.prospectMeets || null,
            "someone",
            "Who prospects meet on the call",
            <TextEditor initial={extras.prospectMeets} placeholder="e.g. the founder, or a closer named Sam" onSave={(v) => (setExtra("prospectMeets", v.trim()), close())} />
          )}
        </SettingRow>
        <SettingRow label="Questions on calls">{list("topCallQuestions", "question", "Questions prospects ask on calls", "One per line")}</SettingRow>
        <SettingRow label="Objections">{list("topObjections", "objection", "What makes prospects hesitate", "One per line")}</SettingRow>
        <SettingRow label="Brand voice">
          {saved(
            "extra.brandVoice",
            extras.brandVoice ? `${extras.brandVoice.trim().split(/\s+/).length.toLocaleString()} words on file` : null,
            "none yet",
            "How the brand sounds",
            <TextEditor multiline initial={extras.brandVoice} placeholder={`Copy that sounds like ${data.buyer}`} onSave={(v) => (setExtra("brandVoice", v), close())} />,
            440
          )}
        </SettingRow>
      </SettingsGroup>

      {eventTypes.length > 0 && (
        <SettingsGroup title="Bookings">
          <SettingRow label="Sales call event">
            <FactToken
              {...tokenProps("salesCall")}
              display={salesCall?.name ?? null}
              placeholder="which event?"
              tier={tierOf("salesCall", data.accountRead.salesCall ? ({ tier: data.accountRead.salesCall.tier } as SetupValue) : undefined)}
              title="Which event is the sales call?"
              source={data.accountRead.salesCall?.evidence ?? "Pick the event prospects book before they buy."}
              width={340}
            >
              <ChoiceList
                options={eventTypes.map((e) => ({ value: e.id, label: e.name, hint: e.durationMin ? `${e.durationMin} min` : undefined }))}
                value={draft.salesCallEventId}
                onPick={(id) => (setSalesCall(id), close())}
              />
            </FactToken>
          </SettingRow>
        </SettingsGroup>
      )}

      <SettingsGroup title="Tools" hint="Tap a logo to connect, switch or disconnect.">
        <div className="py-3">{toolRows}</div>
      </SettingsGroup>
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

/** The confirmation page, previewed on demand from the Show Rate Setup line
 * rather than taking up the page: a small thumbnail button that opens it. */
function PagePreview({
  open,
  onOpenChange,
  buyer,
  offer,
  designSignal,
  template,
  domain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: string;
  offer: Draft["offer"];
  designSignal: unknown;
  template: string;
  domain: string;
}) {
  return (
    <AnchoredCard
      open={open}
      onOpenChange={onOpenChange}
      label="Confirmation page preview"
      width={340}
      anchor={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex items-center gap-1.5 align-baseline text-[13px] font-medium text-[var(--text-primary)] underline decoration-dashed decoration-[var(--text-muted)] underline-offset-4 hover:decoration-[var(--text-primary)] cursor-pointer"
        >
          <Eye className="h-3.5 w-3.5 self-center" /> Preview the page
        </button>
      )}
    >
      <div className="space-y-2.5 p-4">
        <ConfirmationPreview
          width={308}
          buyer={buyer}
          offerName={offer.offerName}
          offerPrice={offer.offerPrice}
          offerIcp={offer.offerIcp}
          trafficTemperature={offer.trafficTemperature}
          heroVideoUrl={offer.heroVideoUrl}
          designSignal={designSignal}
          template={template}
        />
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          {designSignal ? `In ${domain}'s colors and fonts. ` : ""}Built from what&apos;s above. Nothing is published until you save.
        </p>
      </div>
    </AnchoredCard>
  );
}

/** A count in a sentence ("3 testimonials") that opens the list it counts. */
function SiteListToken({
  tokenKey,
  tokenProps,
  label,
  title,
  source,
  items,
  tier = "done",
}: {
  tokenKey: string;
  tokenProps: TokenProps;
  label: string;
  title: string;
  source: string;
  items: { primary: string; secondary?: string }[];
  tier?: TrustTier;
}) {
  return (
    <FactToken {...tokenProps(tokenKey)} display={label} placeholder={label} tier={tier} title={title} source={source} width={380}>
      <ul className="-mx-1 max-h-80 space-y-2.5 overflow-y-auto px-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <p className="text-[var(--text-primary)]">{item.primary}</p>
            {item.secondary && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.secondary}</p>}
          </li>
        ))}
      </ul>
    </FactToken>
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
 * would still stop on for the skills that are switched on, in the words
 * of this screen. A skill that's off asks for nothing. */
function findBlockers(data: ShowtimeSetupState, d: Draft, needs: CombinedNeeds): Blocker[] {
  const out: Blocker[] = [];
  if (needs.offer) {
    if (!d.offer.trafficTemperature) out.push({ key: "temp", label: "How warm leads are", openKey: "offer.trafficTemperature" });
    if (!d.offer.offerName) out.push({ key: "offer", label: "What they sell", openKey: "offer.offerName" });
    if (!d.offer.offerPrice) out.push({ key: "price", label: "The price", openKey: "offer.offerPrice" });
    if (!d.offer.offerIcp) out.push({ key: "icp", label: "Who it's for", openKey: "offer.offerIcp" });
    if (!d.offer.offerVertical) out.push({ key: "vertical", label: "The industry", openKey: "offer.offerVertical" });
  }
  const linked = (g: ToolGroupId) => {
    const p = d.platforms[g];
    if (!p) return false;
    const tool = findShowtimeTool(p, g);
    if (tool && !tool.needsKey) return true;
    // Hosting on a site builder without a publish API needs nothing more.
    if (g === "hosting" && !["webflow", "wordpress", "nextjs_vercel"].includes(p)) return true;
    return Boolean(data.tools.find((t) => t.provider === p && t.group === g)?.linked);
  };
  const GROUP_LABEL: Record<ToolGroupId, string> = { booking: "A booking tool", email: "An email tool", hosting: "Where the page is hosted" };
  for (const g of GROUPS) if (needs.groups.has(g) && !linked(g)) out.push({ key: g, label: GROUP_LABEL[g], group: g });
  if (needs.choices.has("briefLandingDestination")) {
    if (!d.choices.briefLandingDestination) out.push({ key: "brief", label: "Where briefs land", openKey: "choice.briefLandingDestination" });
    else if (d.choices.briefLandingDestination === "slack" && !d.slackWebhookUrl.trim())
      out.push({ key: "slack", label: "The Slack webhook", openKey: "choice.briefLandingDestination" });
  }
  return out;
}

function SaveBar({
  blockers,
  skillCount,
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
  skillCount: number;
  configured: boolean;
  saving: boolean;
  canSave: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onBlocker: (b: Blocker) => void;
}) {
  const ready = blockers.length === 0 && (skillCount > 0 || configured);
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
              {skillCount === 0 ? "Every Showtime skill will be off for this client." : "Everything's set. Check anything above, then save."}
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
            {configured ? "Save changes" : skillCount > 1 ? `Turn on ${skillCount} skills` : "Turn it on"}
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

