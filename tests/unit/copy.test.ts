import { describe, it, expect } from "vitest";
import {
  skillName,
  runStatusLabel,
  runStatusColor,
  phaseLabel,
  bookingPlatformLabel,
  emailPlatformLabel,
  SKILLS,
  SKILL_INFO,
  HOME_COPY,
  WORKSPACE_PRODUCTS,
} from "@/lib/copy";

describe("skillName", () => {
  it("returns the friendly name for every known skill codename", () => {
    for (const skill of SKILLS) {
      expect(skillName(skill)).toBe(SKILL_INFO[skill].name);
    }
  });

  it("falls back to the raw string for an unrecognized codename", () => {
    expect(skillName("some-future-skill")).toBe("some-future-skill");
  });

  it("falls back to a safe label for null/undefined/empty input", () => {
    expect(skillName(null)).toBe("Unknown module");
    expect(skillName(undefined)).toBe("Unknown module");
    expect(skillName("")).toBe("Unknown module");
  });
});

describe("runStatusLabel", () => {
  it.each([
    ["success", "Done"],
    ["failed", "Failed"],
    ["running", "In progress"],
    ["cancelled", "Cancelled"],
    ["timed_out", "Timed out"],
  ])("maps %s -> %s", (status, expected) => {
    expect(runStatusLabel(status)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(runStatusLabel("SUCCESS")).toBe("Done");
    expect(runStatusLabel("Failed")).toBe("Failed");
  });

  it("falls back to 'In progress' for null/undefined/unknown status", () => {
    expect(runStatusLabel(null)).toBe("In progress");
    expect(runStatusLabel(undefined)).toBe("In progress");
    expect(runStatusLabel("some_new_backend_status")).toBe("In progress");
  });
});

describe("runStatusColor", () => {
  it("returns the running color as the fallback for null/unknown status", () => {
    expect(runStatusColor(null)).toBe(runStatusColor("running"));
    expect(runStatusColor("totally_unknown")).toBe(runStatusColor("running"));
  });

  it("is case-insensitive and matches runStatusLabel's known statuses", () => {
    expect(runStatusColor("SUCCESS")).toContain("emerald");
    expect(runStatusColor("failed")).toContain("rose");
  });
});

describe("phaseLabel", () => {
  it("translates every documented internal phase codename to plain language", () => {
    expect(phaseLabel("pile_on_enrollment")).toBe("Adding lead to follow-up sequence");
    expect(phaseLabel("webhook_received")).toBe("New booking received");
    expect(phaseLabel("stage_5_report")).toBe("Writing your report");
  });

  it("never leaks a raw internal phase codename to the screen", () => {
    // This is the specific regression this function exists to prevent —
    // an engineer adds a new phase to the backend and forgets to add a
    // label here. It must degrade to a generic phrase, not the raw string.
    const result = phaseLabel("some_new_backend_phase_nobody_documented");
    expect(result).toBe("In progress");
    expect(result).not.toContain("_");
  });

  it("falls back to 'Getting started' when there's no phase yet", () => {
    expect(phaseLabel(null)).toBe("Getting started");
    expect(phaseLabel(undefined)).toBe("Getting started");
    expect(phaseLabel("")).toBe("Getting started");
  });
});

describe("bookingPlatformLabel", () => {
  it("maps every known platform codename", () => {
    expect(bookingPlatformLabel("calendly")).toBe("Calendly");
    expect(bookingPlatformLabel("cal_com")).toBe("Cal.com");
  });

  it("passes through an unrecognized codename as-is (not a generic fallback)", () => {
    // Unlike phaseLabel/runStatusLabel, an unknown platform string is itself
    // meaningful (e.g. a platform mid-rollout) so it's shown verbatim rather
    // than swallowed into a generic phrase.
    expect(bookingPlatformLabel("some_new_platform")).toBe("some_new_platform");
  });

  it("says 'Not connected yet' when nothing is set", () => {
    expect(bookingPlatformLabel(null)).toBe("Not connected yet");
    expect(bookingPlatformLabel(undefined)).toBe("Not connected yet");
  });
});

describe("emailPlatformLabel", () => {
  it("maps every known platform codename", () => {
    expect(emailPlatformLabel("klaviyo")).toBe("Klaviyo");
    expect(emailPlatformLabel("ghl")).toBe("GoHighLevel");
  });

  it("says 'Not connected yet' when nothing is set", () => {
    expect(emailPlatformLabel(null)).toBe("Not connected yet");
  });
});

describe("HOME_COPY / WORKSPACE_PRODUCTS", () => {
  it("gives every workspace product a status label", () => {
    for (const product of WORKSPACE_PRODUCTS) {
      expect(HOME_COPY.statusLabels[product.status]).toBeTruthy();
    }
  });

  it("every product has a non-empty name, description, and href", () => {
    for (const product of WORKSPACE_PRODUCTS) {
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.description.length).toBeGreaterThan(0);
      expect(product.href.startsWith("/")).toBe(true);
    }
  });

  it("has exactly one available product (Showtime) pointing at /dashboard", () => {
    const available = WORKSPACE_PRODUCTS.filter((p) => p.status === "available");
    expect(available).toHaveLength(1);
    expect(available[0].href).toBe("/dashboard");
  });
});
