"use client";

// Same treatment as voice-capture-live-preview.tsx — the offer message
// already uses real {discount}/{months} template tokens
// (cancellation-save-offer-service.ts substitutes them at send time), so
// substituting the typed values here is a real preview, not a mockup.

import { Sparkles } from "lucide-react";

export function WhopCancellationSaveOfferLivePreview({
  discountPercentage,
  durationMonths,
  message,
}: {
  discountPercentage: string;
  durationMonths: string;
  message: string;
}) {
  const usingPlaceholders = !message.trim();
  const discount = discountPercentage.trim() || "20";
  const duration = durationMonths.trim() || "3";
  const template = message.trim() || "Before you go — stay for {months} more month(s) at {discount}% off?";
  // Single (non-global) replace, matching cancellation-save-offer-service.ts's
  // own `.replace("{discount}", ...).replace("{months}", ...)` exactly — a
  // repeated token in a custom message only gets substituted once there,
  // so this preview should show the same behavior, not a "nicer" version.
  const rendered = template.replace("{discount}", discount).replace("{months}", duration);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">Save-offer message — live preview</span>
        </div>
        {usingPlaceholders && (
          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0">using placeholder copy</span>
        )}
      </div>
      <div className="p-3 bg-white dark:bg-zinc-950">
        <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{rendered}</p>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-600 leading-relaxed border-t border-zinc-100 dark:border-zinc-900">
        {"{discount}"} and {"{months}"} substituted exactly as cancellation-save-offer-service.ts does at send time —
        this is the real copy a member would see, still awaiting operator approval before it's ever shown.
      </p>
    </div>
  );
}
