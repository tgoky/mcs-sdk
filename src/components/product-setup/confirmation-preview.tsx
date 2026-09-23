"use client";

// src/components/product-setup/confirmation-preview.tsx
//
// The confirmation page this client's bookers will see, rendered from the
// same template builder Pin-Down publishes with, using the offer and brand
// look on this screen. It re-renders as the sentence above it is edited.

import { useMemo } from "react";
import { previewTemplateHtml, isTemplateId, DEFAULT_TEMPLATE, type PageBuilderInput } from "@/features/pin-down/server/templates";

const PAGE_W = 900;
const PAGE_H = 1400;

export function ConfirmationPreview({
  buyer,
  offerName,
  offerPrice,
  offerIcp,
  trafficTemperature,
  heroVideoUrl,
  designSignal,
  template,
  width = 300,
}: {
  buyer: string;
  offerName: string;
  offerPrice: string;
  offerIcp: string;
  trafficTemperature: string;
  heroVideoUrl: string;
  designSignal: unknown;
  template: string;
  width?: number;
}) {
  const scale = width / PAGE_W;
  const html = useMemo(() => {
    const input: PageBuilderInput = {
      buyer,
      offerDetails: {
        name: offerName || "Your offer",
        price: offerPrice,
        icp: offerIcp,
        traffic_temperature: trafficTemperature === "cold" || trafficTemperature === "hot" ? trafficTemperature : "warm",
      },
      heroVideoUrl: heroVideoUrl || undefined,
      designSignal: (designSignal ?? undefined) as PageBuilderInput["designSignal"],
    };
    try {
      return previewTemplateHtml(input, isTemplateId(template) ? template : DEFAULT_TEMPLATE);
    } catch {
      return "";
    }
  }, [buyer, offerName, offerPrice, offerIcp, trafficTemperature, heroVideoUrl, designSignal, template]);

  if (!html) return null;
  return (
    <div
      className="relative overflow-hidden rounded-xl bg-white shadow-elevation-2 ring-1 ring-black/10 dark:ring-white/10"
      style={{ width, height: Math.round(PAGE_H * scale * 0.72) }}
    >
      <iframe
        title="Confirmation page preview"
        srcDoc={html}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}
