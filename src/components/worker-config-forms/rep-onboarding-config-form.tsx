"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Globe,
  Users,
  Bot,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Plus,
  X,
  ExternalLink,
  Search,
  Star,
  Link,
  Loader2,
  Clock,
  Zap,
} from "lucide-react";
import { anySkillDisplayName } from "@/lib/any-skill";
import { AnySkillBadge } from "@/components/any-skill-badge";
import { ConfigFormSkeleton } from "./config-form-skeleton";

export interface RepOnboardingFormProps {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
}

interface ReviewBaseline {
  platform: string;
  rating?: number;
  reviewCount?: number;
  label?: string;
}

interface RepGraphData {
  operatorName?: string;
  operatorAliases?: string[];
  operatorHandles?: Record<string, string>;
  operatorDomains?: string[];
  operatorEmailContacts?: string[];
  entities?: Array<{ name: string; type?: string }>;
  competitors?: Array<{ name: string; monitorFor?: string[]; highPriority?: boolean }>;
  collisions?: Array<{ name: string; domain?: string }>;
  seedPanelPrompts?: string[];
  soleAuthorityName?: string;
  activeEngines?: string[] | null;
  crisisThresholdOverride?: number | null;
  reviewBaseline?: ReviewBaseline;
}

const ALL_ENGINES = [
  { id: "chatgpt", label: "ChatGPT", provider: "OpenAI", badge: "GPT-4o" },
  { id: "claude", label: "Claude", provider: "Anthropic", badge: "Claude 3.5 Sonnet" },
  { id: "perplexity", label: "Perplexity", provider: "Sonar", badge: "Sonar Deep" },
  { id: "gemini", label: "Gemini", provider: "Google", badge: "Gemini 1.5 Pro" },
  { id: "grok", label: "Grok", provider: "xAI", badge: "Grok 2" },
];

const REP_AUTOMATION_SKILLS = [
  { id: "rep-engine-panel", cadence: "Daily Scan" },
  { id: "rep-trustpilot-watch", cadence: "Daily Scan" },
  { id: "rep-reddit-watch", cadence: "Daily Scan" },
  { id: "rep-twitter-watch", cadence: "Daily Scan" },
  { id: "rep-crisis-response", cadence: "Real-Time" },
  { id: "rep-digest", cadence: "24h Digest" },
];

export function RepOnboardingConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Back to workspace",
}: RepOnboardingFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw Graph & Client Data
  const [buyer, setBuyer] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [inputDomain, setInputDomain] = useState("");
  const [graphData, setGraphData] = useState<RepGraphData | null>(null);

  // Form / Tuning State
  const [operatorName, setOperatorName] = useState("");
  const [soleAuthority, setSoleAuthority] = useState("");
  const [competitorList, setCompetitorList] = useState<string[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [selectedEngines, setSelectedEngines] = useState<string[]>(ALL_ENGINES.map((e) => e.id));
  const [crisisThreshold, setCrisisThreshold] = useState<number>(80);

  // Quick Handle Add State
  const [showAddHandle, setShowAddHandle] = useState(false);
  const [handlePlatform, setHandlePlatform] = useState("trustpilot");
  const [handleValue, setHandleValue] = useState("");

  // Scenario Tuning Collapsible
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load identity graph");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setPrimaryDomain(data.primaryDomain ?? "");
        setInputDomain(data.primaryDomain ?? "");

        if (data.graph) {
          setGraphData({
            ...data.graph,
            reviewBaseline: data.reviewBaseline ?? data.graph.reviewBaseline,
          });
          setOperatorName(data.graph.operatorName || data.buyer || "");
          setSoleAuthority(data.graph.soleAuthorityName || data.buyer || "Workspace Owner");

          if (Array.isArray(data.graph.competitors)) {
            setCompetitorList(data.graph.competitors.map((c: { name: string }) => c.name));
          }
          if (Array.isArray(data.graph.activeEngines) && data.graph.activeEngines.length > 0) {
            setSelectedEngines(data.graph.activeEngines);
          }
          if (typeof data.graph.crisisThresholdOverride === "number") {
            setCrisisThreshold(data.graph.crisisThresholdOverride);
          }
        } else {
          setOperatorName(data.buyer || "");
          setSoleAuthority(data.buyer || "Workspace Owner");
          if (data.reviewBaseline) {
            setGraphData((prev) => ({ ...prev, reviewBaseline: data.reviewBaseline }));
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load identity graph";
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

      const refreshRes = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`);
      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData) {
        if (refreshData.primaryDomain) {
          setPrimaryDomain(refreshData.primaryDomain);
          setInputDomain(refreshData.primaryDomain);
        }
        if (refreshData.reviewBaseline) {
          setGraphData((prev) => ({ ...prev, reviewBaseline: refreshData.reviewBaseline }));
        }
        if (refreshData.graph) {
          setGraphData(refreshData.graph);
          if (refreshData.graph.operatorName) setOperatorName(refreshData.graph.operatorName);
          if (Array.isArray(refreshData.graph.competitors)) {
            setCompetitorList(refreshData.graph.competitors.map((c: { name: string }) => c.name));
          }
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

  const handleAddCompetitor = () => {
    if (!newCompetitor.trim()) return;
    if (!competitorList.includes(newCompetitor.trim())) {
      setCompetitorList([...competitorList, newCompetitor.trim()]);
    }
    setNewCompetitor("");
  };

  const handleRemoveCompetitor = (name: string) => {
    setCompetitorList(competitorList.filter((c) => c !== name));
  };

  const handleAddInlineHandle = () => {
    if (!handleValue.trim()) return;
    setGraphData((prev) => ({
      ...prev,
      operatorHandles: {
        ...(prev?.operatorHandles ?? {}),
        [handlePlatform]: handleValue.trim(),
      },
    }));
    setHandleValue("");
    setShowAddHandle(false);
  };

  const toggleEngine = (engineId: string) => {
    if (selectedEngines.includes(engineId)) {
      if (selectedEngines.length === 1) return;
      setSelectedEngines(selectedEngines.filter((e) => e !== engineId));
    } else {
      setSelectedEngines([...selectedEngines, engineId]);
    }
  };

  const handleArmAndSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        operatorName: operatorName || buyer,
        soleAuthorityName: soleAuthority || buyer || "Workspace Owner",
        operatorDomains: inputDomain || primaryDomain ? [inputDomain || primaryDomain] : graphData?.operatorDomains ?? [],
        competitors: competitorList.map((name) => ({ name, monitorFor: [], highPriority: false })),
        entities: graphData?.entities ?? [],
        seedPanelPrompts: graphData?.seedPanelPrompts ?? [],
        activeEngines: selectedEngines,
        crisisThresholdOverride: crisisThreshold,
        operatorHandles: graphData?.operatorHandles ?? {},
      };

      const res = await fetch(`/api/engagements/${engagementId}/bridges/rep-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to arm Reputation Manager");

      if (onSaved) onSaved({ runId: data.runId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to arm Reputation Manager";
      setError(msg);
      setSaving(false);
    }
  };

  if (loading) return <ConfigFormSkeleton />;

  const handlesList = graphData?.operatorHandles
    ? Object.entries(graphData.operatorHandles).filter(([, v]) => Boolean(v))
    : [];

  const entitiesCount = graphData?.entities?.length ?? 0;
  const collisionsCount = graphData?.collisions?.length ?? 0;
  const seedPromptsCount = graphData?.seedPanelPrompts?.length ?? 0;
  const reviewBaseline = graphData?.reviewBaseline;

  // Dynamically calculate radar coverage score
  const hasDomain = Boolean(primaryDomain || inputDomain);
  const hasHandles = handlesList.length > 0;
  const hasCompetitors = competitorList.length > 0;

  let coverageScore = 20;
  if (hasDomain) coverageScore += 35;
  if (hasHandles) coverageScore += 25;
  if (hasCompetitors) coverageScore += 20;

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Uncarded Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Reputation Manager Dossier
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Identity profile for <span className="font-medium text-zinc-200">{operatorName || buyer}</span>
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
              Arming Worker...
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              ARM REPUTATION WATCH
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
            Data Sources & Intelligence Radar
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-zinc-400">Radar Coverage:</span>
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
          Crawl your website domain or connect your CRM integration to populate automated review monitoring and AI rival comparisons.
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

          {/* CRM Connection Link */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5">
            <span className="text-xs text-zinc-400 truncate">
              {graphData?.operatorHandles?.ghl ? "GoHighLevel Connected" : "GoHighLevel / HubSpot / Klaviyo"}
            </span>
            <button
              type="button"
              onClick={handleConnectIntegration}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:underline cursor-pointer shrink-0"
            >
              <Link className="h-3.5 w-3.5" />
              {graphData?.operatorHandles?.ghl ? "Manage" : "+ Connect"}
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Discovered Profile & Smart Gap Nudges (Settings/Apps styling) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 pb-3">
          Auto-Discovered Identity Profile
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Brand & Monitored Domain */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-400" /> Monitored Entity & Domain
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100">{operatorName || buyer}</div>
              {primaryDomain || inputDomain ? (
                <a
                  href={`https://${(primaryDomain || inputDomain).replace(/^https?:\/\//i, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline"
                >
                  {primaryDomain || inputDomain} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-amber-400">
                  ⚠️ No domain crawled yet
                </span>
              )}
            </div>
          </div>

          {/* Official Handles & Reviews */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-400" /> Handles & Reviews
              </span>
              {reviewBaseline && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {reviewBaseline.rating ?? "4.8"} ({reviewBaseline.reviewCount ? reviewBaseline.reviewCount.toLocaleString() : "1k+"})
                </span>
              )}
            </div>

            {handlesList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {handlesList.map(([platform, handle]) => (
                  <span
                    key={platform}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-200 font-medium"
                  >
                    <span className="capitalize text-zinc-400">{platform}:</span> {handle}
                  </span>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-400">
                  ⚠️ No Trustpilot or social handles detected
                </p>
                {!showAddHandle ? (
                  <button
                    type="button"
                    onClick={() => setShowAddHandle(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add Review URL / Handle
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 pt-1">
                    <select
                      value={handlePlatform}
                      onChange={(e) => setHandlePlatform(e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="trustpilot">Trustpilot</option>
                      <option value="x">X / Twitter</option>
                      <option value="linkedin">LinkedIn</option>
                    </select>
                    <input
                      type="text"
                      value={handleValue}
                      onChange={(e) => setHandleValue(e.target.value)}
                      placeholder="e.g. marvoroofing"
                      className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddInlineHandle}
                      className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Monitored Competitors */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-amber-400" /> Monitored Competitors ({competitorList.length})
            </div>

            {competitorList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {competitorList.map((comp) => (
                  <span
                    key={comp}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-400">
                ⚠️ 0 Rivals Extracted — Add rivals below in Scenario Tuning
              </p>
            )}
          </div>

          {/* Disambiguation & Entities */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Disambiguation & Prompts
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Same-Name Collisions:</span>
                <span className={`font-medium ${collisionsCount === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {collisionsCount === 0 ? "0 Flagged (Clear)" : `${collisionsCount} Collisions Detected`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Sub-Brands & Entities:</span>
                <span className="font-medium text-zinc-200">
                  {entitiesCount > 0 ? `${entitiesCount} Discovered` : "None Flagged"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">AI Seed Prompts:</span>
                <span className="font-medium">{seedPromptsCount > 0 ? `${seedPromptsCount} Prompts Ready` : "5 Standard Prompts"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reputation Sub-Skill Automations Grid (Uses AnySkillBadge) */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" /> Sub-Skill Automations Armed Upon Save
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">6/6 Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {REP_AUTOMATION_SKILLS.map((skill) => (
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
                Tweak response authorities, rival watchlists, and active AI engine panels.
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
            {/* Scenario Card 1: Response Approval Authority */}
            <div className="space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  1. {anySkillDisplayName("rep-crisis-response")} Approval Authority
                </h3>
              </div>
              <p className="text-xs text-zinc-400">
                If an AI engine or review platform flags a critical complaint about your pricing or service, who approves public response drafts before they go live?
              </p>
              <div className="pt-1">
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Sole Response Authority Name
                </label>
                <input
                  type="text"
                  value={soleAuthority}
                  onChange={(e) => setSoleAuthority(e.target.value)}
                  placeholder="e.g. Sarah Jenkins (Co-Founder)"
                  className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scenario Card 2: Competitor Watchlist */}
            <div className="space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-zinc-200">2. Competitor Radar & Rival Brands</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Which specific direct rivals do you hate losing deals to? We will track AI queries comparing your brand against them.
              </p>

              <div className="flex items-center gap-2 pt-1 max-w-sm">
                <input
                  type="text"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCompetitor())}
                  placeholder="Add competitor name (e.g. Apex Contracting)"
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddCompetitor}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>

              {competitorList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {competitorList.map((comp) => (
                    <span
                      key={comp}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400"
                    >
                      {comp}
                      <button
                        type="button"
                        onClick={() => handleRemoveCompetitor(comp)}
                        className="hover:text-red-400 transition cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Scenario Card 3: AI Engine Panel Selection */}
            <div className="space-y-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-400" />
                  <h3 className="text-xs font-semibold text-zinc-200">
                    3. {anySkillDisplayName("rep-engine-panel")}
                  </h3>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {selectedEngines.length}/{ALL_ENGINES.length} Models Selected
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Select which AI models should be queried daily with your brand&apos;s seed prompts.
              </p>

              {/* Squishy Pill Badges for Engine Selection */}
              <div className="flex flex-wrap gap-2 pt-1">
                {ALL_ENGINES.map((engine) => {
                  const isChecked = selectedEngines.includes(engine.id);
                  return (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => toggleEngine(engine.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                        isChecked
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full transition-colors ${
                          isChecked ? "bg-emerald-500" : "bg-zinc-600"
                        }`}
                      />
                      <span>{engine.label}</span>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] font-mono text-zinc-400">
                        {engine.badge}
                      </span>
                      {isChecked && <Check className="h-3 w-3 text-emerald-400 stroke-[3]" />}
                    </button>
                  );
                })}
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
          {saving ? "Arming..." : "ARM REPUTATION MANAGER"}
        </button>
      </div>
    </div>
  );
}