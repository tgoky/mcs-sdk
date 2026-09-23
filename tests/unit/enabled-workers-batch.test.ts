import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { db } from "@/lib/db";
import { getEnabledWorkerIdsForEngagement, getEnabledWorkerIdsForEngagements } from "@/lib/engagement-skills";
import { fakeDbSequence } from "../helpers/fake-db";

// Query order in both functions: skill rows, engagement stack, rep graph,
// cold open config, whop connection.
describe("getEnabledWorkerIdsForEngagements", () => {
  it("gives each engagement the same answer the single lookup does", async () => {
    const skillRows = [
      { engagementId: "a", skillId: "pin-down", enabled: false, enabledAt: null },
      { engagementId: "b", skillId: "icp-lock", enabled: true, enabledAt: new Date() },
    ];
    Object.assign(db, fakeDbSequence([skillRows.filter((r) => r.engagementId === "a"), [{ stack: {} }], [], [], []]));
    const singleA = await getEnabledWorkerIdsForEngagement("a");
    Object.assign(db, fakeDbSequence([skillRows.filter((r) => r.engagementId === "b"), [{ stack: null }], [{ engagementId: "b" }], [], []]));
    const singleB = await getEnabledWorkerIdsForEngagement("b");

    Object.assign(
      db,
      fakeDbSequence([
        skillRows,
        [{ engagementId: "a", stack: {} }, { engagementId: "b", stack: null }],
        [{ engagementId: "b" }],
        [],
        [],
      ])
    );
    const batch = await getEnabledWorkerIdsForEngagements(["a", "b"]);

    expect(batch.get("a")).toEqual(singleA);
    expect(batch.get("b")).toEqual(singleB);
    expect(singleA).not.toContain("pin-down");
    expect(singleB).toContain("icp-lock");
  });
});

// Creating a client from Reputation Manager writes stack = { timezone },
// and saving a credential writes into stack too — neither means Showtime
// is in use, so neither may light up the Showtime workers.
describe("Showtime evidence", () => {
  it("ignores a stack that only carries a timezone", async () => {
    Object.assign(db, fakeDbSequence([[], [{ stack: { timezone: "UTC" }, confirmationPageUrl: null }], [], [], []]));
    const ids = await getEnabledWorkerIdsForEngagement("rep-only");
    expect(ids).not.toContain("pin-down");
    expect(ids).not.toContain("leak-map");
  });

  it("counts a client that finished pin-down or has a booking platform", async () => {
    Object.assign(db, fakeDbSequence([[], [{ stack: null, confirmationPageUrl: "https://x.test/confirm" }], [], [], []]));
    expect(await getEnabledWorkerIdsForEngagement("onboarded")).toContain("leak-map");
    Object.assign(db, fakeDbSequence([[], [{ stack: { booking_platform: "calendly" }, confirmationPageUrl: null }], [], [], []]));
    expect(await getEnabledWorkerIdsForEngagement("legacy")).toContain("leak-map");
  });
});
