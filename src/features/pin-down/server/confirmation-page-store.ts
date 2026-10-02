// src/features/pin-down/server/confirmation-page-store.ts
//
// Records a confirmation page as built and cleared to go out, so the
// hosted page (/confirm/[id]) serves the real page and not a placeholder.
// "Cleared" means published, handed over to paste, or approved from the
// queue. A build still waiting on approval is never recorded, so the
// public page keeps showing the last approved one.
import type { ConfirmationPageContent } from "@/lib/platforms/hosting";

/** Columns to spread into the same update that records the deploy, so
 * the page and its deployment state change together. Empty when there's
 * nothing to record. */
export function clearedPageColumns(content: Pick<ConfirmationPageContent, "html"> | null | undefined): {
  confirmationPageHtml?: string;
  confirmationPageBuiltAt?: Date;
} {
  if (!content?.html?.trim()) return {};
  return { confirmationPageHtml: content.html, confirmationPageBuiltAt: new Date() };
}
