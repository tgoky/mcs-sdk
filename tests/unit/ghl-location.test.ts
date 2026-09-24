import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));

import { ghlLocationIdOf, ghlLocationPatch, otherGhlProvider, parseGhlLocationId } from "@/lib/ghl-location";

describe("parseGhlLocationId", () => {
  it("takes the bare ID", () => {
    expect(parseGhlLocationId("  ve9EPM428h8vShlRW1KT ")).toBe("ve9EPM428h8vShlRW1KT");
  });

  it("pulls the ID out of a GoHighLevel address, including white-label domains", () => {
    expect(parseGhlLocationId("https://app.gohighlevel.com/v2/location/ve9EPM428h8vShlRW1KT/dashboard")).toBe("ve9EPM428h8vShlRW1KT");
    expect(parseGhlLocationId("https://app.myagency.com/location/ve9EPM428h8vShlRW1KT/settings/company")).toBe("ve9EPM428h8vShlRW1KT");
  });

  it("accepts it copied with its label", () => {
    expect(parseGhlLocationId("Location ID: ve9EPM428h8vShlRW1KT")).toBe("ve9EPM428h8vShlRW1KT");
  });

  it("rejects things that aren't an ID", () => {
    expect(parseGhlLocationId("")).toBeNull();
    expect(parseGhlLocationId("my location")).toBeNull();
    expect(parseGhlLocationId("https://example.com")).toBeNull();
  });
});

describe("GoHighLevel location in the stack", () => {
  it("reads it from wherever it was saved", () => {
    expect(ghlLocationIdOf({ booking_platform_meta: { location_id: "a" } })).toBe("a");
    expect(ghlLocationIdOf({ email_platform_meta: { location_id: "b" } } as never)).toBe("b");
    expect(ghlLocationIdOf({ sms_platform_meta: { ghl_location_id: "c" } })).toBe("c");
    expect(ghlLocationIdOf({})).toBeNull();
  });

  it("saves it everywhere it's read, keeping the rest of each meta", () => {
    const patch = ghlLocationPatch({ booking_platform_meta: { calendar_id: "cal1" }, sms_platform_meta: { twilio_from_number: "+1" } }, "loc1") as Record<string, Record<string, string>>;
    expect(patch.booking_platform_meta).toEqual({ calendar_id: "cal1", location_id: "loc1" });
    expect(patch.email_platform_meta).toEqual({ location_id: "loc1" });
    expect(patch.sms_platform_meta).toEqual({ twilio_from_number: "+1", ghl_location_id: "loc1" });
  });

  it("pairs the booking and email sides", () => {
    expect(otherGhlProvider("ghl")).toBe("ghl_calendar");
    expect(otherGhlProvider("ghl_calendar")).toBe("ghl");
    expect(otherGhlProvider("hubspot")).toBeNull();
  });
});
