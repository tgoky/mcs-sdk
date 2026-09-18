import { describe, it, expect } from "vitest";
import { aggregateShowRateByTemplate, LOW_SAMPLE_THRESHOLD, type RawOutcomeRow } from "@/lib/show-rate-by-template";

describe("aggregateShowRateByTemplate", () => {
  it("returns an empty array for no rows", () => {
    expect(aggregateShowRateByTemplate([])).toEqual([]);
  });

  it("computes show rate as showed / (showed + no_show), excluding rescheduled", () => {
    const rows: RawOutcomeRow[] = [
      { template: "contract", outcome: "showed" },
      { template: "contract", outcome: "showed" },
      { template: "contract", outcome: "showed" },
      { template: "contract", outcome: "no_show" },
      { template: "contract", outcome: "rescheduled" },
    ];
    const [stat] = aggregateShowRateByTemplate(rows);
    expect(stat.template).toBe("contract");
    expect(stat.showed).toBe(3);
    expect(stat.noShow).toBe(1);
    expect(stat.rescheduled).toBe(1);
    expect(stat.sampleSize).toBe(4);
    expect(stat.showRatePct).toBe(75);
  });

  it("buckets an unrecognized or legacy template value (e.g. the DB's stale 'signal' default) into 'other'", () => {
    const rows: RawOutcomeRow[] = [
      { template: "signal", outcome: "showed" },
      { template: null, outcome: "no_show" },
    ];
    const stats = aggregateShowRateByTemplate(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0].template).toBe("other");
    expect(stats[0].name).toBe("Other / legacy template");
    expect(stats[0].sampleSize).toBe(2);
  });

  it("gives a template with zero resolved outcomes a null rate instead of dividing by zero", () => {
    const rows: RawOutcomeRow[] = [{ template: "minimalist", outcome: "rescheduled" }];
    const [stat] = aggregateShowRateByTemplate(rows);
    expect(stat.sampleSize).toBe(0);
    expect(stat.showRatePct).toBeNull();
  });

  it("sorts templates by show rate descending, nulls last", () => {
    const rows: RawOutcomeRow[] = [
      { template: "assessment", outcome: "no_show" },
      { template: "assessment", outcome: "showed" },
      { template: "goldenticket", outcome: "showed" },
      { template: "goldenticket", outcome: "showed" },
      { template: "minimalist", outcome: "rescheduled" },
    ];
    const stats = aggregateShowRateByTemplate(rows);
    expect(stats.map((s) => s.template)).toEqual(["goldenticket", "assessment", "minimalist"]);
  });

  it("keeps separate buckets per template rather than merging counts", () => {
    const rows: RawOutcomeRow[] = [
      { template: "contract", outcome: "showed" },
      { template: "tentativehold", outcome: "no_show" },
    ];
    const stats = aggregateShowRateByTemplate(rows);
    expect(stats).toHaveLength(2);
    const contract = stats.find((s) => s.template === "contract")!;
    const tentativehold = stats.find((s) => s.template === "tentativehold")!;
    expect(contract.showRatePct).toBe(100);
    expect(tentativehold.showRatePct).toBe(0);
  });

  it("exposes LOW_SAMPLE_THRESHOLD for the UI's thin-sample warning", () => {
    expect(LOW_SAMPLE_THRESHOLD).toBeGreaterThan(0);
  });
});
