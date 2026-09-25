"use client";

// src/components/product-setup/whop-setup.tsx
//
// Whop Agent's setup, one page, the same shape as the other products':
//   welcome   the Whop key (a connected client isn't asked again) and
//             which workers to run
//   working   "Set it up" streams its real steps
//   review    the business at a glance, "What we did" (what was read and
//             the levels set from it, each with Change), "Left to do" (the
//             save offer and bridge, never guessed), and Approve, which
//             writes the settings and the one webhook the workers need.
//             Nothing else is written to Whop.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { PlatformLogo } from "@/components/platform-logo";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { WhopSetupState } from "@/lib/whop-setup/types";
import { SKILL_EVENTS, eventsFor } from "@/lib/whop-setup/analyze";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { SkillSwitchRow } from "./skill-switch";
import { ApproveBar, Feed, Labeled, Pill, Popover, ReviewCard, SettingsHeader, Todos, ToggleList, inputCls, pick, type FeedEntry, type TodoItem } from "./review-kit";
import { anySkillDisplayName } from "@/lib/any-skill";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";

// ── Workers ────────────────────────────────────────────────────────────

const ON_THEIR_OWN: { id: string; blurb: string }[] = [
  { id: "whop-cancellation-save-offer", blurb: "Drafts your save offer for each member who sets their plan to cancel. You approve every one." },
  { id: "whop-dispute-response", blurb: "Gathers evidence and drafts a response the moment a dispute or dispute alert arrives." },
  { id: "whop-refund-dispute-velocity", blurb: "Warns you when refunds, disputes or dispute alerts jump above normal." },
  { id: "whop-daily-change-digest", blurb: "A daily summary of what changed on your Whop: prices, visibility, statuses." },
  { id: "whop-weekly-ops-report", blurb: "Revenue, MRR, churn and new members, every Monday." },
  { id: "whop-attribution-report", blurb: "Which promo codes and affiliates bring members in." },
  { id: "whop-drift-monitor", blurb: "Spots when Whop quietly changes how plans and payouts look in its API." },
  { id: "whop-bridge-manager", blurb: "Sends Whop events on to another tool, such as your CRM." },
  { id: "whop-portfolio-rollup", blurb: "Your numbers side by side with your other Whop businesses here." },
];
const WHEN_ASKED: { id: string; blurb: string }[] = [
  { id: "whop-product-launch-preflight", blurb: "Checks a new product against Whop's limits, then creates it hidden." },
  { id: "whop-bulk-promo-codes", blurb: "Creates many promo codes at once, previewed first." },
  { id: "whop-purchase-cap-copilot", blurb: "Puts together your application to raise Whop's purchase cap." },
  { id: "whop-payout-hold-kit", blurb: "Puts together your evidence the moment a payout hold looks likely." },
  { id: "whop-ads-draft-approve", blurb: "Drafts Whop Ads campaigns. Going live is a separate, confirmed step." },
];
const ALL_SKILLS = [...ON_THEIR_OWN, ...WHEN_ASKED].map((s) => s.id);

/** What each skill's own settings show: the review rows (and "Left to do"
 * steps) it owns. A skill not listed has nothing of its own to set. */
const WHOP_FOCUS: Record<string, { rows: string[]; todos: string[]; save: boolean }> = {
  "whop-connect": { rows: ["breaker", "plans", "lock-", "events", "hook-"], todos: ["key", "version"], save: false },
  "whop-cancellation-save-offer": { rows: ["canceling", "offer"], todos: ["offer"], save: true },
  "whop-refund-dispute-velocity": { rows: ["alerts"], todos: [], save: true },
  "whop-bridge-manager": { rows: ["bridge"], todos: ["bridge"], save: true },
};
const NOTHING_TO_SET = { rows: ["breaker", "lock-"], todos: ["key"], save: false };

const STAGES: ActivationStage[] = [
  { label: "Connecting", prefix: "" },
  { label: "Reading your business", prefix: "read-" },
  { label: "Checking webhooks", prefix: "hooks" },
];

// ── Draft ──────────────────────────────────────────────────────────────

interface Draft {
  apiKey: string;
  discount: string;
  months: string;
  message: string;
  tenure: string;
  cooldown: string;
  refundPct: string;
  disputePct: string;
  alerts: string;
  sample: string;
  bridgeUrl: string;
}

function draftFrom(s: WhopSetupState): Draft {
  const str = (v: number | null) => (v == null ? "" : String(v));
  return {
    apiKey: "",
    discount: str(s.saveOffer.discount),
    months: str(s.saveOffer.months),
    message: s.saveOffer.message,
    tenure: str(s.saveOffer.minTenureDays),
    cooldown: str(s.saveOffer.cooldownDays),
    refundPct: String(Math.round(s.alerts.refundRate * 1000) / 10),
    disputePct: String(Math.round(s.alerts.disputeRate * 10000) / 100),
    alerts: String(s.alerts.alertThreshold),
    sample: String(s.alerts.minSample),
    bridgeUrl: s.bridge.url,
  };
}

const money = (v: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${Math.round(v).toLocaleString()} ${currency.toUpperCase()}`;
  }
};
const pct = (x: number | null) => (x == null ? null : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);

// ── Component ──────────────────────────────────────────────────────────

export function WhopSetup({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Cancel",
  focus,
  backHref,
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
  /** Opens as this one skill's own settings once Whop Agent is set up:
   * only the rows it owns, saved without touching which workers are on. */
  focus?: string;
  /** Whop Agent carries its own heading, so the page that hosts it (see
   * setup-page-client.tsx) has nothing of its own to put beside the way
   * back — it hands us the href instead, and we put the back button on
   * the same line as our own mark and title. */
  backHref?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [data, setData] = useState<WhopSetupState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"welcome" | "working" | "review">("welcome");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [steps, setSteps] = useState<ActivationStep[]>([]);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { initial?: boolean } = {}) => {
      const res = await fetch(`/api/engagements/${engagementId}/setup/whop`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't load Whop Agent's setup.");
      const next = body as WhopSetupState;
      setData(next);
      setDraft(draftFrom(next));
      if (opts.initial) {
        setPhase(next.configured ? "review" : "welcome");
        setSkills(ALL_SKILLS.filter((id) => next.skills[id] !== false));
      }
      return next;
    },
    [engagementId]
  );

  useEffect(() => {
    void (async () => {
      try {
        await load({ initial: true });
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load Whop Agent's setup.");
      }
    })();
  }, [load]);

  const set = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));

  async function activate() {
    if (!draft) return;
    setPhase("working");
    setSteps([]);
    setActivateError(null);
    setTimeout(() => document.getElementById("whop-progress")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/whop/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: draft.apiKey.trim() || undefined }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't start the setup.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed = false;
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
          if (msg.type === "error") {
            failed = true;
            setActivateError(msg.error ?? "Something went wrong.");
          }
        }
      }
      if (failed) return;
      await load();
      await new Promise((r) => setTimeout(r, 700));
      setPhase("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const offerParts = draft ? [draft.discount.trim(), draft.months.trim(), draft.message.trim()] : [];
  const offerProblem = offerParts.some(Boolean) && !offerParts.every(Boolean) ? "Fill in the discount, length and message for the save offer, or leave all three empty." : null;
  const events = useMemo(() => {
    if (!draft) return [];
    const usable = skills.filter((s) => (s !== "whop-cancellation-save-offer" || offerParts.every(Boolean)) && (s !== "whop-bridge-manager" || draft.bridgeUrl.trim()));
    return eventsFor(usable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, draft]);

  const settings = Boolean(focus && data?.configured);
  const dirty = useMemo(() => (data && draft ? JSON.stringify({ ...draft, apiKey: "" }) !== JSON.stringify(draftFrom(data)) : false), [data, draft]);

  async function save() {
    if (!data || !draft || offerProblem) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      skills,
      saveOffer: offerParts.every(Boolean) ? { discount: draft.discount, months: draft.months, message: draft.message, minTenureDays: draft.tenure, cooldownDays: draft.cooldown } : null,
      alerts: { refundRate: Number(draft.refundPct) / 100, disputeRate: Number(draft.disputePct) / 100, alertThreshold: Number(draft.alerts), minSample: Number(draft.sample) },
      bridgeUrl: draft.bridgeUrl,
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/whop/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      const hook = json.webhook as { action?: string; error?: string } | undefined;
      if (hook?.error) toast.error(`Settings saved, but Whop didn't accept the webhook: ${hook.error}`);
      // A skill's own settings panel says it saved; elsewhere, say so here.
      else if (!settings || !onSaved) toast.success(hook?.action === "created" ? "Saved. Whop will now send events to Whop Agent." : "Saved.");
      await load().catch(() => undefined);
      if (onSaved) onSaved({});
      else router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function queueFix(body: { action: "dedupe"; groupKey: string } | { action: "pin"; whopWebhookId: string }): Promise<void> {
    const res = await fetch(`/api/engagements/${engagementId}/whop-agent/webhooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) toast.success("Sent to your approval queue.");
    else toast.error(json.error ?? "Couldn't queue that.");
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

  const toggleSkill = (id: string, v: boolean) => setSkills((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)));

  return (
    <div className="@container w-full px-1 pb-4">
      {phase === "review" ? (
        <>
          <Review
            data={data}
            draft={draft}
            set={set}
            skills={skills}
            toggleSkill={toggleSkill}
            events={events}
            onReread={() => setPhase("welcome")}
            onQueueFix={queueFix}
            focus={settings ? focus : undefined}
            backHref={backHref}
            fullSetupHref={`/dashboard/engagements/${engagementId}/bridges/whop-connect?from=${encodeURIComponent(pathname)}`}
          />
          {settings ? (
            (WHOP_FOCUS[focus!] ?? NOTHING_TO_SET).save && (
              <ApproveBar label="Save" error={saveError ?? offerProblem} saving={saving} disabled={!dirty || Boolean(offerProblem)} onApprove={save} onCancel={onCancel} cancelLabel={cancelLabel} />
            )
          ) : (
            <ApproveBar
              note={events.length ? "Approve sets up the one webhook these workers need on your Whop. Nothing else is written to Whop." : "Nothing is written to Whop."}
              error={saveError ?? offerProblem}
              saving={saving}
              disabled={Boolean(offerProblem)}
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
          set={set}
          skills={skills}
          toggleSkill={toggleSkill}
          working={phase === "working"}
          steps={steps}
          activateError={activateError}
          onActivate={activate}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          onBackToReview={data.configured ? () => setPhase("review") : undefined}
          backHref={backHref}
        />
      )}
    </div>
  );
}

// ── Welcome ────────────────────────────────────────────────────────────

function WhopMark({ size = 44 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-elevation-1 ring-1 ring-black/5 dark:ring-white/10" style={{ width: size, height: size }}>
      <PlatformLogo provider="whop" size={Math.round(size * 0.6)} />
    </span>
  );
}

function Welcome({
  data,
  draft,
  set,
  skills,
  toggleSkill,
  working,
  steps,
  activateError,
  onActivate,
  onCancel,
  cancelLabel,
  onBackToReview,
  backHref,
}: {
  data: WhopSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  toggleSkill: (id: string, v: boolean) => void;
  working: boolean;
  steps: ActivationStep[];
  activateError: string | null;
  onActivate: () => void;
  onCancel: () => void;
  cancelLabel: string;
  onBackToReview?: () => void;
  backHref?: string;
}) {
  const [replacing, setReplacing] = useState(false);
  const connected = data.connection.connected && !replacing;
  const ready = connected || draft.apiKey.trim().length > 0;
  return (
    <div className="space-y-9">
      <header className="space-y-3">
        <div className="flex items-center gap-4">
          {backHref && <BackButton href={backHref} />}
          <WhopMark />
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[30px]">Whop Agent for {data.buyer}</h1>
        </div>
        <p className="max-w-xl text-[15px] leading-relaxed">
          We read your Whop business, from plans and members to refunds, disputes and reviews, then set your workers up from what we find. Anything that touches your members or money waits for your approval.
        </p>
      </header>

      <section className={cn("space-y-2.5 transition-opacity", working && "pointer-events-none opacity-60")}>
        {connected ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-foreground)]">
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </span>
            <span className="text-sm text-[var(--text-primary)]">
              Whop is connected{data.connection.accountId ? ` (${data.connection.accountId})` : ""}. Nothing to redo.
            </span>
            <button type="button" onClick={() => setReplacing(true)} className="ml-auto text-[13px] text-[var(--text-muted)] underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
              Use a different key
            </button>
          </div>
        ) : (
          <>
            <label htmlFor="whop-key" className="flex items-baseline gap-2 text-sm font-medium text-[var(--text-primary)]">
              Your Whop API key
              <span className="text-xs font-normal text-[var(--text-muted)]">From the developer settings in your Whop dashboard</span>
            </label>
            <input
              id="whop-key"
              type="password"
              value={draft.apiKey}
              onChange={(e) => set((d) => ({ ...d, apiKey: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && ready && onActivate()}
              placeholder="apik_..."
              autoComplete="off"
              spellCheck={false}
              className="h-14 w-full border border-[var(--text-muted)]/40 bg-background px-4 font-mono text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)] dark:border-white/15"
            />
          </>
        )}
      </section>

      <section className={cn("transition-opacity", working && "pointer-events-none opacity-60")}>
        <h2 className="text-sm font-medium text-[var(--text-primary)]">What should Whop Agent do?</h2>
        <SkillList skills={skills} toggleSkill={toggleSkill} />
      </section>

      <section>
        <AnimatePresence mode="wait" initial={false}>
          {working ? (
            <motion.div key="progress" id="whop-progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <ActivationProgress stages={STAGES} steps={steps} working={!activateError} host={data.connection.accountId ?? "whop.com"} error={activateError} onRetry={onActivate} />
            </motion.div>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
              <Button size="lg" className="h-11 px-5 text-[15px]" onClick={onActivate} disabled={!ready}>
                Set it up <ArrowUpRight />
              </Button>
              <p className="text-[13px] text-[var(--text-muted)]">{ready ? "About a minute. We only read." : "Paste your key to start."}</p>
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

function SkillList({ skills, toggleSkill }: { skills: string[]; toggleSkill: (id: string, v: boolean) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Runs on its own</p>
        <ul className="divide-y">
          {ON_THEIR_OWN.map((s) => (
            <SkillSwitchRow key={s.id} skillId={s.id} blurb={s.blurb} on={skills.includes(s.id)} onChange={(v) => toggleSkill(s.id, v)} />
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">When you ask</p>
        <ul className="divide-y">
          {WHEN_ASKED.map((s) => (
            <SkillSwitchRow key={s.id} skillId={s.id} blurb={s.blurb} on={skills.includes(s.id)} onChange={(v) => toggleSkill(s.id, v)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Review ─────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function Review({
  data,
  draft,
  set,
  skills,
  toggleSkill,
  events,
  onReread,
  onQueueFix,
  focus,
  backHref,
  fullSetupHref,
}: {
  data: WhopSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  toggleSkill: (id: string, v: boolean) => void;
  events: string[];
  onReread: () => void;
  onQueueFix: (body: { action: "dedupe"; groupKey: string } | { action: "pin"; whopWebhookId: string }) => Promise<void>;
  focus?: string;
  backHref?: string;
  fullSetupHref: string;
}) {
  const s = data.snapshot;
  const read = data.read;
  const found = draftFrom(data);
  const readOn = read
    ? new Date(read.readAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const fromWhop = readOn ? `Your Whop, read ${readOn}` : "Your Whop";

  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (s?.mrr)
    stats.push({
      value: money(s.mrr.value, s.mrr.currency),
      label: s.mrr.source === "plans" ? "a month, from plans" : "MRR",
    });
  if (s?.members != null) stats.push({ value: s.members.toLocaleString(), label: "members" });
  if (s?.canceling)
    stats.push({
      value: `${s.canceling.count}${s.canceling.more ? "+" : ""}`,
      label: "set to cancel",
      warn: s.canceling.count > 0,
    });
  if (s?.disputeRate != null)
    stats.push({
      value: pct(s.disputeRate)!,
      label: "disputed, 90 days",
      warn: s.disputeRate >= 0.01,
    });
  else if (s?.newMembers30d)
    stats.push({
      value: `${s.newMembers30d.count}${s.newMembers30d.more ? "+" : ""}`,
      label: "new this month",
    });

  // A skill's own settings show its rows even while it is switched off.
  const on = (id: string) => skills.includes(id) || focus === id;
  const offer = {
    discount: draft.discount.trim(),
    months: draft.months.trim(),
    message: draft.message.trim(),
  };
  const offerSet = Boolean(offer.discount && offer.months && offer.message);
  // Events another worker added to the same webhook stay on it; only the
  // setup's own are compared.
  const setupEvents = new Set(Object.values(SKILL_EVENTS).flat());
  const current = data.webhook.current ? [...data.webhook.current].filter((e) => setupEvents.has(e)).sort() : null;
  const sameEvents = current && current.length === events.length && current.every((e, i) => e === events[i]);

  const feed: FeedEntry[] = [];
  if (data.connection.breakerOpen)
    feed.push({
      key: "breaker",
      warn: true,
      text: (
        <>
          Whop has been refusing this key, so Whop Agent has <b>paused</b>.
        </>
      ),
      action: { label: "Change key", onClick: onReread },
    });

  if (read) {
    const plans = [...read.plans].filter((p) => p.memberCount).sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0));
    const top = plans[0];
    feed.push({
      key: "plans",
      text: (
        <>
          Read <b>{plural(read.plans.length, "plan")}</b> across <b>{plural(read.products.length, "product")}</b>
          {top ? (
            <>
              . The biggest is <b>{top.title ?? top.productTitle ?? top.id}</b> with {plural(top.memberCount ?? 0, "member")}
              {top.formattedPrice ? ` at ${top.formattedPrice}` : ""}.
            </>
          ) : (
            "."
          )}
        </>
      ),
      source: fromWhop,
    });
    if (read.canceling && read.canceling.count > 0) {
      const reasons = [...new Set(read.canceling.reasons.map((r) => r.toLowerCase()))].slice(0, 2);
      feed.push({
        key: "canceling",
        text: (
          <>
            <b>
              {plural(read.canceling.count, "member")}
              {read.canceling.more ? "+" : ""}
            </b>{" "}
            set to cancel
            {reasons.length ? (
              <>
                , most often saying &ldquo;{reasons.join("\u201d and \u201c")}
                &rdquo;
              </>
            ) : (
              ""
            )}
            .
          </>
        ),
        source: fromWhop,
      });
    }
    const rated = read.products.filter((p) => p.rating != null && p.reviews).sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
    const low = read.reviews.filter((r) => r.stars <= 2);
    if (rated.length || low.length) {
      feed.push({
        key: "reviews",
        text: (
          <>
            {rated[0] ? (
              <>
                <b>{rated[0].title}</b> is rated <b>{rated[0].rating!.toFixed(1)}★</b> from {plural(rated[0].reviews ?? 0, "review")}
              </>
            ) : (
              "Read your reviews"
            )}
            {low.length ? (
              <>
                , with <b>{plural(low.length, "low review")}</b> recently
              </>
            ) : (
              ""
            )}
            .
          </>
        ),
        source: fromWhop,
      });
    }
    const code = read.promoCodes?.[0];
    const aff = read.affiliates?.[0];
    if ((code && code.uses) || (aff && aff.referrals)) {
      feed.push({
        key: "growth",
        text: (
          <>
            {code && code.uses ? (
              <>
                Your most-used code is <b className="font-mono">{code.code ?? "(no code)"}</b> ({plural(code.uses, "use")})
              </>
            ) : null}
            {code && code.uses && aff && aff.referrals ? "; " : ""}
            {aff && aff.referrals ? (
              <>
                your top affiliate is <b>{aff.name ?? "unnamed"}</b> ({plural(aff.referrals, "referral")})
              </>
            ) : null}
            .
          </>
        ),
        source: fromWhop,
      });
    }
  }

  // Where a row lives follows what was found, not what is being typed, so
  // an editor stays open while someone fills it in.
  const offerFound = Boolean(found.discount && found.months && found.message.trim());
  const bridgeFound = Boolean(found.bridgeUrl.trim());
  if (on("whop-cancellation-save-offer") && offerFound && offerSet) {
    feed.push({
      key: "offer",
      text: (
        <>
          Save offer:{" "}
          <b>
            {offer.discount}% off for {plural(Number(offer.months) || 0, "month")}
          </b>{" "}
          to members who set their plan to cancel. You approve every one.
        </>
      ),
      source: data.saveOffer.source ? `From ${data.saveOffer.source}` : undefined,
      editor: (close) => <OfferEditor draft={draft} set={set} close={close} />,
      undo:
        draft.discount !== found.discount || draft.months !== found.months || draft.message !== found.message
          ? () =>
              set((d) => ({
                ...d,
                discount: found.discount,
                months: found.months,
                message: found.message,
                tenure: found.tenure,
                cooldown: found.cooldown,
              }))
          : undefined,
    });
  }

  if (on("whop-refund-dispute-velocity")) {
    const changed = (["refundPct", "disputePct", "alerts", "sample"] as const).some((k) => draft[k] !== found[k]);
    feed.push({
      key: "alerts",
      text: (
        <>
          Warn you when a week&apos;s refunds pass <b>{draft.refundPct}%</b> of payments, disputes pass <b>{draft.disputePct}%</b>, or <b>{draft.alerts}</b> dispute alerts arrive.
        </>
      ),
      source: changed ? "Changed by you" : data.alerts.saved ? "Your saved levels" : data.alerts.fromData ? `Set from your last 90 days. ${data.alerts.why.refund}` : data.alerts.why.refund,
      editor: (close) => <AlertsEditor data={data} draft={draft} set={set} close={close} />,
      undo: changed
        ? () =>
            set((d) => ({
              ...d,
              refundPct: found.refundPct,
              disputePct: found.disputePct,
              alerts: found.alerts,
              sample: found.sample,
            }))
        : undefined,
    });
  }

  if (on("whop-bridge-manager") && bridgeFound && draft.bridgeUrl.trim()) {
    feed.push({
      key: "bridge",
      text: (
        <>
          Forward Whop events to <b className="break-all">{draft.bridgeUrl.trim()}</b>.
        </>
      ),
      editor: (close) => <BridgeEditor data={data} draft={draft} set={set} close={close} />,
      body:
        data.bridge.signingSecret && draft.bridgeUrl === data.bridge.url ? (
          <div className="space-y-1">
            <p className="text-[12px] text-[var(--text-muted)]">Signing secret. Your receiver can check each event&apos;s X-Whop-Agent-Signature header with it.</p>
            <code className="block break-all rounded-lg bg-black/[0.03] px-2 py-1.5 font-mono text-[12px] text-[var(--text-primary)] dark:bg-white/[0.05]">{data.bridge.signingSecret}</code>
          </div>
        ) : undefined,
    });
  }

  if (events.length) {
    feed.push({
      key: "events",
      text: (
        <>
          {!current ? "Whop will send" : sameEvents ? "Your Whop Agent webhook already sends" : "Your Whop Agent webhook will be updated to send"} <b>{plural(events.length, "event")}</b> the workers
          need.
        </>
      ),
      body: (
        <div className="flex flex-wrap gap-1.5">
          {events.map((e) => (
            <span key={e} className="rounded-full px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)] ring-1 ring-inset ring-black/10 dark:ring-white/10">
              {e}
            </span>
          ))}
        </div>
      ),
    });
  }

  data.webhook.problems.forEach((p, i) =>
    feed.push({
      key: `hook-${i}`,
      warn: true,
      text: p.detail,
      source: p.kind === "failing" ? undefined : "Nothing changes until you approve it in your queue.",
      action:
        p.kind === "duplicate" && p.groupKey
          ? {
              label: "Clean up",
              onClick: () => void onQueueFix({ action: "dedupe", groupKey: p.groupKey! }),
            }
          : p.kind === "unpinned" && p.whopWebhookId
            ? {
                label: "Pin it",
                onClick: () =>
                  void onQueueFix({
                    action: "pin",
                    whopWebhookId: p.whopWebhookId!,
                  }),
              }
            : undefined,
    }),
  );

  data.connection.locked.forEach((l) =>
    feed.push({
      key: `lock-${l.label}`,
      warn: true,
      text: (
        <>
          Your key can&apos;t reach <b>{l.label}</b>.
        </>
      ),
      source: `Held back: ${l.locks.replace(/\.$/, "")}. Give the key this permission in Whop, then read again.`,
    }),
  );

  feed.push({
    key: "workers",
    text: (
      <>
        <b>
          {skills.length} of {ALL_SKILLS.length}
        </b>{" "}
        workers are on.
      </>
    ),
    editLabel: "Change",
    editor: () => (
      <div className="space-y-2">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">Workers</p>
        <ToggleList
          items={ALL_SKILLS.map((id) => ({
            label: anySkillDisplayName(id),
            hint: [...ON_THEIR_OWN, ...WHEN_ASKED].find((x) => x.id === id)?.blurb,
            on: skills.includes(id),
          }))}
          onToggle={(i) => toggleSkill(ALL_SKILLS[i], !skills.includes(ALL_SKILLS[i]))}
        />
      </div>
    ),
  });

  const todos: TodoItem[] = [];
  if (data.connection.breakerOpen)
    todos.push({
      key: "key",
      label: "Paste a working Whop key",
      done: false,
      action: <TodoButton onClick={onReread}>Change key</TodoButton>,
    });
  if (events.length && !data.connection.pinnedVersionDate)
    todos.push({
      key: "version",
      label: "Read again so we can check Whop's API version before setting up the webhook",
      done: false,
      action: <TodoButton onClick={onReread}>Read again</TodoButton>,
    });
  if (on("whop-cancellation-save-offer") && (!offerFound || !offerSet))
    todos.push({
      key: "offer",
      label: offerSet ? `Save offer: ${offer.discount}% off for ${offer.months} ${offer.months === "1" ? "month" : "months"}` : "Choose a save offer. Without one, no offer is made; we never pick a discount for you.",
      done: offerSet,
      optional: true,
      action: (
        <Popover label={offerSet ? "Change" : "Add"} title="Save offer" strong={!offerSet}>
          {(close) => <OfferEditor draft={draft} set={set} close={close} />}
        </Popover>
      ),
    });
  if (on("whop-bridge-manager") && (!bridgeFound || !draft.bridgeUrl.trim()))
    todos.push({
      key: "bridge",
      label: draft.bridgeUrl.trim() ? `Forward Whop events to ${draft.bridgeUrl.trim()}` : data.bridge.ghlConnected
        ? "Where to forward Whop events. GoHighLevel is connected; paste an inbound webhook address from one of its workflows."
        : "Where to forward Whop events, such as your CRM",
      done: Boolean(draft.bridgeUrl.trim()),
      optional: true,
      action: (
        <Popover label={draft.bridgeUrl.trim() ? "Change" : "Add"} title="Forward events to" strong={!draft.bridgeUrl.trim()}>
          {(close) => <BridgeEditor data={data} draft={draft} set={set} close={close} />}
        </Popover>
      ),
    });

  if (focus) {
    const f = WHOP_FOCUS[focus] ?? NOTHING_TO_SET;
    const rows = pick(feed, f.rows);
    const steps = pick(todos, f.todos);
    const blurb = [...ON_THEIR_OWN, ...WHEN_ASKED].find((x) => x.id === focus)?.blurb;
    return (
      <div className="space-y-6">
        <SettingsHeader
          mark={<WhopMark size={36} />}
          name={anySkillDisplayName(focus)}
          buyer={data.buyer}
          fullSetupHref={fullSetupHref}
          leading={backHref && <BackButton href={backHref} />}
        />
        {blurb && (
          <p className="px-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {blurb}
            {WHOP_FOCUS[focus] ? "" : " There's nothing to set: it runs on your Whop connection."}
          </p>
        )}
        {rows.length > 0 && <Feed entries={rows} title={focus === "whop-connect" ? "Your connection" : "Settings"} />}
        {steps.length > 0 && <Todos items={steps} />}
      </div>
    );
  }

  return (
    <div className="space-y-9">
      <ReviewCard
        mark={<WhopMark />}
        leading={backHref && <BackButton href={backHref} />}
        eyebrow="Whop Agent"
        title={`${data.buyer} on Whop`}
        pills={
          <>
            {data.connection.accountId && <Pill>{data.connection.accountId}</Pill>}
            <Pill tone={data.connection.breakerOpen ? "off" : "on"}>{data.connection.breakerOpen ? "Paused" : "Connected"}</Pill>
            {readOn && <Pill>Read {readOn}</Pill>}
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
      </ReviewCard>
      <Feed entries={feed} onReread={onReread} />
      <Todos items={todos} />
    </div>
  );
}

function TodoButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 text-[13px] font-medium text-[var(--text-primary)] underline underline-offset-4 cursor-pointer">
      {children}
    </button>
  );
}

// ── Editors ────────────────────────────────────────────────────────────

const numberInput = (value: string, onChange: (v: string) => void, label: string, placeholder?: string) => (
  <input aria-label={label} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} className={`${inputCls} h-9 tabular-nums`} />
);

function EditorFoot({ close, onClear }: { close: () => void; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between pt-1">
      {onClear ? (
        <button type="button" onClick={onClear} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
          Remove
        </button>
      ) : (
        <span />
      )}
      <button type="button" onClick={close} className="h-8 rounded-lg bg-[var(--ink)] px-3 text-[13px] font-medium text-[var(--ink-foreground)] cursor-pointer">
        Done
      </button>
    </div>
  );
}

function OfferEditor({ draft, set, close }: { draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void }) {
  const up = (k: keyof Draft) => (v: string) => set((d) => ({ ...d, [k]: v }));
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--text-secondary)]">Offered to each member who sets their plan to cancel. You approve every one.</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="% off">{numberInput(draft.discount, up("discount"), "Discount percent", "e.g. 30")}</Labeled>
        <Labeled label="For how many months">{numberInput(draft.months, up("months"), "Months", "e.g. 2")}</Labeled>
      </div>
      <Labeled label="What members see">
        <textarea
          aria-label="Message"
          rows={3}
          value={draft.message}
          onChange={(e) => set((d) => ({ ...d, message: e.target.value }))}
          placeholder="You can use {discount} and {months}."
          className={`${inputCls} resize-y py-2 leading-relaxed`}
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Members of at least (days)">{numberInput(draft.tenure, up("tenure"), "Minimum days as a member", "30")}</Labeled>
        <Labeled label="At most once every (days)">{numberInput(draft.cooldown, up("cooldown"), "Days between offers", "90")}</Labeled>
      </div>
      <EditorFoot close={close} onClear={draft.discount || draft.months || draft.message ? () => set((d) => ({ ...d, discount: "", months: "", message: "" })) : undefined} />
    </div>
  );
}

function AlertsEditor({ data, draft, set, close }: { data: WhopSetupState; draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void }) {
  const up = (k: keyof Draft) => (v: string) => set((d) => ({ ...d, [k]: v }));
  const rows: { k: keyof Draft; label: string; why: string }[] = [
    {
      k: "refundPct",
      label: "Refunds, % of a week's payments",
      why: data.alerts.why.refund,
    },
    {
      k: "disputePct",
      label: "Disputes, % of a week's payments",
      why: data.alerts.why.dispute,
    },
    {
      k: "alerts",
      label: "Dispute alerts in a week",
      why: data.alerts.why.alerts,
    },
    {
      k: "sample",
      label: "Payments in a week before a rate counts",
      why: data.alerts.why.sample,
    },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.k} className="space-y-1">
          <Labeled label={r.label}>{numberInput(draft[r.k], up(r.k), r.label)}</Labeled>
          <p className="text-[11px] leading-snug text-[var(--text-muted)]">{r.why}</p>
        </div>
      ))}
      <EditorFoot close={close} />
    </div>
  );
}

function BridgeEditor({ data, draft, set, close }: { data: WhopSetupState; draft: Draft; set: (fn: (d: Draft) => Draft) => void; close: () => void }) {
  return (
    <div className="space-y-3">
      <Labeled label="Send Whop events to">
        <input
          aria-label="Bridge address"
          value={draft.bridgeUrl}
          onChange={(e) => set((d) => ({ ...d, bridgeUrl: e.target.value }))}
          placeholder="https://..."
          spellCheck={false}
          className={`${inputCls} h-9`}
        />
      </Labeled>
      {data.bridge.ghlConnected && <p className="text-[12px] text-[var(--text-muted)]">GoHighLevel is connected for {data.buyer}. An inbound webhook address from one of its workflows works here.</p>}
      <EditorFoot close={close} onClear={draft.bridgeUrl ? () => set((d) => ({ ...d, bridgeUrl: "" })) : undefined} />
    </div>
  );
}
