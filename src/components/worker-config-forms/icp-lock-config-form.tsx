"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Rocket,
  Globe,
  Users,
  Target,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Plus,
  X,
  ExternalLink,
  Search,
  Link,
  Loader2,
  Clock,
  Zap,
  Mail,
  Volume2,
} from "lucide-react";
import { anySkillDisplayName } from "@/lib/any-skill";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { useTour } from "@/components/tours/tour-provider";
import { useToast } from "@/components/toast/toast-provider";
import type { ColdOpenIcp, ColdOpenSizingBound } from "@/models/schema";

export interface IcpLockFormProps {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
}

export type IcpRow = {
  slug: string;
  label: string;
  weight: string;
  teamSizeMin: string;
  teamSizeMax: string;
  disqualifyIf: string;
};

function emptyIcpRow(): IcpRow {
  return { slug: "", label: "", weight: "", teamSizeMin: "", teamSizeMax: "", disqualifyIf: "" };
}

const COLD_OPEN_AUTOMATION_SKILLS = [
  { id: "icp-lock", cadence: "Setup Spine" },
  { id: "voice-capture", cadence: "Tone & Style" },
  { id: "source-connect", cadence: "Lead Stream" },
  { id: "send-connect", cadence: "Platform Link" },
  { id: "daily-send", cadence: "24h Batch" },
  { id: "reply-sort", cadence: "Real-Time" },
  { id: "send-report", cadence: "Weekly Digest" },
];

export function IcpLockConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Back to workspace",
}: IcpLockFormProps) {
  const router = useRouter();
  const toast = useToast();
  const { start: startTour } = useTour();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw Graph & Client Data
  const [buyer, setBuyer] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [inputDomain, setInputDomain] = useState("");

  // Product Identity State
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productValueProp, setProductValueProp] = useState("");

  // ICP & Sizing Bounds State
  const [icpRows, setIcpRows] = useState<IcpRow[]>([emptyIcpRow()]);
  const [reviewRequiredIcps, setReviewRequiredIcps] = useState("");

  // Voice Profile State
  const [greeting, setGreeting] = useState("Hi {first_name},");
  const [signOff, setSignOff] = useState("Best,");
  const [tone, setTone] = useState("Professional");

  // Sending Platform & Daily Settings
  const [sendPlatform, setSendPlatform] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number>(50);
  const [sendWindowHours, setSendWindowHours] = useState("09:00-17:00");

  // Scenario Tuning Collapsible
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/icp-lock`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Cold Open config");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setPrimaryDomain(data.primaryDomain ?? "");
        setInputDomain(data.primaryDomain ?? "");

        if (data.config) {
          setProductName(data.config.productName ?? data.buyer ?? "");
          setProductUrl(data.config.productUrl ?? "");
          setProductPrice(data.config.productPrice ?? "");
          setProductValueProp(data.config.productValueProp ?? "");

          const bounds: Record<string, ColdOpenSizingBound> = data.config.sizingBounds ?? {};
          const icps: ColdOpenIcp[] = data.config.icps ?? [];

          if (icps.length > 0) {
            setIcpRows(
              icps.map((icp) => ({
                slug: icp.slug,
                label: icp.label,
                weight: String(icp.weight ?? ""),
                teamSizeMin: bounds[icp.slug]?.teamSizeMin !== undefined ? String(bounds[icp.slug].teamSizeMin) : "",
                teamSizeMax: bounds[icp.slug]?.teamSizeMax !== undefined ? String(bounds[icp.slug].teamSizeMax) : "",
                disqualifyIf: (bounds[icp.slug]?.disqualifyIf ?? []).join(", "),
              }))
            );
          }

          setReviewRequiredIcps((data.config.reviewRequiredIcps ?? []).join(", "));

          if (data.config.voiceProfile) {
            if (data.config.voiceProfile.greeting) setGreeting(data.config.voiceProfile.greeting);
            if (data.config.voiceProfile.signOff) setSignOff(data.config.voiceProfile.signOff);
            if (data.config.voiceProfile.tone) setTone(data.config.voiceProfile.tone);
          }

          if (data.config.sendPlatform?.platform) {
            setSendPlatform(data.config.sendPlatform.platform);
          }

          if (data.config.dailySendSettings) {
            if (typeof data.config.dailySendSettings.dailyLimit === "number") {
              setDailyLimit(data.config.dailySendSettings.dailyLimit);
            }
            if (data.config.dailySendSettings.sendWindowHours) {
              setSendWindowHours(data.config.dailySendSettings.sendWindowHours);
            }
          }
        } else if (data.buyer) {
          setProductName(data.buyer);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load Cold Open config";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [engagementId]);

  const handleManualCrawl = async () => {
    if (!inputDomain.trim()) return;
    setCrawling(true);
    setError(null);

    try {
      const res = await fetch(`/api/engagements/${engagementId}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: inputDomain.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to crawl domain");

      const refreshRes = await fetch(`/api/engagements/${engagementId}/bridges/icp-lock`);
      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData?.config) {
        if (refreshData.primaryDomain) {
          setPrimaryDomain(refreshData.primaryDomain);
          setInputDomain(refreshData.primaryDomain);
        }
        setProductName(refreshData.config.productName ?? productName);
        setProductUrl(refreshData.config.productUrl ?? productUrl);
        setProductPrice(refreshData.config.productPrice ?? productPrice);
        setProductValueProp(refreshData.config.productValueProp ?? productValueProp);

        if (Array.isArray(refreshData.config.icps) && refreshData.config.icps.length > 0) {
          const bounds = refreshData.config.sizingBounds ?? {};
          setIcpRows(
            refreshData.config.icps.map((icp: ColdOpenIcp) => ({
              slug: icp.slug,
              label: icp.label,
              weight: String(icp.weight ?? ""),
              teamSizeMin: bounds[icp.slug]?.teamSizeMin !== undefined ? String(bounds[icp.slug].teamSizeMin) : "",
              teamSizeMax: bounds[icp.slug]?.teamSizeMax !== undefined ? String(bounds[icp.slug].teamSizeMax) : "",
              disqualifyIf: (bounds[icp.slug]?.disqualifyIf ?? []).join(", "),
            }))
          );
        }

        if (refreshData.config.voiceProfile) {
          if (refreshData.config.voiceProfile.greeting) setGreeting(refreshData.config.voiceProfile.greeting);
          if (refreshData.config.voiceProfile.signOff) setSignOff(refreshData.config.voiceProfile.signOff);
          if (refreshData.config.voiceProfile.tone) setTone(refreshData.config.voiceProfile.tone);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to crawl domain";
      setError(msg);
    } finally {
      setCrawling(false);
    }
  };

  const handleConnectIntegration = () => {
    window.location.href = `/dashboard/settings/apps`;
  };

  function updateRow(i: number, patch: Partial<IcpRow>) {
    setIcpRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setIcpRows((rows) => [...rows, emptyIcpRow()]);
  }

  function removeRow(i: number) {
    setIcpRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  const cleanRows = icpRows.filter((r) => r.slug.trim() && r.label.trim());

  const handleArmAndSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const icps: ColdOpenIcp[] = cleanRows.map((r) => ({
        slug: r.slug.trim(),
        label: r.label.trim(),
        weight: Number(r.weight) || (cleanRows.length > 0 ? 1 / cleanRows.length : 1.0),
      }));

      const sizingBounds: Record<string, ColdOpenSizingBound> = {};
      for (const r of cleanRows) {
        sizingBounds[r.slug.trim()] = {
          teamSizeMin: r.teamSizeMin ? Number(r.teamSizeMin) : undefined,
          teamSizeMax: r.teamSizeMax ? Number(r.teamSizeMax) : undefined,
          disqualifyIf: r.disqualifyIf.split(",").map((s) => s.trim()).filter(Boolean),
        };
      }

      const payload = {
        productName: productName.trim() || buyer,
        productUrl: productUrl.trim() || primaryDomain,
        productPrice: productPrice.trim(),
        productValueProp: productValueProp.trim(),
        productAllocation: { [(productName.trim() || buyer)]: 1.0 },
        icps,
        sizingBounds,
        reviewRequiredIcps: reviewRequiredIcps.split(",").map((s) => s.trim()).filter(Boolean),
        voiceProfile: {
          greeting: greeting.trim(),
          signOff: signOff.trim(),
          tone: tone.trim(),
        },
        dailySendSettings: {
          dailyLimit: Number(dailyLimit) || 50,
          sendWindowHours: sendWindowHours.trim(),
        },
      };

      const res = await fetch(`/api/engagements/${engagementId}/bridges/icp-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to arm Cold Open pipeline");

      toast.success(`Cold Open Dossier armed for ${productName || buyer}.`);
      router.refresh();
      startTour("cold-open");

      if (onSaved) onSaved({ runId: data.runId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to arm Cold Open pipeline";
      setError(msg);
      setSaving(false);
    }
  };

  if (loading) return <ConfigFormSkeleton />;

  // Calculate Outreach Radar Coverage Score
  const hasDomain = Boolean(primaryDomain || productUrl || inputDomain);
  const hasIcps = cleanRows.length > 0;
  const hasSendingTool = Boolean(sendPlatform);

  let coverageScore = 20;
  if (hasDomain) coverageScore += 30;
  if (hasSendingTool) coverageScore += 25;
  if (hasIcps) coverageScore += 25;

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Uncarded Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Cold Open Outreach Dossier
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Outbound campaign profile for <span className="font-medium text-zinc-200">{productName || buyer}</span>
          </p>
        </div>

        <button
          onClick={handleArmAndSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Arming Pipeline...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              ARM OUTREACH PIPELINE
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Data Sources & Radar Coverage Card (Settings/Apps styling) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Data Sources & Outreach Radar
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-zinc-400">Outreach Radar:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                coverageScore >= 80
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : coverageScore >= 50
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
              }`}
            >
              {coverageScore}% {coverageScore < 70 ? "(Action Recommended)" : "(High Radar)"}
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Crawl your product domain or connect your email sending platform (Instantly, Smartlead, Lemlist) to populate campaign copy and target ICPs.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Domain Crawl Input */}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="https://company.com"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleManualCrawl}
              disabled={crawling || !inputDomain.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {crawling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {crawling ? "Crawling..." : "Crawl Site"}
            </button>
          </div>

          {/* Sending Platform Connection Link */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5">
            <span className="text-xs text-zinc-400 truncate">
              {sendPlatform ? `${sendPlatform.toUpperCase()} Connected` : "Instantly / Smartlead / Lemlist / Reply.io"}
            </span>
            <button
              type="button"
              onClick={handleConnectIntegration}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline cursor-pointer shrink-0"
            >
              <Link className="h-3.5 w-3.5" />
              {sendPlatform ? "Manage" : "+ Connect"}
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Discovered Outreach Profile (Settings/Apps styling) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 pb-3">
          Auto-Discovered Outreach Profile
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Product & Value Proposition */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-400" /> Product Identity & Offer
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100">{productName || buyer}</div>
              {productValueProp && (
                <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2">{productValueProp}</p>
              )}
              {productPrice && (
                <span className="inline-block mt-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {productPrice}
                </span>
              )}
              {primaryDomain || productUrl ? (
                <a
                  href={`https://${(productUrl || primaryDomain).replace(/^https?:\/\//i, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline mt-1.5 block"
                >
                  {productUrl || primaryDomain} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-amber-400 block mt-1">
                  ⚠️ No product domain crawled yet
                </span>
              )}
            </div>
          </div>

          {/* Voice Profile & Tone */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-indigo-400" /> Voice & Email Sign-off
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Tone:</span>
                <span className="font-medium text-emerald-400">{tone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Greeting:</span>
                <span className="font-mono text-zinc-200">{greeting}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sign-Off:</span>
                <span className="font-mono text-zinc-200">{signOff}</span>
              </div>
            </div>
          </div>

          {/* Target ICPs */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-amber-400" /> Target ICPs ({cleanRows.length})
            </div>

            {cleanRows.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cleanRows.map((icp) => (
                  <span
                    key={icp.slug || icp.label}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400"
                  >
                    {icp.label} {icp.weight ? `(${Math.round(Number(icp.weight) * 100)}%)` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-400">
                ⚠️ 0 ICPs Defined — Add ICPs below in Scenario Tuning
              </p>
            )}
          </div>

          {/* Sending Engine & Daily Limit */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-emerald-400" /> Sending Engine & Capacity
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sending Platform:</span>
                <span className={`font-medium ${sendPlatform ? "text-emerald-400" : "text-amber-400"}`}>
                  {sendPlatform ? sendPlatform.toUpperCase() : "⚠️ None Linked"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Daily Send Limit:</span>
                <span className="font-mono text-zinc-200">{dailyLimit} emails/day</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sending Hours:</span>
                <span className="font-mono text-zinc-200">{sendWindowHours}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cold Open Sub-Skill Automations Grid (Uses AnySkillBadge) */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" /> Sub-Skill Automations Armed Upon Save
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">7/7 Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {COLD_OPEN_AUTOMATION_SKILLS.map((skill) => (
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
      </div>

      {/* Scenario-Based Tuning Collapsible */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-400" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">Customize Setup / Scenario Tuning</div>
              <div className="text-[11px] text-zinc-400">
                Tweak target ICPs, disqualification criteria, email tone, and daily dispatch volumes.
              </div>
            </div>
          </div>
          {showCustomizer ? (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          )}
        </button>

        {showCustomizer && (
          <div className="border-t border-zinc-800 p-5 space-y-5 bg-zinc-950/40">
            {/* Scenario Card 1: Target ICPs & Sizing */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-zinc-200">
                    1. {anySkillDisplayName("icp-lock")} & Sizing Bounds
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:underline cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add ICP
                </button>
              </div>

              {icpRows.map((row, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                  <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Slug</label>
                      <input
                        type="text"
                        value={row.slug}
                        onChange={(e) => updateRow(i, { slug: e.target.value })}
                        placeholder="boutique-agency"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Label</label>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRow(i, { label: e.target.value })}
                        placeholder="Boutique Agencies"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Weight (0-1.0)</label>
                      <input
                        type="text"
                        value={row.weight}
                        onChange={(e) => updateRow(i, { weight: e.target.value })}
                        placeholder="0.5"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Max Team Size</label>
                      <input
                        type="text"
                        value={row.teamSizeMax}
                        onChange={(e) => updateRow(i, { teamSizeMax: e.target.value })}
                        placeholder="50"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-400 mb-0.5">Disqualify if (comma-separated rules)</label>
                    <input
                      type="text"
                      value={row.disqualifyIf}
                      onChange={(e) => updateRow(i, { disqualifyIf: e.target.value })}
                      placeholder="e.g. B2C, revenue < $1M"
                      className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    />
                  </div>

                  {icpRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-[11px] font-semibold text-red-400 hover:underline cursor-pointer pt-1"
                    >
                      Remove ICP
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Scenario Card 2: Voice & Style */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  2. {anySkillDisplayName("voice-capture")} & Tone
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">Outreach Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="Professional">Professional</option>
                    <option value="Direct">Direct & Pitch-forward</option>
                    <option value="Casual">Casual & Conversational</option>
                    <option value="Warm">Warm & Consultative</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">Default Greeting</label>
                  <input
                    type="text"
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder="Hi {first_name},"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">Default Sign-Off</label>
                  <input
                    type="text"
                    value={signOff}
                    onChange={(e) => setSignOff(e.target.value)}
                    placeholder="Best,"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Scenario Card 3: Daily Send Settings */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  3. {anySkillDisplayName("daily-send")} Volume & Schedule
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Daily Outbound Send Limit
                  </label>
                  <input
                    type="number"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    placeholder="50"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Sending Window (Local Time)
                  </label>
                  <input
                    type="text"
                    value={sendWindowHours}
                    onChange={(e) => setSendWindowHours(e.target.value)}
                    placeholder="09:00-17:00"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-zinc-900 cursor-pointer"
        >
          {cancelLabel}
        </button>

        <button
          type="button"
          onClick={handleArmAndSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {saving ? "Arming Pipeline..." : "ARM OUTREACH PIPELINE"}
        </button>
      </div>
    </div>
  );
}