// src/lib/delivery-receipts-shared.ts
//
// The browser-safe half of lib/delivery-receipts.ts: types and the wording
// the skills list shows. No database or server imports, so client
// components can use it without pulling the server into their bundle.

export interface SkillDeliveryProof {
  /** The latest message the provider confirmed delivered (or, where the
   * provider reports no delivery, accepted with a receipt). */
  lastProvenAt: string | null;
  lastProvenChannel: "sms" | "email" | null;
  /** Sends in the window that came back undelivered or failed, or never
   * reached the provider at all. */
  failedRecently: number;
  sentRecently: number;
  lastFailureReason: string | null;
}

// ── What the skills list says ────────────────────────────────────────────

export interface DeliveryLine {
  text: string;
  tone: "error" | "neutral";
  /** Nothing sent recently got through: the skill is running but not
   * reaching anyone, which the list shows as failed. */
  notDelivering: boolean;
}

export function deliveryLine(proof: SkillDeliveryProof | undefined, since: (iso: string) => string): DeliveryLine | null {
  if (!proof) return null;
  const channel = proof.lastProvenChannel === "email" ? "email" : "text";
  if (proof.sentRecently > 0 && proof.failedRecently === proof.sentRecently) {
    return {
      text: `None of the last ${proof.sentRecently} message${proof.sentRecently === 1 ? "" : "s"} got through: ${proof.lastFailureReason ?? "the provider reported them undelivered"}`,
      tone: "error",
      notDelivering: true,
    };
  }
  if (proof.failedRecently > 0) {
    return {
      text: `${proof.failedRecently} of ${proof.sentRecently} messages in the last day didn't get through: ${proof.lastFailureReason ?? "the provider reported them undelivered"}`,
      tone: "error",
      notDelivering: false,
    };
  }
  if (proof.lastProvenAt) return { text: `Last proven delivery: ${since(proof.lastProvenAt)} (${channel})`, tone: "neutral", notDelivering: false };
  if (proof.sentRecently > 0) return { text: "Sent, waiting for the provider to confirm delivery", tone: "neutral", notDelivering: false };
  return null;
}
