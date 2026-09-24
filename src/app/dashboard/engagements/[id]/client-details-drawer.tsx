"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { TriggerSkillButton } from "./trigger-skill-button";

export interface ClientDetailsDrawerData {
  engagementId: string;
  buyer: string;
  queuePinWindowHours: number;
  notificationPackSelections: string[];
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
 * This client's dashboard settings: how long fresh items stay pinned, which
 * alerts the notification pack sends, and on-demand runs. Saves to
 * /api/engagements/[id]/details.
 *
 * It used to also edit the offer, brand voice, testimonials, call
 * questions, objections, page design, video and animations. Those are all
 * Show Rate Setup's inputs, and Show Rate Setup's own settings edit them
 * now (showtime-setup.tsx's PinDownSettings), with the rebuild choices
 * and regenerate actions next to them. Two forms for the same values meant
 * the one saved last silently won, and this form sent every field on each
 * save, so saving an alert here put back an offer changed over there.
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
  const [queuePinWindowHours, setQueuePinWindowHours] = useState(String(data.queuePinWindowHours));
  const [notificationPackSelections, setNotificationPackSelections] = useState<Set<string>>(new Set(data.notificationPackSelections));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
        // Only what this drawer shows: anything else would overwrite
        // values saved from Show Rate Setup's settings.
        body: JSON.stringify({
          queuePinWindowHours: Math.min(720, Math.max(1, Math.round(Number(queuePinWindowHours) || data.queuePinWindowHours))),
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent widthClassName="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit client details for {data.buyer}</SheetTitle>
          <SheetDescription>
            Dashboard and alert settings for this client. Connection settings and credentials live under &quot;Edit stack
            settings&quot; and &quot;Update credentials&quot; instead.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <Section title="Offer, voice and confirmation page">
            <p className="text-[12px] leading-relaxed text-zinc-400">
              What they sell, the brand voice, testimonials, call questions and objections, and the page&apos;s design,
              video and animations are Show Rate Setup&apos;s settings now, next to the page they build.
            </p>
            <Link
              href={`/dashboard/engagements/${data.engagementId}/skills/pin-down?configure=1`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white hover:text-zinc-300 transition-colors"
            >
              Open Show Rate Setup settings <ArrowRight size={13} />
            </Link>
          </Section>

          <Section
            title="Queue pin window"
            description="How long a fresh approval or blocker stays pinned to the top of the dashboard's activity list before it normalizes into ordinary date order."
          >
            <div>
              <Label>Hours</Label>
              <input
                type="number"
                min={1}
                max={720}
                className={inputClass}
                value={queuePinWindowHours}
                onChange={(e) => setQueuePinWindowHours(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Default is 48 hours. Widen it if things tend to sit unaddressed longer than that; narrow it if you want the
                list to feel current sooner.
              </p>
            </div>
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

          <Section title="Run now">
            <div className="space-y-2">
              <TriggerSkillButton engagementId={data.engagementId} skillName="pre-call-read" label="Run pre-call read now" />
              <TriggerSkillButton engagementId={data.engagementId} skillName="leak-map" label="Run leak-map audit now" />
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
