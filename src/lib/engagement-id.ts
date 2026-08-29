/**
 * Generates a stable, human-legible engagement id from a buyer name.
 *
 * Extracted from the wizard's own submit-payload.ts (which still
 * re-exports it for back-compat) so a second creation path — the minimal
 * "just a name" route — doesn't have to import from inside the wizard's
 * own folder to get it. Both call sites now share one implementation.
 */
export function generateEngagementId(buyerName: string): string {
  const slug = buyerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `eng_${slug}_${Date.now().toString(36)}`;
}
