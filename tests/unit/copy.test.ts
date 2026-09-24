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
    ["skipped", "Skipped"],
    ["cancelled", "Cancelled"],
    ["timed_out", "Timed out"],
  ])("maps %s -> %s", (status, expected) => {
    expect(runStatusLabel(status)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(runStatusLabel("SUCCESS")).toBe("Done");
    expect(runStatusLabel("Failed")).toBe("Failed");
  });

  it("falls back to 'In progress' when there's no status yet", () => {
    expect(runStatusLabel(null)).toBe("In progress");
    expect(runStatusLabel(undefined)).toBe("In progress");
  });

  it("passes an unrecognized status through as-is, never mislabeling a finished run as 'In progress'", () => {
    // Regression guard: a run that finished with a status this map hasn't
    // learned yet (e.g. a new backend status) must not silently read as
    // still running — that's exactly the bug where skipped runs (missing
    // from this map before "skipped" was added) fell back to "In progress".
    expect(runStatusLabel("some_new_backend_status")).toBe("some_new_backend_status");
  });
});

describe("runStatusColor", () => {
  it("returns the running color as the fallback for a genuinely absent status", () => {
    expect(runStatusColor(null)).toBe(runStatusColor("running"));
  });

  it("falls back to the neutral 'skipped' color (not 'running') for an unrecognized status", () => {
    // A run with some future/unrecognized status has already resolved to
    // *something* — it must not read as still in progress (italic, blue)
    // by default.
    expect(runStatusColor("totally_unknown")).toBe(runStatusColor("skipped"));
    expect(runStatusColor("totally_unknown")).not.toBe(runStatusColor("running"));
  });

  it("is case-insensitive and matches runStatusLabel's known statuses", () => {
    // Status colors are semantic tokens (text-status-*), not raw hues.
    expect(runStatusColor("SUCCESS")).toContain("text-status-success");
    expect(runStatusColor("failed")).toContain("text-status-error");
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
    // label here. It must degrade to a readable phrase, not the raw
    // snake_case string, and it must not claim the run is "In progress":
    // an unmapped phase can belong to a run that already finished
    // (success, failed, or skipped) just as easily as one still running.
    const result = phaseLabel("some_new_backend_phase_nobody_documented");
    expect(result).toBe("Some new backend phase nobody documented");
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

  it("exposes the currently installable products at their own entry points", () => {
    const available = WORKSPACE_PRODUCTS.filter((p) => p.status === "available");
    expect(available.map((p) => p.id).sort()).toEqual(["cold-open", "reputation-manager", "showtime", "whop-agent"]);
    expect(available.find((p) => p.id === "showtime")?.href).toBe("/dashboard");
    expect(available.find((p) => p.id === "reputation-manager")?.href).toBe("/dashboard/library/reputation-manager");
    expect(available.find((p) => p.id === "cold-open")?.href).toBe("/dashboard/library/cold-open");
    expect(available.find((p) => p.id === "whop-agent")?.href).toBe("/dashboard/library/whop-agent");
  });
});
