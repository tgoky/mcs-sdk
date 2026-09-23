import { describe, it, expect } from "vitest";
import { TOURS } from "@/lib/tours/tour-definitions";

describe("tour definitions", () => {
  it("the picker lists the four general tours plus the full walkthrough", () => {
    expect(TOURS.filter((t) => !t.hidden).map((t) => t.id)).toEqual(["dashboard-basics", "library", "engagement-detail", "workers", "full-walkthrough"]);
  });

  it("keeps each product tour a setup form starts after saving, hidden from the picker", () => {
    // showtime-setup -> "showtime", icp-lock -> "cold-open", whop-connect -> "whop-agent"
    for (const id of ["showtime", "cold-open", "whop-agent", "reputation-manager"]) {
      const tour = TOURS.find((t) => t.id === id);
      expect(tour, id).toBeDefined();
      expect(tour!.hidden).toBe(true);
      expect(tour!.steps.length).toBeGreaterThan(0);
    }
  });

  it("has unique tour ids and unique step ids within each tour", () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tour of TOURS) {
      const stepIds = tour.steps.map((s) => s.id);
      expect(new Set(stepIds).size, tour.id).toBe(stepIds.length);
    }
  });
});
