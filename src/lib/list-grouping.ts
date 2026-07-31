// Collapses repeated, identical-looking rows (the same error firing every
// cron tick, the same notification re-appearing, the same routine run
// happening again) into one row with an occurrence count, instead of
// letting the table grow by one row every time the same thing happens
// again. Applies to both Queue and Live Executions — same utility, each
// view supplies its own idea of "identical" via `signatureOf`.
//
// Deliberately exact-match, not fuzzy: two rows only group when their
// signature strings are identical after normalizing whitespace/case. This
// is a conservative choice — it will under-group near-duplicates ("Retry
// attempt 3 failed" vs "Retry attempt 4 failed" won't merge), but it will
// never accidentally hide two genuinely different problems inside one
// count. Given the failure mode of over-grouping is "you stop noticing a
// second, different issue," under-grouping is the safer default.

/** Lowercases, trims, and collapses whitespace so trivial formatting differences don't prevent two otherwise-identical messages from grouping. */
export function normalizeForSignature(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ItemGroup<T> {
  signature: string;
  /** Sorted newest first. */
  items: T[];
  /** items[0] — the most recent occurrence; what the collapsed row displays. */
  latest: T;
  count: number;
}

/**
 * Groups items sharing an identical signature, sorts each group's members
 * newest-first, and sorts the groups themselves by their most recent
 * occurrence — so the result reads the same as the ungrouped list would
 * ("most recent activity first"), just with repeats collapsed.
 */
export function groupBySignature<T>(
  items: T[],
  signatureOf: (item: T) => string,
  timestampOf: (item: T) => string
): ItemGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const sig = signatureOf(item);
    const bucket = buckets.get(sig);
    if (bucket) bucket.push(item);
    else buckets.set(sig, [item]);
  }

  const groups: ItemGroup<T>[] = [];
  for (const [signature, groupItems] of buckets) {
    const sorted = [...groupItems].sort(
      (a, b) => new Date(timestampOf(b)).getTime() - new Date(timestampOf(a)).getTime()
    );
    groups.push({ signature, items: sorted, latest: sorted[0], count: sorted.length });
  }

  groups.sort((a, b) => new Date(timestampOf(b.latest)).getTime() - new Date(timestampOf(a.latest)).getTime());
  return groups;
}
