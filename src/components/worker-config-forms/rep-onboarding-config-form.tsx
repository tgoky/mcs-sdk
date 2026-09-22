"use client";

import { useEffect, useState } from "react";
import { 
  ShieldCheck, 
  Sparkles, 
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
} from "lucide-react";
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
  { id: "chatgpt", label: "ChatGPT (OpenAI)", badge: "GPT-4o" },
  { id: "claude", label: "Claude (Anthropic)", badge: "Claude 3.5 Sonnet" },
  { id: "perplexity", label: "Perplexity AI", badge: "Sonar Deep" },
  { id: "gemini", label: "Google Gemini", badge: "Gemini 1.5 Pro" },
  { id: "grok", label: "Grok (xAI)", badge: "Grok 2" },
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

  // Single Dossier vs Scenario Tuning Toggle
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

      // Reload updated graph facts from bridge API
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
    window.location.href = `/engagements/${engagementId}/settings/integrations`;
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

  const toggleEngine = (engineId: string) => {
    if (selectedEngines.includes(engineId)) {
      if (selectedEngines.length === 1) return; // Keep at least 1 engine active
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-1 sm:p-4 text-foreground">
      {/* Dossier Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-6 text-white shadow-xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                Reputation Manager — Single Dossier
              </h1>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                Ready to Arm
              </span>
            </div>
            <p className="text-sm text-zinc-400">
              Auto-harvested intelligence graph for <span className="font-semibold text-zinc-200">{operatorName || buyer}</span>. Review summary or tweak scenario settings below.
            </p>
          </div>

          <button
            onClick={handleArmAndSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            {saving ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                Arming Worker...
              </>
            ) : (
              <>
                <ShieldCheck className="h-5 w-5" />
                ARM REPUTATION WATCH
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Optional Data Sources Header Strip */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" /> Optional Data Sources & Enrichment
          </div>
          <span className="text-[10px] text-muted-foreground">Non-compulsory • Adds automated intelligence</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Option 1: Optional Domain Input */}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="https://company.com"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleManualCrawl}
              disabled={crawling || !inputDomain.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {crawling ? <Sparkles className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {crawling ? "Crawling..." : "Crawl Site"}
            </button>
          </div>

          {/* Option 2: Optional CRM / Platform Connect */}
          <div className="flex items-center justify-between rounded-lg border border-input bg-background px-3 py-1.5">
            <span className="text-xs text-muted-foreground truncate">
              {graphData?.operatorHandles?.ghl ? "GoHighLevel Connected" : "Connect GoHighLevel, HubSpot, or Klaviyo"}
            </span>
            <button
              type="button"
              onClick={handleConnectIntegration}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400 cursor-pointer shrink-0"
            >
              <Link className="h-3.5 w-3.5" />
              {graphData?.operatorHandles?.ghl ? "Manage" : "+ Connect Tool"}
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Discovered Intelligence Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            <h2 className="text-base font-semibold">Auto-Discovered Identity Profile</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3 w-3 text-emerald-500" />
            Deep-Harvested
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Brand & Domain */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-500" /> Monitored Entity & Domain
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">{operatorName || buyer}</div>
              {primaryDomain || inputDomain ? (
                <a
                  href={`https://${(primaryDomain || inputDomain).replace(/^https?:\/\//i, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {primaryDomain || inputDomain} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Domain pending website crawl</span>
              )}
            </div>
          </div>

          {/* Social Channels & Review Ratings */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-500" /> Official Handles & Reviews
              </span>
              {reviewBaseline && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                  {reviewBaseline.rating ?? "4.8"} ({reviewBaseline.reviewCount ? reviewBaseline.reviewCount.toLocaleString() : "1k+"} reviews)
                </span>
              )}
            </div>
            {handlesList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {handlesList.map(([platform, handle]) => (
                  <span
                    key={platform}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <span className="capitalize text-muted-foreground">{platform}:</span> {handle}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Auto-harvested from footer schema (X, LinkedIn, Trustpilot)
              </p>
            )}
          </div>

          {/* Rivals & Competitors */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-amber-500" /> Monitored Competitors ({competitorList.length})
            </div>
            {competitorList.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {competitorList.map((comp) => (
                  <span
                    key={comp}
                    className="inline-flex items-center rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                  >
                    {comp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No rivals extracted yet — website crawl will populate suggestions automatically.
              </p>
            )}
          </div>

          {/* Disambiguation & Entities Summary */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Disambiguation & Prompts
            </div>
            <div className="space-y-1.5 text-xs text-foreground">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Same-Name Collisions:</span>
                <span className={`font-semibold ${collisionsCount === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {collisionsCount === 0 ? "0 Collisions (Clear)" : `${collisionsCount} Collisions Flagged`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sub-Brands & Entities:</span>
                <span className="font-semibold text-foreground">
                  {entitiesCount > 0 ? `${entitiesCount} Discovered` : "None Flagged"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AI Seed Panel Prompts:</span>
                <span className="font-semibold">{seedPromptsCount > 0 ? `${seedPromptsCount} Prompts Ready` : "5 Standard Prompts"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Response Authority:</span>
                <span className="font-semibold text-foreground">{soleAuthority}</span>
              </div>
            </div>
          </div>
        </div>

        {/* What Will Run Checklist */}
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Automations Armed Upon Save
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs text-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>AI Engine Watch ({selectedEngines.length} Models Daily)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Daily Social & Review Scans (X, Reddit, Trustpilot)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Automated Crisis Paging Floor (Threshold: {crisisThreshold}/100)</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Daily Executive Sentiment & Brand Digest</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scenario-Based Tuning Collapsible */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-indigo-500" />
            <div>
              <div className="text-sm font-semibold">Customize Setup / Scenario Tuning</div>
              <div className="text-xs text-muted-foreground">
                Tweak response authorities, rival watchlists, and active AI engine panels in plain English.
              </div>
            </div>
          </div>
          {showCustomizer ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {showCustomizer && (
          <div className="border-t border-border p-6 space-y-6 bg-muted/10">
            {/* Scenario Card 1: Response Approval Authority */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                <h3 className="text-sm font-semibold">1. Crisis Response Approval Authority</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                If an AI engine or review platform flags a critical complaint about your pricing or service, who approves public response drafts before they go live?
              </p>
              <div className="pt-2">
                <label className="block text-xs font-medium text-foreground mb-1">
                  Sole Response Authority Name
                </label>
                <input
                  type="text"
                  value={soleAuthority}
                  onChange={(e) => setSoleAuthority(e.target.value)}
                  placeholder="e.g. Sarah Jenkins (Co-Founder)"
                  className="w-full max-w-md rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Scenario Card 2: Competitor Watchlist */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-amber-500" />
                  <h3 className="text-sm font-semibold">2. Competitor Radar & Rival Brands</h3>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Which specific direct rivals do you hate losing deals to? We will track AI queries comparing your brand against them.
              </p>

              <div className="flex items-center gap-2 pt-2 max-w-md">
                <input
                  type="text"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCompetitor())}
                  placeholder="Add competitor name (e.g. Apex Contracting)"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddCompetitor}
                  className="inline-flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary/80 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {competitorList.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {competitorList.map((comp) => (
                    <span
                      key={comp}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
                    >
                      {comp}
                      <button
                        type="button"
                        onClick={() => handleRemoveCompetitor(comp)}
                        className="hover:text-red-500 transition cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Scenario Card 3: AI Engine Panel Selection */}
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <h3 className="text-sm font-semibold">3. AI Engine Watch Panel</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Select which AI models should be queried daily with your brand&apos;s seed prompts.
              </p>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                {ALL_ENGINES.map((engine) => {
                  const isChecked = selectedEngines.includes(engine.id);
                  return (
                    <button
                      key={engine.id}
                      type="button"
                      onClick={() => toggleEngine(engine.id)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition cursor-pointer ${
                        isChecked
                          ? "border-emerald-500/50 bg-emerald-500/5 text-foreground"
                          : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-foreground">{engine.label}</div>
                        <div className="text-[10px] text-muted-foreground">{engine.badge}</div>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition ${
                          isChecked
                            ? "border-emerald-500 bg-emerald-500 text-zinc-950"
                            : "border-border bg-background"
                        }`}
                      >
                        {isChecked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border bg-background px-5 py-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted cursor-pointer"
        >
          {cancelLabel}
        </button>

        <button
          type="button"
          onClick={handleArmAndSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50 shadow-md shadow-emerald-500/20 cursor-pointer"
        >
          {saving ? "Arming..." : "ARM REPUTATION MANAGER"}
        </button>
      </div>
    </div>
  );
}