"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flame,
  Globe,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ExternalLink,
  Link,
  Loader2,
  MessageSquare,
  Sparkles,
  Film,
} from "lucide-react";
import { anySkillDisplayName } from "@/lib/any-skill";
import { ConfigFormSkeleton } from "./config-form-skeleton";
import { WorkerStatusGrid } from "@/components/worker-status-grid";
import { useTour } from "@/components/tours/tour-provider";
import { useToast } from "@/components/toast/toast-provider";
import { FactSuggestionChip, FactSuggestionList, type FactSuggestionDTO } from "@/components/fact-suggestion";
import { CredentialRow } from "@/app/dashboard/engagements/[id]/update-credentials-form";
import { VERTICALS, isListedVertical, verticalLabel } from "@/lib/verticals";

// Allowed values from EngagementStack (schema.ts).
const PLATFORM_OPTIONS: Record<"booking" | "email" | "hosting", { value: string; label: string }[]> = {
  booking: [
    { value: "calendly", label: "Calendly" },
    { value: "cal_com", label: "Cal.com" },
    { value: "ghl_calendar", label: "GoHighLevel" },
    { value: "oncehub", label: "OnceHub" },
  ],
  email: [
    { value: "hubspot", label: "HubSpot" },
    { value: "klaviyo", label: "Klaviyo" },
    { value: "mailchimp", label: "Mailchimp" },
    { value: "activecampaign", label: "ActiveCampaign" },
    { value: "convertkit", label: "ConvertKit" },
    { value: "ghl", label: "GoHighLevel" },
    { value: "smtp", label: "SMTP" },
  ],
  hosting: [
    { value: "webflow", label: "Webflow" },
    { value: "wordpress", label: "WordPress" },
    { value: "ghl", label: "GoHighLevel" },
    { value: "lovable", label: "Lovable" },
    { value: "nextjs_vercel", label: "Next.js on Vercel" },
    { value: "plain_html", label: "Plain HTML (no key needed)" },
  ],
};

const FIELD_CLASS =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500";

export interface PinDownFormProps {
  engagementId: string;
  onCancel: () => void;
  onSaved?: (result: { runId?: string }) => void;
  cancelLabel?: string;
}

export function PinDownConfigForm({
  engagementId,
  onCancel,
  onSaved,
  cancelLabel = "Back to workspace",
}: PinDownFormProps) {
  const router = useRouter();
  const toast = useToast();
  const { start: startTour } = useTour();

  const [loading, setLoading] = useState(true);
  // Bumped after a save so the worker status grid re-reads what's missing.
  const [statusRefresh, setStatusRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Core Entity & Domain State
  const [buyer, setBuyer] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [inputDomain, setInputDomain] = useState("");

  // Offer Details State (Auto-Harvested & Resolvable)
  const [offerName, setOfferName] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerVertical, setOfferVertical] = useState("");
  const [offerIcp, setOfferIcp] = useState("");
  // Required answer: starts unset rather than defaulting to "warm".
  const [trafficTemperature, setTrafficTemperature] = useState<"" | "cold" | "warm" | "hot">("");
  const [castingChoice, setCastingChoice] = useState("founder_on_camera");

  // Stack Platforms
  const [bookingPlatform, setBookingPlatform] = useState<string | null>(null);
  const [hostingPlatform, setHostingPlatform] = useState<string | null>(null);
  const [emailPlatform, setEmailPlatform] = useState<string | null>(null);

  // Customizations
  const [heroVideoUrl, setHeroVideoUrl] = useState("");
  const [briefLandingDestination, setBriefLandingDestination] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [confirmationPageUrl, setConfirmationPageUrl] = useState<string | null>(null);

  // Values the app found but isn't confident enough to fill in — shown
  // beside their fields (see src/lib/fact-suggestions.ts).
  const [suggestions, setSuggestions] = useState<Record<string, FactSuggestionDTO>>({});

  // Scenario Tuning Collapsible Drawer
  const [showCustomizer, setShowCustomizer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/bridges/pin-down`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Showtime config");
        if (cancelled) return;

        setBuyer(data.buyer ?? "");
        setPrimaryDomain(data.primaryDomain ?? "");
        setInputDomain(data.primaryDomain ?? "");
        setConfirmationPageUrl(data.confirmationPageUrl ?? null);

        if (data.config) {
          setOfferName(data.config.offerName || "");
          setOfferPrice(data.config.offerPrice || "");
          setOfferVertical(data.config.offerVertical || "");
          setOfferIcp(data.config.offerIcp || "");
          setTrafficTemperature(data.config.trafficTemperature || "");
          if (data.config.castingChoice) setCastingChoice(data.config.castingChoice);

          setBookingPlatform(data.config.bookingPlatform ?? null);
          setHostingPlatform(data.config.hostingPlatform ?? null);
          setEmailPlatform(data.config.emailPlatform ?? null);

          setHeroVideoUrl(data.config.heroVideoUrl ?? "");
          setBriefLandingDestination(data.config.briefLandingDestination ?? "");
          setSlackWebhookUrl(data.config.slackWebhookUrl ?? "");
        }
        setSuggestions(data.suggestions ?? {});
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load Showtime config";
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

      const refreshRes = await fetch(`/api/engagements/${engagementId}/bridges/pin-down`);
      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData?.config) {
        if (refreshData.primaryDomain) {
          setPrimaryDomain(refreshData.primaryDomain);
          setInputDomain(refreshData.primaryDomain);
        }
        // Only fill fields that are still empty — never overwrite what the
        // user typed before crawling.
        if (!offerName.trim()) setOfferName(refreshData.config.offerName || "");
        if (!offerPrice.trim()) setOfferPrice(refreshData.config.offerPrice || "");
        if (!offerVertical.trim()) setOfferVertical(refreshData.config.offerVertical || "");
        if (!offerIcp.trim()) setOfferIcp(refreshData.config.offerIcp || "");
        if (!trafficTemperature && refreshData.config.trafficTemperature) setTrafficTemperature(refreshData.config.trafficTemperature);
        if (!bookingPlatform && refreshData.config.bookingPlatform) setBookingPlatform(refreshData.config.bookingPlatform);
        if (!hostingPlatform && refreshData.config.hostingPlatform) setHostingPlatform(refreshData.config.hostingPlatform);
        if (!emailPlatform && refreshData.config.emailPlatform) setEmailPlatform(refreshData.config.emailPlatform);
        if (!heroVideoUrl.trim() && refreshData.config.heroVideoUrl) setHeroVideoUrl(refreshData.config.heroVideoUrl);
        setSuggestions(refreshData.suggestions ?? {});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to crawl domain";
      setError(msg);
    } finally {
      setCrawling(false);
    }
  };

  // Connect in place instead of leaving for Settings → Apps: that page
  // saves to the workspace's shared store without attaching the key to
  // this client or running its harvest. CredentialRow covers pasting a
  // key, reusing a saved one, and OAuth sign-in (which returns here with
  // this client attached), all of which harvest.
  const [connectOpen, setConnectOpen] = useState<null | "booking" | "email" | "hosting">(null);
  const handleConnectIntegration = () => setConnectOpen((open) => (open === "booking" ? null : "booking"));

  const handleArmAndSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        buyerDomain: primaryDomain || inputDomain,
        offerName: offerName.trim(),
        offerPrice: offerPrice.trim(),
        offerVertical: offerVertical.trim(),
        offerIcp: offerIcp.trim(),
        trafficTemperature,
        castingChoice,
        bookingPlatform,
        hostingPlatform,
        emailPlatform,
        heroVideoUrl: heroVideoUrl.trim(),
        briefLandingDestination: briefLandingDestination || undefined,
        slackWebhookUrl: slackWebhookUrl.trim(),
      };

      const res = await fetch(`/api/engagements/${engagementId}/bridges/pin-down`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to arm Showtime engine");

      toast.success(`Saved Showtime setup for ${offerName || buyer}. Check each worker's status below.`);
      setStatusRefresh((n) => n + 1);
      router.refresh();
      startTour("showtime");

      if (onSaved) onSaved({ runId: data.runId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to arm Showtime engine";
      setError(msg);
      setSaving(false);
    }
  };

  if (loading) return <ConfigFormSkeleton />;

  // Calculate Show Rate Radar Score
  const hasDomain = Boolean(primaryDomain || inputDomain);
  const hasBooking = Boolean(bookingPlatform);
  const hasVideo = Boolean(heroVideoUrl);

  let coverageScore = 20;
  if (hasDomain) coverageScore += 30;
  if (hasBooking) coverageScore += 30;
  if (hasVideo) coverageScore += 20;

  return (
    <div className="w-full space-y-6 text-zinc-100">
      {/* Uncarded Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Showtime Revenue Dossier
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Show rate boost & pre-call intelligence engine for{" "}
            <span className="font-medium text-zinc-200">{offerName || buyer}</span>
          </p>
        </div>

        <button
          onClick={handleArmAndSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Arming Engine...
            </>
          ) : (
            <>
              <Flame className="h-4 w-4" />
              ARM SHOWRATE ENGINE
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

      {/* Data Sources & Radar Coverage Card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Data Sources & Show Rate Radar
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-zinc-400">Show Rate Radar:</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                coverageScore >= 80
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : coverageScore >= 50
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
              }`}
            >
              {coverageScore}% {coverageScore < 80 ? "(Action Recommended)" : "(High Radar)"}
            </span>
          </div>
        </div>

        <p className="text-xs text-zinc-400">
          Crawl your funnel domain or connect your booking calendar (Calendly, Cal.com, GHL) to auto-generate personalized confirmation pages and pre-call briefs.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Domain Crawl Input */}
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="https://company.com/book"
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={handleManualCrawl}
              disabled={crawling || !inputDomain.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 cursor-pointer shrink-0"
            >
              {crawling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {crawling ? "Crawling..." : "Crawl Funnel"}
            </button>
          </div>

          {/* Booking Calendar Integration Link */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5">
            <span className="text-xs text-zinc-400 truncate">
              {bookingPlatform ? `Calendar: ${bookingPlatform.toUpperCase()}` : "Calendly / Cal.com / GoHighLevel / OnceHub"}
            </span>
            <button
              type="button"
              onClick={handleConnectIntegration}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:underline cursor-pointer shrink-0"
            >
              <Link className="h-3.5 w-3.5" />
              {bookingPlatform ? "Manage" : "+ Connect"}
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Discovered Offer Profile */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 pb-3">
          Auto-Discovered Offer Profile
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Offer & Pricing */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-amber-400" /> Offer & Market Positioning
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">What they sell</label>
                <input
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="Offer name"
                  className={FIELD_CLASS}
                />
                <FactSuggestionChip engagementId={engagementId} factKey="offerName" suggestion={suggestions.offerName} currentValue={offerName} onUse={(v) => setOfferName(String(v))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">Price</label>
                  <input value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="e.g. $2,500" className={FIELD_CLASS} />
                  <FactSuggestionChip engagementId={engagementId} factKey="offerPrice" suggestion={suggestions.offerPrice} currentValue={offerPrice} onUse={(v) => setOfferPrice(String(v))} />
                  {!offerPrice.trim() && (
                    <FactSuggestionList
                      engagementId={engagementId}
                      factKey="whopPlanOptions"
                      suggestion={suggestions.whopPlanOptions}
                      currentItems={[]}
                      prompt="which plan is this offer?"
                      itemLabel={(p) => {
                        const plan = p as { name?: string; price?: string };
                        return plan.name ? `${plan.name}: ${plan.price}` : String(plan.price ?? "");
                      }}
                      onAdd={(p) => setOfferPrice(String((p as { price?: string }).price ?? ""))}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">Vertical</label>
                  <select value={offerVertical} onChange={(e) => setOfferVertical(e.target.value)} className={FIELD_CLASS}>
                    <option value="">Not set</option>
                    {VERTICALS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                    {offerVertical && !isListedVertical(offerVertical) && <option value={offerVertical}>{offerVertical} (not on the list)</option>}
                  </select>
                  <FactSuggestionChip
                    engagementId={engagementId}
                    factKey="offerVertical"
                    suggestion={suggestions.offerVertical}
                    currentValue={verticalLabel(offerVertical)}
                    display={(v) => verticalLabel(String(v))}
                    onUse={(v) => setOfferVertical(String(v))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">Ideal customer</label>
                <textarea value={offerIcp} onChange={(e) => setOfferIcp(e.target.value)} rows={2} placeholder="Who this offer is for" className={FIELD_CLASS} />
                <FactSuggestionChip engagementId={engagementId} factKey="offerIcp" suggestion={suggestions.offerIcp} currentValue={offerIcp} onUse={(v) => setOfferIcp(String(v))} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">How leads usually arrive</label>
                <select
                  value={trafficTemperature}
                  onChange={(e) => setTrafficTemperature(e.target.value as "" | "cold" | "warm" | "hot")}
                  className={FIELD_CLASS}
                >
                  <option value="">Not set</option>
                  <option value="cold">Cold (Unfamiliar leads, heavy problem education)</option>
                  <option value="warm">Warm (List/Retargeted leads, familiar with brand)</option>
                  <option value="hot">Hot (High-intent leads, direct comparison/pricing)</option>
                </select>
                <FactSuggestionChip
                  engagementId={engagementId}
                  factKey="trafficTemperature"
                  suggestion={suggestions.trafficTemperature}
                  currentValue={trafficTemperature}
                  onUse={(v) => setTrafficTemperature(v as "cold" | "warm" | "hot")}
                />
              </div>
            </div>
          </div>

          {/* Booking & Hosting Infrastructure */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-400" /> Funnel Infrastructure
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Booking Platform:</span>
                <span className={`font-medium ${bookingPlatform ? "text-amber-400" : "text-zinc-500"}`}>
                  {bookingPlatform ? bookingPlatform.toUpperCase() : "⚠️ None Detected"}
                </span>
              </div>
              <FactSuggestionChip
                engagementId={engagementId}
                factKey="bookingPlatform"
                suggestion={suggestions.bookingPlatform}
                currentValue={bookingPlatform ?? ""}
                onUse={(v) => setBookingPlatform(String(v))}
              />
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Hosting Target:</span>
                <span className="font-mono text-zinc-200">{hostingPlatform || "Not set"}</span>
              </div>
              <FactSuggestionChip
                engagementId={engagementId}
                factKey="hostingPlatform"
                suggestion={suggestions.hostingPlatform}
                currentValue={hostingPlatform ?? ""}
                onUse={(v) => setHostingPlatform(String(v))}
              />
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Email / CRM:</span>
                <span className="font-mono text-zinc-200">{emailPlatform || "Not set"}</span>
              </div>
              <FactSuggestionChip
                engagementId={engagementId}
                factKey="emailPlatform"
                suggestion={suggestions.emailPlatform}
                currentValue={emailPlatform ?? ""}
                onUse={(v) => setEmailPlatform(String(v))}
              />
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
                {(["booking", "email", "hosting"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setConnectOpen((open) => (open === kind ? null : kind))}
                    className="text-[11px] font-semibold text-amber-400 hover:underline cursor-pointer"
                  >
                    {connectOpen === kind ? "Close" : `Connect ${kind} account`}
                  </button>
                ))}
              </div>
              {connectOpen && (
                <ConnectPanel
                  engagementId={engagementId}
                  kind={connectOpen}
                  platform={connectOpen === "booking" ? bookingPlatform : connectOpen === "email" ? emailPlatform : hostingPlatform}
                  onPickPlatform={(value) =>
                    connectOpen === "booking" ? setBookingPlatform(value) : connectOpen === "email" ? setEmailPlatform(value) : setHostingPlatform(value)
                  }
                  onDone={() => setConnectOpen(null)}
                />
              )}
              {confirmationPageUrl && (
                <div className="pt-1">
                  <a
                    href={confirmationPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                  >
                    View Active Confirmation Page <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Traffic Temperature & Voice */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Lead Temperature & Casting
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Traffic Temperature:</span>
                <span className={`font-medium uppercase ${trafficTemperature ? "text-amber-400" : "text-zinc-500"}`}>{trafficTemperature || "Not set"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Casting Choice:</span>
                <span className="font-medium text-zinc-200">{castingChoice.replace(/_/g, " ")}</span>
              </div>
            </div>
          </div>

          {/* Pre-Call Brief Destination */}
          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <div className="text-[11px] font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> Brief Delivery Destination
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Channel:</span>
                <span className={`font-medium uppercase ${briefLandingDestination ? "text-emerald-400" : "text-zinc-500"}`}>
                  {briefLandingDestination === "crm_note" ? "CRM note" : briefLandingDestination || "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Hero Video:</span>
                <span className={`font-mono ${heroVideoUrl ? "text-zinc-200" : "text-zinc-500"}`}>
                  {heroVideoUrl ? "Configured" : "None Set"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <WorkerStatusGrid engagementId={engagementId} productId="showtime" refreshKey={statusRefresh} title="Showtime workers for this client" />
      </div>

      {/* Scenario Tuning Collapsible */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCustomizer(!showCustomizer)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-800/30 transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-amber-400" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">Customize Setup / Scenario Tuning</div>
              <div className="text-[11px] text-zinc-400">
                Tweak on-camera casting, hero video URLs, and where pre-call briefs are delivered.
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
            {/* Scenario Card 1: Traffic Temperature & Casting */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  1. On-Camera Casting
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    On-Camera Casting Choice
                  </label>
                  <select
                    value={castingChoice}
                    onChange={(e) => setCastingChoice(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="founder_on_camera">Founder / Owner on camera</option>
                    <option value="coach_on_camera">Coach or practitioner on camera</option>
                    <option value="animation">Product video / Brand motion graphics</option>
                    <option value="other">Other / Team voice</option>
                  </select>
                  <FactSuggestionChip
                    engagementId={engagementId}
                    factKey="castingChoice"
                    suggestion={suggestions.castingChoice}
                    currentValue={castingChoice}
                    display={(v) => String(v).replace(/_/g, " ")}
                    onUse={(v) => setCastingChoice(String(v))}
                  />
                </div>
              </div>
            </div>

            {/* Scenario Card 2: Hero Video & Confirmation Page */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-purple-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  2. {anySkillDisplayName("pin-down")} Hero Video & Page Link
                </h3>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-zinc-300">
                  Hero Video Embed URL (YouTube, Wistia, Vimeo, Loom)
                </label>
                <input
                  type="url"
                  value={heroVideoUrl}
                  onChange={(e) => setHeroVideoUrl(e.target.value)}
                  placeholder="https://player.vimeo.com/video/12345678"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <FactSuggestionChip
                  engagementId={engagementId}
                  factKey="heroVideoUrl"
                  suggestion={suggestions.heroVideoUrl}
                  currentValue={heroVideoUrl}
                  onUse={(v) => setHeroVideoUrl(String(v))}
                />
              </div>
            </div>

            {/* Scenario Card 3: Pre-Call Brief Delivery */}
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                <h3 className="text-xs font-semibold text-zinc-200">
                  3. {anySkillDisplayName("pre-call-read")} Brief Destination
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Delivery Channel
                  </label>
                  <select
                    value={briefLandingDestination}
                    onChange={(e) => setBriefLandingDestination(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">Not set</option>
                    <option value="slack">Slack Webhook Channel</option>
                    <option value="crm_note">CRM note (HubSpot, Klaviyo or GoHighLevel)</option>
                  </select>
                  <FactSuggestionChip
                    engagementId={engagementId}
                    factKey="briefLandingDestination"
                    suggestion={suggestions.briefLandingDestination}
                    currentValue={briefLandingDestination}
                    display={(v) => (v === "crm_note" ? "CRM note" : String(v))}
                    onUse={(v) => setBriefLandingDestination(String(v))}
                  />
                </div>

                {briefLandingDestination === "slack" && (
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                      Slack Webhook URL
                    </label>
                    <input
                      type="url"
                      value={slackWebhookUrl}
                      onChange={(e) => setSlackWebhookUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}
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
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-5 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
        >
          {saving ? "Arming Engine..." : "ARM SHOWRATE ENGINE"}
        </button>
      </div>
    </div>
  );
}
function ConnectPanel({
  engagementId,
  kind,
  platform,
  onPickPlatform,
  onDone,
}: {
  engagementId: string;
  kind: "booking" | "email" | "hosting";
  platform: string | null;
  onPickPlatform: (value: string) => void;
  onDone: () => void;
}) {
  const options = PLATFORM_OPTIONS[kind];
  const label = options.find((o) => o.value === platform)?.label ?? platform ?? "";
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
      <label className="block text-[11px] font-medium text-zinc-300">
        {kind === "booking" ? "Booking calendar" : kind === "email" ? "Email / CRM" : "Where the confirmation page is hosted"}
      </label>
      <select value={platform ?? ""} onChange={(e) => onPickPlatform(e.target.value)} className={FIELD_CLASS}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {platform && platform !== "plain_html" && (
        <CredentialRow engagementId={engagementId} provider={platform} label={`${label} key`} embedded onSaved={onDone} onRequestClose={onDone} />
      )}
      <p className="text-[10.5px] text-zinc-500">The platform choice is saved when you save this dossier; the key is saved right away.</p>
    </div>
  );
}
