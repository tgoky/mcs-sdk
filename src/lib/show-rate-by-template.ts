// src/lib/show-rate-by-template.ts
//
// Pure aggregation for the show-rate-by-confirmation-page-template report
// (src/features/reports/server/show-rate-by-template.ts), split out with
// zero db import — same "pure logic lives where it can be unit-tested
// without a live DATABASE_URL" reasoning as unified-activity.ts.

import { TEMPLATE_META, isTemplateId, type TemplateId } from "@/features/pin-down/server/templates/types";

export interface TemplateShowRateStat {
  template: TemplateId | "other";
  name: string;
  showed: number;
  noShow: number;
  rescheduled: number;
  /** showed / (showed + noShow) — rescheduled excluded, it isn't a show/no-show outcome. */
  showRatePct: number | null;
  /** showed + noShow — the denominator showRatePct is computed from. */
  sampleSize: number;
}

export interface RawOutcomeRow {
  template: string | null;
  outcome: string;
}

// Below this many resolved (showed + no_show) bookings, a template's rate
// is one or two calls away from swinging 20+ points — shown, but the UI
// should flag it as too thin to act on rather than hide it outright.
export const LOW_SAMPLE_THRESHOLD = 5;

/**
 * confirmationPageTemplate predates TEMPLATE_IDS in a few places (the
 * column's own DB default is "signal", never a valid TemplateId — see
 * content-model.ts's file header) — every row buckets into a real
 * TemplateId or into "other" rather than assuming the column only ever
 * holds one of the 5 current values.
 */
export function aggregateShowRateByTemplate(rows: RawOutcomeRow[]): TemplateShowRateStat[] {
  const buckets = new Map<TemplateId | "other", { showed: number; noShow: number; rescheduled: number }>();
  for (const row of rows) {
    const key: TemplateId | "other" = isTemplateId(row.template) ? row.template : "other";
    const bucket = buckets.get(key) ?? { showed: 0, noShow: 0, rescheduled: 0 };
    if (row.outcome === "showed") bucket.showed++;
    else if (row.outcome === "no_show") bucket.noShow++;
    else if (row.outcome === "rescheduled") bucket.rescheduled++;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([template, counts]) => {
      const sampleSize = counts.showed + counts.noShow;
      return {
        template,
        name: template === "other" ? "Other / legacy template" : TEMPLATE_META[template].name,
        showed: counts.showed,
        noShow: counts.noShow,
        rescheduled: counts.rescheduled,
        showRatePct: sampleSize > 0 ? Math.round((counts.showed / sampleSize) * 100) : null,
        sampleSize,
      };
    })
    .sort((a, b) => (b.showRatePct ?? -1) - (a.showRatePct ?? -1));
}
