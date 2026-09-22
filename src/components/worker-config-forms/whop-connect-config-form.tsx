"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldAlert,
  KeyRound,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Percent,
  Clock,
  ExternalLink,
} from "lucide-react";
import { anySkillDisplayName } from "@/lib/any-skill";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { WorkerCapabilityMatrix } from "@/components/worker-capability-matrix";
import { useTour } from "@/components/tours/tour-provider";
import { useToast } from "@/components/toast/toast-provider";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";

import { ConfigFormSkeleton } from "./config-form-skeleton";

export interface WhopConnectFormProps {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result?: { runId?: string }) => void;
  cancelLabel?: string;
}

interface ScopeProbeResult {
  ok: boolean;
  missingScope?: string;
  unnamedDenial?: boolean;
  checkedAt: string;
}

interface ConnectState {
  connected: boolean;
  credentialType?: string;
  whopAccountId?: string | null;
  scopeProbeResults?: Record<string, ScopeProbeResult>;
  pinnedVersionDate?: string | null;
  circuitBreakerState?: string;
  circuitBreakerReason?: string | null;
}

const PROBE_LABELS: Record<string, { label: string; locksWhat: string }> = {
  accounts: { label: "Account access", locksWhat: "Everything — key has no usable Whop account." },
  products: { label: "Products", locksWhat: "Catalog & product-launch skills" },
  plans: { label: "Plans", locksWhat: "Pricing skills" },
  memberships: { label: "Memberships", locksWhat: "Membership-driven skills" },
  stats: { label: "Stats engine", locksWhat: "All reporting (baseline requirement)" },
  webhooks: { label: "Webhooks", locksWhat: "Webhook fleet, bridge, and digest skills" },
  disputes: { label: "Disputes", locksWhat: "Dispute response skills" },
  dispute_alerts: { label: "Dispute alerts", locksWhat: "Early-warning skills" },
  payments: { label: "Payments (elevated)", locksWhat: "Expected locked on standard key" },
  affiliates: { label: "Affiliates", locksWhat: "Affiliate reporting" },
  chat_channels: { label: "Chat channels", locksWhat: "Community reads" },
  dm_channels: { label: "DM channels", locksWhat: "Optional community features" },
  support_channels: { label: "Support channels", locksWhat: "Optional support features" },
  app_users: { label: "Credential-type check", locksWhat: "Informational check" },
  memberships_v2: { label: "Attribution source (v2 API)", locksWhat: "Attribution & Affiliate Report" },
};

const WHOP_AUTOMATION_SKILLS = WHOP_AGENT_SKILL_IDS.map((id) => ({
  id,
  cadence: id === "whop-connect" ? "Anchor Bridge" : "Automated Worker",
}));

export function WhopConnectConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Back to workspace",
}: WhopConnectFormProps) {
  const toast = useToast();
  const { start: startTour } = useTour();

  const [state, setState] = useState<ConnectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scenario Tuning Parameters
  const [saveOfferDiscount, setSaveOfferDiscount] = useState("20");
  const [saveOfferDuration, setSaveOfferDuration] = useState("3");
  const [saveOfferMessage, setSaveOfferMessage] = useState("Special discount to stay with us!");
  const [bridgeDestinationUrl, setBridgeDestinationUrl] = useState("");

  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/whop-connect`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Whop connection");
        if (cancelled) return;

        setState(data);
        if (data.stack) {
          if (data.stack.whop_save_offer_discount_percentage) {
            setSaveOfferDiscount(String(data.stack.whop_save_offer_discount_percentage));
          }
          if (data.stack.whop_save_offer_duration_months) {
            setSaveOfferDuration(String(data.stack.whop_save_offer_duration_months));
          }
          if (data.stack.whop_save_offer_message) {
            setSaveOfferMessage(data.stack.whop_save_offer_message);
          }
          if (data.stack.whop_bridge_destination_url) {
            setBridgeDestinationUrl(data.stack.whop_bridge_destination_url);
          }
        }
      } catch {
        if (!cancelled) setState({ connected: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  async function submit() {
    if (!apiKey.trim() && !state?.connected) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/engagements/${engagementId}/bridges/whop-connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          saveOfferDiscountPercentage: Number(saveOfferDiscount) || 20,
          saveOfferDurationMonths: Number(saveOfferDuration) || 3,
          saveOfferMessage: saveOfferMessage.trim(),
          bridgeDestinationUrl: bridgeDestinationUrl.trim(),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not connect this Whop key.");
        if (body.probe) {
          setState((prev) => ({ ...(prev ?? { connected: false }), scopeProbeResults: body.probe.results }));
        }
        setSubmitting(false);
        return;
      }

      setApiKey("");
      setState({
        connected: true,
        credentialType: body.credentialType,
        whopAccountId: body.probe?.whopAccountId,
        scopeProbeResults: body.probe?.results,
        pinnedVersionDate: body.pinnedVersionDate,
        circuitBreakerState: "closed",
      });

      toast.success("Whop Agent Engine armed across all 15 skills.");
      startTour("whop-agent");
      if (onSaved) onSaved({ runId: body.runId });
    } catch {
      setError("Network error while connecting to Whop.");
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect() {
    setSubmitting(true);
    try {
      await fetch(`/api/engagements/${engagementId}/bridges/whop-connect`, { method: "DELETE" });
      setState({ connected: false });
toast.success("Whop account disconnected.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <ConfigFormSkeleton />;

  const activeScopesCount = state?.scopeProbeResults
    ? Object.values(state.scopeProbeResults).filter((r) => r.ok).length
    : 0;
  const totalScopesCount = state?.scopeProbeResults
    ? Object.values(state.scopeProbeResults).length
    : 15;

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Uncarded Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-purple-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Whop Agent Executive Dossier
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Account automation, cancellation save-offer, dispute response, and webhook bridge engine
          </p>
        </div>

        <button
          onClick={submit}
          disabled={submitting || (!apiKey.trim() && !state?.connected)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Arming Engine...
            </>
          ) : (
            <>
              <Bot className="h-4 w-4" />
              ARM WHOP AGENT
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {state?.circuitBreakerState === "open" && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Connection paused — credential error.</p>
            <p className="mt-0.5">
              {state.circuitBreakerReason ?? "Reconnect with a valid Whop Bot API key to resume scheduled automations."}
            </p>
          </div>
        </div>
      )}

      {/* Whop Key & Credential Vault */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-purple-400" /> Whop Bot API Credential
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
              state?.connected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}
          >
            {state?.connected ? "CONNECTED & ACTIVE" : "UNCONFIGURED"}
          </span>
        </div>

        <p className="text-xs text-zinc-400">
          Generate a key under Whop Dashboard → Developer → API Keys. Connecting executes a 15-call scope probe to verify account permissions.
        </p>

        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={state?.connected ? "•••••••••••••••••••• (Key Hidden)" : "apik_..."}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting || (!apiKey.trim() && !state?.connected)}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {submitting ? "Testing..." : state?.connected ? "Update Key" : "Connect Key"}
          </button>
        </div>

        {state?.connected && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <Zap className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1 text-xs">
              <p className="font-bold text-emerald-300">Whop Agent Engine Armed</p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Account:</span> <span className="font-mono">{state.whopAccountId ?? "—"}</span>
                {" · "}
                <span className="text-zinc-500">Credential Type:</span> <span className="font-mono">{state.credentialType ?? "bot"}</span>
                {" · "}
                <span className="text-zinc-500">Pinned Version:</span> <span className="font-mono">{state.pinnedVersionDate ?? "v2"}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Scope Probe Inspector */}
      {state?.scopeProbeResults && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              API Permission Scope Probe
            </div>
            <span className="text-xs font-mono text-emerald-400">
              {activeScopesCount}/{totalScopesCount} Unlocked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(state.scopeProbeResults).map(([key, result]) => {
              const meta = PROBE_LABELS[key] ?? { label: key, locksWhat: "" };
              return (
                <div key={key} className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs">
                  {result.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-200 truncate">{meta.label}</p>
                    {!result.ok && (
                      <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                        {meta.locksWhat}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 15-Skill Automation Grid */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-purple-400" /> Whop Agent Fleet Armed Upon Save
          </span>
          <span className="text-xs text-zinc-400 font-mono">15/15 Active</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {WHOP_AUTOMATION_SKILLS.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2.5 truncate">
                <AnySkillBadge skill={skill.id} size={22} />
                <span className="font-medium text-zinc-200 truncate">
                  {anySkillDisplayName(skill.id)}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 shrink-0">
                <Clock className="h-2.5 w-2.5" />
                {skill.cadence}
              </span>
            </div>
          ))}
        </div>
      </div>

      <WorkerCapabilityMatrix workerId="whop-connect" engagementId={engagementId} />

      {/* Scenario Tuning Drawer */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-purple-400" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">Customize Setup / Scenario Tuning</div>
              <div className="text-[11px] text-zinc-400">
                Tweak cancellation save offer discounts, duration, and external bridge webhook destinations.
              </div>
            </div>
          </div>
          {showCustomizer ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>

        {showCustomizer && (
          <div className="border-t border-zinc-800 p-5 space-y-5 bg-zinc-950/40">
            {/* Scenario Card 1: Cancellation Save-Offer */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  1. {anySkillDisplayName("whop-cancellation-save-offer")} Parameters
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Discount Percentage (%)
                  </label>
                  <input
                    type="number"
                    value={saveOfferDiscount}
                    onChange={(e) => setSaveOfferDiscount(e.target.value)}
                    placeholder="20"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Discount Duration (Months)
                  </label>
                  <input
                    type="number"
                    value={saveOfferDuration}
                    onChange={(e) => setSaveOfferDuration(e.target.value)}
                    placeholder="3"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Save Offer DM Message
                </label>
                <input
                  type="text"
                  value={saveOfferMessage}
                  onChange={(e) => setSaveOfferMessage(e.target.value)}
                  placeholder="Special discount to stay with us!"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Scenario Card 2: External Bridge Manager */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  2. {anySkillDisplayName("whop-bridge-manager")} External Webhook Destination
                </h3>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Destination Webhook URL (e.g. GoHighLevel or Make.com)
                </label>
                <input
                  type="url"
                  value={bridgeDestinationUrl}
                  onChange={(e) => setBridgeDestinationUrl(e.target.value)}
                  placeholder="https://services.leadconnectorhq.com/hooks/..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-zinc-900 cursor-pointer"
        >
          {cancelLabel}
        </button>

        {state?.connected && (
          <button
            type="button"
            onClick={disconnect}
            disabled={submitting}
            className="text-xs font-semibold text-rose-400 hover:underline cursor-pointer"
          >
            Disconnect Account
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || (!apiKey.trim() && !state?.connected)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {submitting ? "Arming Engine..." : "ARM WHOP AGENT"}
        </button>
      </div>
    </div>
  );
}