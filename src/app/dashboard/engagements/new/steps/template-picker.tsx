"use client";

import { useMemo, useState } from "react";
import { Maximize2, Check, X } from "lucide-react";
import {
  previewTemplateHtml,
  TEMPLATE_META,
  TEMPLATE_IDS,
  type TemplateId,
  type PageBuilderInput,
} from "@/features/pin-down/server/templates";
import type { FormData } from "../types";

interface Props {
  form: FormData;
  onSelect: (templateId: TemplateId) => void;
}

// Fixed render size for the source iframe, then scaled down to fit the
// thumbnail. Fixed rather than measured off the real card width (no
// ResizeObserver needed) — the thumbnail is centered inside its card, so a
// few px of slack on either side at different breakpoints is invisible.
const PREVIEW_W = 900;
const PREVIEW_H = 1400;
const THUMB_SCALE = 0.3;

export function TemplatePicker({ form, onSelect }: Props) {
  const [previewOpen, setPreviewOpen] = useState<TemplateId | null>(null);

  // Builds live previews from whatever the buyer has actually filled in so
  // far — falling back to sample copy only for fields still blank — so
  // what's shown here is honest about what will really publish, not just
  // decorative stock content.
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
        ? form.topCallQuestions
            .split("\n")
            .map((q) => q.trim())
            .filter(Boolean)
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

  const previews = useMemo(
    () =>
      Object.fromEntries(TEMPLATE_IDS.map((id) => [id, previewTemplateHtml(sampleInput, id)])) as Record<
        TemplateId,
        string
      >,
    [sampleInput]
  );

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {TEMPLATE_IDS.map((id) => {
          const meta = TEMPLATE_META[id];
          const selected = form.confirmationPageTemplate === id;
          return (
            <div
              key={id}
              onClick={() => onSelect(id)}
              className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all bg-background ${
                selected
                  ? "border-indigo-500 ring-2 ring-indigo-500/25"
                  : "border-border hover:border-indigo-400/60"
              }`}
            >
              <div
                className="relative overflow-hidden bg-zinc-100 dark:bg-zinc-900"
                style={{ height: PREVIEW_H * THUMB_SCALE }}
              >
                <div
                  className="absolute top-0 left-1/2"
                  style={{
                    width: PREVIEW_W,
                    height: PREVIEW_H,
                    transform: `translateX(-50%) scale(${THUMB_SCALE})`,
                    transformOrigin: "top center",
                  }}
                >
                  <iframe
                    title={`${meta.name} preview`}
                    srcDoc={previews[id]}
                    className="border-0"
                    style={{ width: PREVIEW_W, height: PREVIEW_H }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
                {/* Intercepts clicks so the iframe itself never eats the
                    select/preview interactions underneath it. */}
                <div className="absolute inset-0" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewOpen(id);
                  }}
                  className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/65 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Full preview of ${meta.name}`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {selected && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>

              <div className="p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {meta.swatch.map((c, i) => (
                    <span
                      key={i}
                      className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{meta.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">{meta.tagline}</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-600 mt-1">{meta.bestFor}</p>
              </div>
            </div>
          );
        })}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-6"
          onClick={() => setPreviewOpen(null)}
        >
          <div
            className="bg-background rounded-lg overflow-hidden max-w-2xl w-full h-[85vh] shadow-2xl border border-border flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {TEMPLATE_META[previewOpen].name}
                </p>
                <p className="text-[11px] text-zinc-500">{TEMPLATE_META[previewOpen].tagline}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(previewOpen);
                    setPreviewOpen(null);
                  }}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
                >
                  Use this template
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(null)}
                  className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  aria-label="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe title="Full preview" srcDoc={previews[previewOpen]} className="w-full flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
