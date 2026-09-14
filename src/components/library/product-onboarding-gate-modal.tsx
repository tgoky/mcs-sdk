"use client";

// Shown wherever an Enable action (worker-card.tsx, workers-panel.tsx's
// toggle, EnablePileOnModal) discovers a skill's product hasn't
// completed its own onboarding — see src/lib/product-onboarding.ts's
// header for the full "why". Built on the app's existing Modal (same
// createPortal + fade/zoom motion every other overlay in this app
// already uses — dropdown-menu.tsx, popover.tsx, sheet.tsx) so this
// reads as the same system instead of a one-off.
//
// "Skip for now" persists the dismissal (POST .../skip-onboarding) so
// the caller can stop popping this modal for every other skill in the
// same product this session — see onSkipped. It never enables anything
// and never touches whether the product is actually onboarded: the
// server-side gate this modal is a response to keeps refusing a bare
// enable regardless of whether skip was ever clicked.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Wand2 } from "lucide-react";
import { Modal } from "@/components/modal";
import type { ProductId } from "@/lib/product-catalog";

export function ProductOnboardingGateModal({
  engagementId,
  productId,
  workerName,
  onboardingWorkerName,
  bridgeHref,
  onClose,
  onSkipped,
}: {
  engagementId: string;
  productId: ProductId;
  workerName: string;
  onboardingWorkerName: string;
  bridgeHref: string;
  onClose: () => void;
  onSkipped: () => void;
}) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  async function handleSkip() {
    setSkipping(true);
    setSkipError(null);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/products/${productId}/skip-onboarding`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't save that — try again.");
      onSkipped();
      onClose();
    } catch (cause) {
      setSkipError(cause instanceof Error ? cause.message : "Couldn't save that — try again.");
      setSkipping(false);
    }
  }

  return (
    <Modal title="Setup needed" icon={Wand2} onClose={onClose} maxWidthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <strong className="font-bold text-zinc-900 dark:text-white">{onboardingWorkerName}</strong> needs to run for
          this client before <strong className="font-bold text-zinc-900 dark:text-white">{workerName}</strong> means
          anything — every other skill in this product reads what it sets up.
        </p>
        {skipError && <p className="text-xs text-rose-600 dark:text-rose-400">{skipError}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => router.push(bridgeHref)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 px-3.5 py-2 text-xs font-bold text-white dark:text-zinc-900 transition-colors cursor-pointer"
          >
            Finish setup <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={skipping}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
          >
            {skipping ? "Skipping…" : "Skip for now"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
