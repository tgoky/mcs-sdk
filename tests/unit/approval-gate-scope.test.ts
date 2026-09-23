import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/engagement-status", () => ({ isEngagementPaused: vi.fn() }));

import { isApprovalRequired } from "@/lib/approval-gate";

describe("isApprovalRequired", () => {
  it("Autopilot reviews nothing", () => {
    expect(isApprovalRequired({ require_approval_for_side_effects: false } as any, "confirmation_page_deploy")).toBe(false);
  });

  it("Co-Pilot with no list reviews every opt-in action", () => {
    expect(isApprovalRequired({ require_approval_for_side_effects: true } as any, "webhook_enrollment")).toBe(true);
  });

  it("Co-Pilot with a list reviews only the listed actions", () => {
    const stack = { require_approval_for_side_effects: true, require_approval_action_types: ["confirmation_page_deploy"] } as any;
    expect(isApprovalRequired(stack, "confirmation_page_deploy")).toBe(true);
    expect(isApprovalRequired(stack, "webhook_enrollment")).toBe(false);
  });

  it("a list holding only always-reviewed types (old Autopilot saves) still reviews everything", () => {
    const stack = { require_approval_for_side_effects: true, require_approval_action_types: ["whop_webhook_pin", "rep_response_approval"] } as any;
    expect(isApprovalRequired(stack, "webhook_enrollment")).toBe(true);
    expect(isApprovalRequired(stack, "cohort_membership_add")).toBe(true);
  });
});
