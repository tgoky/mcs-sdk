"use client";

// Phase 3's "preview-first entry point" (see the "Worker Onboarding &
// Gating: Plan" doc's Worker Dossier section): "the preview-first
// placeholder result before any real input." Pin-Down is the one worker
// with a real, deterministic, reusable generator for its artifact —
// previewTemplateHtml() already renders a confirmation page from whatever
// real fields are filled in, falling back to sample copy for anything
// still blank (see TemplatePicker's own comment on the same mechanic,
// which this reuses rather than re-implements).
//
// Placed above the ProgressiveFlow, not inside it — visible from the
// moment the form loads, before any of the flow's own steps are touched.
// Read-only: selecting a different template still happens in the
// "Confirmation page" step's TemplatePicker; this always reflects
// whichever template is currently selected there.

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { previewTemplateHtml, TEMPLATE_META, type TemplateId, type PageBuilderInput } from "@/features/pin-down/server/templates";
import type { FormData as WizardFormData } from "@/app/dashboard/engagements/new/types";

const PREVIEW_W = 900;
const PREVIEW_H = 1400;
const THUMB_SCALE = 0.32;

export function PinDownLivePreview({
  form,
  confirmationPageTemplate,
}: {
  form: WizardFormData;
  confirmationPageTemplate: TemplateId;
}) {
  const sampleInput = useMemo<PageBuilderInput>(
    () => ({
      buyer: form.buyerName || "Alex Rivera",
      offerDetails: {
        name: form.offerName || "Growth Accelerator",
        price: form.offerPrice || "8000",
        icp: form.offerIcp || "B2B SaaS founders",
        traffic_temperature: (form.trafficTemperature as "cold" | "warm" | "hot") || "warm",
      },
      topCallQuestions: form.topCallQuestions
        ? form.topCallQuestions.split("\n").map((q) => q.trim()).filter(Boolean)
        : [],
      prospectMeets: form.prospectMeets || "founder",
      existingProof: {
        testimonials: form.testimonials.filter((t) => t.name && t.role && t.quote),
      },
      designSignal: form.designSignal,
    }),
    [
      form.buyerName,
      form.offerName,
      form.offerPrice,
      form.offerIcp,
      form.trafficTemperature,
      form.topCallQuestions,
      form.prospectMeets,
      form.testimonials,
      form.designSignal,
    ]
  );

  const html = useMemo(() => previewTemplateHtml(sampleInput, confirmationPageTemplate), [sampleInput, confirmationPageTemplate]);
  const meta = TEMPLATE_META[confirmationPageTemplate];
  const hasRealOffer = Boolean(form.offerName && form.offerPrice);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">{meta.name} — live preview</span>
        </div>
        {!hasRealOffer && (
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">using placeholder offer details</span>
        )}
      </div>
      <div className="relative overflow-hidden bg-zinc-100 dark:bg-zinc-900" style={{ height: PREVIEW_H * THUMB_SCALE }}>
        <div
          className="absolute top-0 left-1/2"
          style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `translateX(-50%) scale(${THUMB_SCALE})`, transformOrigin: "top center" }}
        >
          <iframe
            title="Confirmation page live preview"
            srcDoc={html}
            className="border-0"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <div className="absolute inset-0" />
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
        This updates as the offer details on file change and as a different design is picked below — nothing here is
        published until Pin-Down actually runs.
      </p>
    </div>
  );
}
