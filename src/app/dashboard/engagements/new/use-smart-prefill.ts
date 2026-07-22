import { useState, type Dispatch, type SetStateAction } from "react";
import type { FormData } from "./types";

// Pin-Down recovery gap 1 — smart pre-fill from the client's marketing
// domain. Crawls the domain and suggests values for the Offer step;
// review-and-edit stays with the user before anything gets submitted.
export function useSmartPrefill(setForm: Dispatch<SetStateAction<FormData>>) {
  const [prefillDomain, setPrefillDomain] = useState("");
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefillNotes, setPrefillNotes] = useState<string[]>([]);

  async function runSmartPrefill() {
    if (!prefillDomain.trim()) return;
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
        existingConfirmationPageUrl?: string;
        detectedBookingPlatform?: string;
        notes: string[];
      };
      setForm((f) => ({
        ...f,
        buyerName: p.suggestedBuyerName || f.buyerName,
        offerName: p.suggestedOfferName || f.offerName,
        offerIcp: p.suggestedIcp || f.offerIcp,
        marketingDomain: prefillDomain,
        existingConfirmationPageUrl: p.existingConfirmationPageUrl || f.existingConfirmationPageUrl,
        bookingPlatform: p.detectedBookingPlatform || f.bookingPlatform,
      }));
      setPrefillNotes(p.notes ?? []);
    } catch (e: any) {
      setPrefillError(e.message);
    } finally {
      setPrefillLoading(false);
    }
  }

  return {
    prefillDomain,
    setPrefillDomain,
    prefillLoading,
    prefillError,
    prefillNotes,
    runSmartPrefill,
  };
}
