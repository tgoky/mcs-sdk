"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";
import { TriggerSkillButton } from "./trigger-skill-button";
import { Loader2, Plus, Trash2, RefreshCw } from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  company?: string;
  quote: string;
  sourceUrl?: string;
}

export interface ClientDetailsDrawerData {
  engagementId: string;
  buyer: string;
  offerDetails: {
    name: string;
    price: string;
    icp: string;
    traffic_temperature: "cold" | "warm" | "hot";
    hybrid_mode_enabled: boolean;
    vertical?: string;
  } | null;
  topCallQuestions: string[] | null;
  topObjections: string[] | null;
  prospectMeets: string | null;
  castingChoice: string | null;
  rawVoiceCorpus: string | null;
  existingProof: { testimonials: Testimonial[] } | null;
  confirmationPageTemplate: string;
  notificationPackSelections: string[];
  hasAdCreativeBriefs: boolean;
  hasScriptPack: boolean;
}

// Matches src/features/leak-map/server/notification-pack.ts's NOTIFICATION_PACK
// exactly (id + label only — that file also has DB-touching code that isn't
// safe to import into a client component, so the display copy is
// duplicated here rather than shared).
const NOTIFICATION_PACK_OPTIONS = [
  { id: "low_identity_confidence", label: "Identity match confidence dropping" },
  { id: "show_rate_drop", label: "Booking show-rate falling" },
  { id: "email_open_rate_drop", label: "Email open-rate falling" },
  { id: "pipeline_win_rate_drop", label: "CRM pipeline win-rate falling" },
  { id: "brief_volume_drop", label: "Brief delivery volume dropping" },
];

const TRAFFIC_TEMPERATURE_ITEMS: DropdownItem<"cold" | "warm" | "hot">[] = [
  { key: "cold", label: "Cold — mostly unaware of the problem" },
  { key: "warm", label: "Warm — aware, comparing options" },
  { key: "hot", label: "Hot — ready to buy, comparing vendors" },
];

const CASTING_CHOICE_ITEMS: DropdownItem<string>[] = [
  { key: "founder_on_camera", label: "Founder on camera" },
  { key: "coach_on_camera", label: "Coach on camera" },
  { key: "animation", label: "Animation" },
  { key: "other", label: "Other" },
];

const CONFIRMATION_TEMPLATE_ITEMS: DropdownItem<string>[] = [
  { key: "contract", label: "Contract — formal, signature-style" },
  { key: "goldenticket", label: "Golden Ticket — celebratory, exclusive" },
  { key: "tentativehold", label: "Tentative Hold — urgency-driven" },
  { key: "assessment", label: "Assessment — diagnostic framing" },
  { key: "minimalist", label: "Minimalist — clean, no-frills" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 py-5 border-b border-zinc-800 last:border-b-0">
      <div>
        <h3 className="text-xs font-semibold text-white tracking-wide uppercase">{title}</h3>
        {description && <p className="text-[11px] text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-zinc-300 block mb-1.5">{children}</label>;
}

const inputClass =
  "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 transition-colors";

/**
 * Edits the onboarding-captured client data EditStackSettings deliberately
 * doesn't cover — offer, voice/proof, prospect-research questions,
 * confirmation page template, and notification packs. See
 * /api/engagements/[id]/details for the endpoint this saves to.
 *
 * A drawer rather than a modal on purpose — this covers noticeably more
 * ground than the connection-settings modal, and needed the extra height
 * to not feel cramped.
 */
export function ClientDetailsDrawer({
  data,
  isOpen,
  onClose,
  onSaved,
}: {
  data: ClientDetailsDrawerData;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [offerName, setOfferName] = useState(data.offerDetails?.name ?? "");
  const [offerPrice, setOfferPrice] = useState(data.offerDetails?.price ?? "");
  const [offerIcp, setOfferIcp] = useState(data.offerDetails?.icp ?? "");
  const [offerVertical, setOfferVertical] = useState(data.offerDetails?.vertical ?? "");
  const [trafficTemperature, setTrafficTemperature] = useState<"cold" | "warm" | "hot">(
    data.offerDetails?.traffic_temperature ?? "warm"
  );
  const [hybridMode, setHybridMode] = useState(data.offerDetails?.hybrid_mode_enabled ?? false);

  const [topCallQuestions, setTopCallQuestions] = useState((data.topCallQuestions ?? []).join("\n"));
  const [topObjections, setTopObjections] = useState((data.topObjections ?? []).join("\n"));
  const [prospectMeets, setProspectMeets] = useState(data.prospectMeets ?? "");
  const [castingChoice, setCastingChoice] = useState(data.castingChoice ?? "founder_on_camera");
  const [rawVoiceCorpus, setRawVoiceCorpus] = useState(data.rawVoiceCorpus ?? "");
  const [testimonials, setTestimonials] = useState<Testimonial[]>(
    data.existingProof?.testimonials?.length ? data.existingProof.testimonials : [{ name: "", role: "", company: "", quote: "", sourceUrl: "" }]
  );
  const [confirmationPageTemplate, setConfirmationPageTemplate] = useState(data.confirmationPageTemplate);
  const [notificationPackSelections, setNotificationPackSelections] = useState<Set<string>>(
    new Set(data.notificationPackSelections)
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [regeneratingBriefs, setRegeneratingBriefs] = useState(false);
  const [regeneratingScripts, setRegeneratingScripts] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);

  function updateTestimonial(index: number, field: keyof Testimonial, value: string) {
    setTestimonials((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function toggleNotificationPack(id: string) {
    setNotificationPackSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/engagements/${data.engagementId}/details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerDetails: {
            name: offerName,
            price: offerPrice,
            icp: offerIcp,
            vertical: offerVertical || undefined,
            traffic_temperature: trafficTemperature,
            hybrid_mode_enabled: hybridMode,
          },
          topCallQuestions: topCallQuestions.split("\n").map((q) => q.trim()).filter(Boolean),
          topObjections: topObjections.split("\n").map((o) => o.trim()).filter(Boolean),
          prospectMeets,
          castingChoice,
          rawVoiceCorpus,
          existingProof: { testimonials },
          confirmationPageTemplate,
          notificationPackSelections: [...notificationPackSelections],
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error ?? "Failed to save changes.");
      }
      setSaveSuccess(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate(kind: "briefs" | "scripts") {
    const setLoading = kind === "briefs" ? setRegeneratingBriefs : setRegeneratingScripts;
    const path = kind === "briefs" ? "ad-creative-briefs" : "scripts";
    setLoading(true);
    setRegenerateMessage(null);
    try {
      const res = await fetch(`/api/engagements/${data.engagementId}/regenerate/${path}`, { method: "POST" });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error ?? "Regeneration failed.");
      setRegenerateMessage(kind === "briefs" ? "Ad creative briefs regenerated." : "Scripts regenerated.");
    } catch (err) {
      setRegenerateMessage(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit client details — {data.buyer}</SheetTitle>
          <SheetDescription>
            Offer, voice, prospect research, and notification settings captured during onboarding. Connection settings and
            credentials live under &quot;Edit stack settings&quot; and &quot;Update credentials&quot; instead.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Section title="Offer">
            <div>
              <Label>Offer name</Label>
              <input className={inputClass} value={offerName} onChange={(e) => setOfferName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price</Label>
                <input className={inputClass} value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="e.g. $2,500" />
              </div>
              <div>
                <Label>Vertical (optional)</Label>
                <input className={inputClass} value={offerVertical} onChange={(e) => setOfferVertical(e.target.value)} placeholder="e.g. coaching" />
              </div>
            </div>
            <div>
              <Label>Ideal customer profile</Label>
              <textarea className={inputClass} rows={2} value={offerIcp} onChange={(e) => setOfferIcp(e.target.value)} />
            </div>
            <div>
              <Label>Traffic temperature</Label>
              <Dropdown
                items={TRAFFIC_TEMPERATURE_ITEMS}
                selectedKey={trafficTemperature}
                onSelect={(key) => setTrafficTemperature(key)}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="hybridMode"
                checked={hybridMode}
                onChange={(e) => setHybridMode(e.target.checked)}
                className="w-4 h-4 rounded-sm cursor-pointer border border-zinc-700"
              />
              <label htmlFor="hybridMode" className="text-xs text-zinc-300 cursor-pointer">
                Hybrid mode enabled
              </label>
            </div>
          </Section>

          <Section
            title="Voice & proof"
            description="Feeds future call briefs immediately. Already-generated scripts and ad creative briefs need the regenerate actions below to pick up changes here."
          >
            <div>
              <Label>Raw voice corpus</Label>
              <textarea className={inputClass} rows={4} value={rawVoiceCorpus} onChange={(e) => setRawVoiceCorpus(e.target.value)} />
            </div>
            <div>
              <Label>Who prospects meet on the call</Label>
              <input className={inputClass} value={prospectMeets} onChange={(e) => setProspectMeets(e.target.value)} placeholder="e.g. founder" />
            </div>
            <div>
              <Label>Casting choice</Label>
              <Dropdown items={CASTING_CHOICE_ITEMS} selectedKey={castingChoice} onSelect={(key) => setCastingChoice(key)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Testimonials</Label>
                <button
                  type="button"
                  onClick={() => setTestimonials((prev) => [...prev, { name: "", role: "", company: "", quote: "", sourceUrl: "" }])}
                  className="text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-3">
                {testimonials.map((t, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 p-3 space-y-2 relative">
                    <button
                      type="button"
                      onClick={() => setTestimonials((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute right-2 top-2 text-zinc-600 hover:text-rose-400 cursor-pointer"
                      title="Remove testimonial"
                    >
                      <Trash2 size={13} />
                    </button>
                    <div className="grid grid-cols-2 gap-2 pr-6">
                      <input
                        className={inputClass}
                        placeholder="Name"
                        value={t.name}
                        onChange={(e) => updateTestimonial(i, "name", e.target.value)}
                      />
                      <input
                        className={inputClass}
                        placeholder="Role"
                        value={t.role}
                        onChange={(e) => updateTestimonial(i, "role", e.target.value)}
                      />
                    </div>
                    <input
                      className={inputClass}
                      placeholder="Company (optional)"
                      value={t.company ?? ""}
                      onChange={(e) => updateTestimonial(i, "company", e.target.value)}
                    />
                    <textarea
                      className={inputClass}
                      rows={2}
                      placeholder="Quote"
                      value={t.quote}
                      onChange={(e) => updateTestimonial(i, "quote", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Prospect research" description="Top call questions read live on every Pre-Call Read brief — no regenerate needed for these two.">
            <div>
              <Label>Top call questions (one per line)</Label>
              <textarea className={inputClass} rows={3} value={topCallQuestions} onChange={(e) => setTopCallQuestions(e.target.value)} />
            </div>
            <div>
              <Label>Top objections (one per line)</Label>
              <textarea className={inputClass} rows={3} value={topObjections} onChange={(e) => setTopObjections(e.target.value)} />
            </div>
          </Section>

          <Section title="Confirmation page template">
            <Dropdown
              items={CONFIRMATION_TEMPLATE_ITEMS}
              selectedKey={confirmationPageTemplate}
              onSelect={(key) => setConfirmationPageTemplate(key)}
            />
            <p className="text-[11px] text-zinc-500">
              Changes which design new confirmation pages use. Doesn&apos;t redeploy an already-live page — that has its own approval
              step.
            </p>
          </Section>

          <Section title="Notification pack">
            <div className="space-y-2">
              {NOTIFICATION_PACK_OPTIONS.map((pack) => (
                <label key={pack.id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationPackSelections.has(pack.id)}
                    onChange={() => toggleNotificationPack(pack.id)}
                    className="w-4 h-4 rounded-sm cursor-pointer border border-zinc-700"
                  />
                  {pack.label}
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="Regenerate generated content"
            description="These fields are baked into content generated once at onboarding — save your changes above first, then regenerate here to apply them."
          >
            <div className="space-y-2">
              <TriggerSkillButton engagementId={data.engagementId} skillName="pre-call-read" label="Run pre-call read now" />
              <TriggerSkillButton engagementId={data.engagementId} skillName="leak-map" label="Run leak-map audit now" />
              <button
                type="button"
                disabled={!data.hasAdCreativeBriefs || regeneratingBriefs}
                onClick={() => handleRegenerate("briefs")}
                className="w-full text-left px-3 py-2 text-[10px] font-mono font-bold tracking-wider rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer inline-flex items-center gap-2"
              >
                {regeneratingBriefs ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {data.hasAdCreativeBriefs ? "REGENERATE AD CREATIVE BRIEFS" : "AD CREATIVE BRIEFS NOT YET GENERATED"}
              </button>
              <button
                type="button"
                disabled={!data.hasScriptPack || regeneratingScripts}
                onClick={() => handleRegenerate("scripts")}
                className="w-full text-left px-3 py-2 text-[10px] font-mono font-bold tracking-wider rounded-sm border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer inline-flex items-center gap-2"
              >
                {regeneratingScripts ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {data.hasScriptPack ? "REGENERATE HERO/BREAKOUT SCRIPTS" : "SCRIPTS NOT YET GENERATED"}
              </button>
              {regenerateMessage && <p className="text-[11px] text-zinc-400">{regenerateMessage}</p>}
              <p className="text-[11px] text-zinc-600">
                The confirmation page itself isn&apos;t regenerated here — its live deploy requires the approval step under Edit stack
                settings.
              </p>
            </div>
          </Section>
        </SheetBody>

        <SheetFooter>
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="text-xs">
              {saveError && <span className="text-rose-400">{saveError}</span>}
              {saveSuccess && !saveError && <span className="text-emerald-400">Saved.</span>}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
