"use client";

// src/components/product-setup/whop-setup.tsx
//
// Whop Agent's setup, one page, the same shape as the other products':
//   welcome   the Whop key (a connected client isn't asked again) and
//             which workers to run
//   working   "Set it up" streams its real steps
//   review    the business at a glance, then the save offer, alert levels,
//             bridge and the one webhook the workers need. Save writes the
//             settings and that webhook; nothing else is written to Whop.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { PlatformLogo } from "@/components/platform-logo";
import type { ActivationStep } from "@/lib/showtime-setup/types";
import type { WhopSetupState } from "@/lib/whop-setup/types";
import { eventsFor } from "@/lib/whop-setup/analyze";
import { ActivationProgress, type ActivationStage } from "./activation-steps";
import { SkillSwitchRow } from "./skill-switch";
import { cn } from "@/lib/utils";

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
  ratePct: string;
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
    ratePct: String(Math.round(s.alerts.rateThreshold * 1000) / 10),
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
}: {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
}) {
  const router = useRouter();
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

  async function save() {
    if (!data || !draft || offerProblem) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      skills,
      saveOffer: offerParts.every(Boolean) ? { discount: draft.discount, months: draft.months, message: draft.message, minTenureDays: draft.tenure, cooldownDays: draft.cooldown } : null,
      alerts: { rateThreshold: Number(draft.ratePct) / 100, alertThreshold: Number(draft.alerts), minSample: Number(draft.sample) },
      bridgeUrl: draft.bridgeUrl,
    };
    try {
      const res = await fetch(`/api/engagements/${engagementId}/setup/whop/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      const hook = json.webhook as { action?: string; error?: string } | undefined;
      if (hook?.error) toast.error(`Settings saved, but Whop didn't accept the webhook: ${hook.error}`);
      else toast.success(hook?.action === "created" ? "Saved. Whop will now send events to Whop Agent." : "Saved.");
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
    <div className="@container mx-auto w-full max-w-3xl px-1 pb-4">
      {phase === "review" ? (
        <>
          <Review data={data} draft={draft} set={set} skills={skills} toggleSkill={toggleSkill} events={events} onReread={() => setPhase("welcome")} onQueueFix={queueFix} />
          <div className="sticky bottom-0 z-20 mt-8 border-t bg-background/95 px-4 py-3 backdrop-blur-md shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]">
            <div className="flex flex-col gap-2.5 @3xl:flex-row @3xl:items-center @3xl:gap-4">
              <div className="min-w-0 flex-1 text-sm">
                {saveError || offerProblem ? (
                  <p className="flex items-center gap-2 text-[var(--error)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {saveError ?? offerProblem}
                  </p>
                ) : (
                  <p className="text-[var(--text-secondary)]">
                    {events.length ? "Saving also sets up the one webhook these workers need on your Whop. Nothing else is written to Whop." : "Nothing is written to Whop."}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" className="hidden @md:inline-flex" onClick={onCancel} disabled={saving}>
                  {cancelLabel}
                </Button>
                <Button size="lg" className="h-10 px-5" onClick={save} disabled={saving || Boolean(offerProblem)}>
                  {saving ? <Loader2 className="animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </div>
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
}) {
  const [replacing, setReplacing] = useState(false);
  const connected = data.connection.connected && !replacing;
  const ready = connected || draft.apiKey.trim().length > 0;
  return (
    <div className="space-y-9">
      <header className="flex items-start gap-4">
        <WhopMark />
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] @xl:text-[30px]">Whop Agent for {data.buyer}</h1>
          <p className="max-w-xl text-[15px] leading-relaxed">
            We read your Whop business, from plans and members to refunds, disputes and reviews, then set your workers up from what we find. Anything that touches your members or money waits for your approval.
          </p>
        </div>
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
                Set it up <ArrowRight />
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

function Review({
  data,
  draft,
  set,
  skills,
  toggleSkill,
  events,
  onReread,
  onQueueFix,
}: {
  data: WhopSetupState;
  draft: Draft;
  set: (fn: (d: Draft) => Draft) => void;
  skills: string[];
  toggleSkill: (id: string, v: boolean) => void;
  events: string[];
  onReread: () => void;
  onQueueFix: (body: { action: "dedupe"; groupKey: string } | { action: "pin"; whopWebhookId: string }) => Promise<void>;
}) {
  const s = data.snapshot;
  const read = data.read;
  const stats: { value: string; label: string; warn?: boolean }[] = [];
  if (s?.mrr) stats.push({ value: money(s.mrr.value, s.mrr.currency), label: s.mrr.source === "plans" ? "a month, from plan prices × members" : "monthly recurring revenue" });
  if (s?.members != null) stats.push({ value: s.members.toLocaleString(), label: "active members" });
  if (s?.canceling) stats.push({ value: `${s.canceling.count}${s.canceling.more ? "+" : ""}`, label: "set to cancel", warn: s.canceling.count > 0 });
  if (s?.newMembers30d) stats.push({ value: `${s.newMembers30d.count}${s.newMembers30d.more ? "+" : ""}`, label: "new members this month" });
  if (s?.refundRate != null) stats.push({ value: pct(s.refundRate)!, label: "of payments refunded (90 days)" });
  if (s?.disputeRate != null) stats.push({ value: pct(s.disputeRate)!, label: "of payments disputed (90 days)", warn: s.disputeRate >= 0.01 });
  const topPlans = [...(read?.plans ?? [])].filter((p) => p.memberCount).sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0)).slice(0, 3);
  const rated = (read?.products ?? []).filter((p) => p.rating != null && p.reviews);
  const lowReviews = (read?.reviews ?? []).filter((r) => r.stars <= 2).slice(0, 2);
  const current = data.webhook.current ? [...data.webhook.current].sort() : null;
  const sameEvents = current && current.length === events.length && current.every((e, i) => e === events[i]);

  return (
    <div className="space-y-11">
      <header className="flex items-start gap-4">
        <WhopMark />
        <div className="min-w-0 space-y-1">
          <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)]">{data.buyer} on Whop</h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            {data.connection.accountId ?? "Not connected"}
            {read ? ` · read ${new Date(read.readAt).toLocaleDateString()}` : ""} ·{" "}
            <button type="button" onClick={onReread} className="font-medium underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
              Read again or change key
            </button>
          </p>
        </div>
      </header>

      {data.connection.breakerOpen && (
        <p className="flex items-start gap-2 border-l-2 border-[var(--error)] pl-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--error)]" /> Whop has been refusing this key, so Whop Agent has paused. Paste a working key to start it again.
        </p>
      )}

      {stats.length > 0 && (
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-3">
            {stats.slice(0, 6).map((x) => (
              <div key={x.label} className="min-w-0">
                <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", x.warn ? "text-[var(--error)]" : "text-[var(--text-primary)]")}>{x.value}</p>
                <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{x.label}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {topPlans.length > 0 && (
              <List title="Biggest plans">
                {topPlans.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[var(--text-primary)]">{p.title ?? p.productTitle ?? p.id}</span>
                    <span className="shrink-0 tabular-nums">{p.memberCount} · {p.formattedPrice ?? ""}</span>
                  </li>
                ))}
              </List>
            )}
            {(rated.length > 0 || lowReviews.length > 0) && (
              <List title="Reviews">
                {rated.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-[var(--text-primary)]">{p.title}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                      <Star className="h-3 w-3 fill-current" /> {p.rating!.toFixed(1)} ({p.reviews})
                    </span>
                  </li>
                ))}
                {lowReviews.map((r, i) => (
                  <li key={i} className="line-clamp-2">
                    <span className="font-medium text-[var(--text-primary)]">{r.stars}★ on {r.product}:</span> {r.title ?? r.text}
                  </li>
                ))}
              </List>
            )}
            {read?.promoCodes && read.promoCodes.length > 0 && (
              <List title="Most-used promo codes">
                {read.promoCodes.slice(0, 3).map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-[var(--text-primary)]">{c.code ?? "(no code)"}</span>
                    <span className="shrink-0 tabular-nums">{c.uses} uses</span>
                  </li>
                ))}
              </List>
            )}
            {read?.affiliates && read.affiliates.length > 0 && (
              <List title="Top affiliates">
                {read.affiliates.slice(0, 3).map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[var(--text-primary)]">{a.name ?? "Unnamed"}</span>
                    <span className="shrink-0 tabular-nums">{a.referrals} referrals · {money(a.revenueUsd, "usd")}</span>
                  </li>
                ))}
              </List>
            )}
          </div>
        </section>
      )}

      {skills.includes("whop-cancellation-save-offer") && (
        <Section title="Save offer" hint="Proposed to each member who sets their plan to cancel. You approve every one.">
          <div className="space-y-4">
            {data.saveOffer.evidence.length > 0 && (
              <ul className="space-y-1 text-[13px] text-[var(--text-secondary)]">
                {data.saveOffer.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <Field label="Discount">
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-[var(--text-secondary)]">
                <NumberInput value={draft.discount} onChange={(v) => set((d) => ({ ...d, discount: v }))} placeholder="e.g. 30" /> % off for
                <NumberInput value={draft.months} onChange={(v) => set((d) => ({ ...d, months: v }))} placeholder="e.g. 2" /> months
              </div>
              {data.saveOffer.source && <p className="mt-1 text-[12px] text-[var(--text-prefill-accent)]">From {data.saveOffer.source}.</p>}
            </Field>
            <Field label="Message">
              <textarea
                value={draft.message}
                onChange={(e) => set((d) => ({ ...d, message: e.target.value }))}
                rows={2}
                placeholder="What members see with the offer. You can use {discount} and {months}."
                className="w-full max-w-lg resize-y border-b border-[var(--text-muted)]/40 bg-transparent py-1.5 text-[15px] leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
              />
            </Field>
            <Field label="Only offer to">
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-[var(--text-secondary)]">
                members of at least <NumberInput value={draft.tenure} onChange={(v) => set((d) => ({ ...d, tenure: v }))} placeholder="30" /> days, once every
                <NumberInput value={draft.cooldown} onChange={(v) => set((d) => ({ ...d, cooldown: v }))} placeholder="90" /> days
              </div>
            </Field>
            {!draft.discount && !draft.months && !draft.message && <p className="text-[12px] text-[var(--text-muted)]">Leave it empty and no offer is made. We never pick a discount for you.</p>}
          </div>
        </Section>
      )}

      {skills.includes("whop-refund-dispute-velocity") && (
        <Section title="Refund and dispute alerts" hint={data.alerts.saved ? "Your saved levels." : data.alerts.fromData ? "Set from your last 90 days." : undefined}>
          <div className="space-y-4">
            <Field label="Refund or dispute rate">
              <div className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">
                above <NumberInput value={draft.ratePct} onChange={(v) => set((d) => ({ ...d, ratePct: v }))} /> % in a week
              </div>
              <Why>{data.alerts.why.rate}</Why>
            </Field>
            <Field label="Dispute alerts">
              <div className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">
                <NumberInput value={draft.alerts} onChange={(v) => set((d) => ({ ...d, alerts: v }))} /> or more in a week
              </div>
              <Why>{data.alerts.why.alerts}</Why>
            </Field>
            <Field label="Payments needed">
              <div className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)]">
                <NumberInput value={draft.sample} onChange={(v) => set((d) => ({ ...d, sample: v }))} /> in a week before a rate counts
              </div>
              <Why>{data.alerts.why.sample}</Why>
            </Field>
          </div>
        </Section>
      )}

      {skills.includes("whop-bridge-manager") && (
        <Section title="Bridge" hint="Where Whop events are forwarded.">
          <Field label="Send events to">
            <input
              value={draft.bridgeUrl}
              onChange={(e) => set((d) => ({ ...d, bridgeUrl: e.target.value }))}
              placeholder="https://..."
              spellCheck={false}
              className="h-10 w-full max-w-lg border-b border-[var(--text-muted)]/40 bg-transparent text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
            />
            {data.bridge.signingSecret && draft.bridgeUrl === data.bridge.url && (
              <div className="mt-2 space-y-1">
                <p className="text-[12px] text-[var(--text-muted)]">Signing secret. Your receiver can check each event&apos;s X-Whop-Agent-Signature header with it.</p>
                <code className="block max-w-lg break-all border px-2 py-1.5 font-mono text-[12px] text-[var(--text-primary)]">{data.bridge.signingSecret}</code>
              </div>
            )}
            {data.bridge.ghlConnected && !draft.bridgeUrl && <Why>GoHighLevel is connected for {data.buyer}. Paste an inbound webhook address from a GoHighLevel workflow to send events there.</Why>}
          </Field>
        </Section>
      )}

      <Section title="Events from Whop" hint="Whop tells Whop Agent when these happen.">
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-[14px] text-[var(--text-secondary)]">None of the workers you picked need events, so no webhook is set up.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {events.map((e) => (
                  <span key={e} className="rounded-full border px-2.5 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">
                    {e}
                  </span>
                ))}
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                {!current ? "Saving creates one webhook on your Whop for these." : sameEvents ? "Your webhook already sends exactly these." : "Saving updates your existing Whop Agent webhook to these."}{" "}
                {!data.connection.pinnedVersionDate && <span className="text-[var(--error)]">Whop&apos;s API version couldn&apos;t be checked yet, so the webhook can&apos;t be set up. Read again to retry.</span>}
              </p>
            </>
          )}
          {data.webhook.problems.length > 0 && (
            <div className="space-y-2 border-l-2 border-[var(--error)] pl-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">Other webhooks on your account</p>
              {data.webhook.problems.map((p, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-[var(--text-secondary)]">
                  <span className="min-w-0 flex-1">{p.detail}</span>
                  {p.kind === "duplicate" && p.groupKey && (
                    <button type="button" onClick={() => onQueueFix({ action: "dedupe", groupKey: p.groupKey! })} className="shrink-0 text-[12px] font-medium underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
                      Clean up (you approve)
                    </button>
                  )}
                  {p.kind === "unpinned" && p.whopWebhookId && (
                    <button type="button" onClick={() => onQueueFix({ action: "pin", whopWebhookId: p.whopWebhookId! })} className="shrink-0 text-[12px] font-medium underline decoration-dashed underline-offset-4 hover:text-[var(--text-primary)] cursor-pointer">
                      Pin it (you approve)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {data.connection.locked.length > 0 && (
        <Section title="What your key can't reach" hint="Give the key these permissions in Whop to unlock them.">
          <ul className="space-y-1.5 text-[13px] text-[var(--text-secondary)]">
            {data.connection.locked.map((l) => (
              <li key={l.label}>
                <span className="font-medium text-[var(--text-primary)]">{l.label}:</span> {l.locks}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Workers" hint="Switch any of them off.">
        <SkillList skills={skills} toggleSkill={toggleSkill} />
      </Section>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

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

function List({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <ul className="space-y-1.5 text-[13px] text-[var(--text-secondary)]">{children}</ul>
    </div>
  );
}

function Why({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      placeholder={placeholder}
      className="h-8 w-16 border-b border-[var(--text-muted)]/40 bg-transparent text-center tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--text-primary)]"
    />
  );
}
