import { useState, type Dispatch, type SetStateAction } from "react";
import type { FormData } from "./types";
import type { DesignSignalResult } from "@/features/pin-down/server/design-scraper";

/**
 * Smart pre-fill from the client's marketing domain.
 *
 * Crawls the domain via /api/pin-down/discovery-prefill (which runs
 * voice-scraper's Firecrawl-first pipeline) and suggests values for
 * the Offer step. The scraped corpus is also threaded through to the
 * Voice step so the user doesn't have to manually paste brand copy.
 *
 * Review-and-edit always stays with the user — nothing is auto-submitted.
 */
export function useSmartPrefill(setForm: Dispatch<SetStateAction<FormData>>) {
  const [prefillDomain, setPrefillDomain] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillNotes, setPrefillNotes] = useState<string[]>([]);
  const [lastPrefilledDomain, setLastPrefilledDomain] = useState<string | null>(null);

  async function runSmartPrefill() {
    if (!prefillDomain.trim()) return;

    // Prevent duplicate clicks on the same domain
    if (prefillDomain.trim() === lastPrefilledDomain) return;

    setPrefillLoading(true);
    setPrefillError(null);
    setPrefillNotes([]);

    try {
      const res = await fetch("/api/pin-down/discovery-prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: prefillDomain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Pre-fill failed.");

      const p = data.prefill as {
        suggestedBuyerName?: string;
        suggestedOfferName?: string;
        suggestedIcp?: string;
        scrapedCorpus?: string;
        existingConfirmationPageUrl?: string;
        detectedBookingPlatform?: string;
        designSignal?: DesignSignalResult;
        notes: string[];
      };

      setForm((f) => {
        // If the user changed the domain between click and response,
        // don't apply stale results
        if (prefillDomain.trim() !== f.marketingDomain && f.marketingDomain) {
          return f;
        }

        return {
          ...f,
          buyerName: p.suggestedBuyerName || f.buyerName,
          offerName: p.suggestedOfferName || f.offerName,
          offerIcp: p.suggestedIcp || f.offerIcp,
          marketingDomain: prefillDomain.trim(),
          // Always replace corpus when re-crawling a (new) domain.
          // If the user typed the SAME domain twice, we skip via the
          // lastPrefilledDomain guard above — so this always means
          // "fresh crawl results, trust them."
          rawVoiceCorpus: p.scrapedCorpus && p.scrapedCorpus.length > 50 ? p.scrapedCorpus : "",
          existingConfirmationPageUrl: p.existingConfirmationPageUrl || f.existingConfirmationPageUrl,
          bookingPlatform: p.detectedBookingPlatform || f.bookingPlatform,
          designSignal: p.designSignal ?? f.designSignal,
        };
      });

      setLastPrefilledDomain(prefillDomain.trim());
      setPrefillNotes(p.notes ?? []);
    } catch (e: any) {
      setPrefillError(e.message);
    } finally {
      setPrefillLoading(false);
    }
  }

  function resetPrefill() {
    setPrefillDomain("");
    setPrefillLoading(false);
    setPrefillError(null);
    setPrefillNotes([]);
    setLastPrefilledDomain(null);
  }

  return {
    prefillDomain,
    setPrefillDomain,
    prefillLoading,
    prefillError,
    prefillNotes,
    runSmartPrefill,
    resetPrefill,
  };
}