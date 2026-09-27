import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

let pathname = "/dashboard/engagements/e1/skills/win-back";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { SkillsNavList, productForPath } from "@/components/skills-nav-list";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";
import type { WorkerId } from "@/lib/worker-registry";

const enabled = ["pin-down", "win-back", "leak-map", ...WHOP_AGENT_SKILL_IDS] as WorkerId[];

describe("the sidebar's enabled skills", () => {
  it("shows one row per product with a count, not a tile per skill", () => {
    pathname = "/dashboard";
    render(<SkillsNavList layout="grid" productIds={["showtime", "whop-agent"]} enabledWorkerIds={enabled} engagementId="e1" />);
    const showtime = screen.getByRole("button", { name: /Showtime\s*3 on/ });
    const whop = screen.getByRole("button", { name: new RegExp(`Whop Agent\\s*${WHOP_AGENT_SKILL_IDS.length} on`) });
    expect(showtime).toHaveAttribute("aria-expanded", "false");
    expect(whop).toHaveAttribute("aria-expanded", "false");
    // Nothing is switched off from here.
    expect(screen.queryByRole("button", { name: /Turn off/ })).toBeNull();
    expect(screen.queryAllByRole("link").filter((l) => l.getAttribute("href")?.includes("/skills/"))).toHaveLength(0);
  });

  it("opens the product being looked at, and a row opens to its skills as links", () => {
    pathname = "/dashboard/engagements/e1/skills/win-back";
    render(<SkillsNavList layout="grid" productIds={["showtime", "whop-agent"]} enabledWorkerIds={enabled} engagementId="e1" needsAttentionWorkerIds={new Set(["leak-map"])} />);
    // Distinct from the row's own "…" setup kebab, whose accessible name
    // ("Setup for Showtime") also contains the product name.
    const showtime = screen.getByRole("button", { name: /Showtime\s*3 on/ });
    expect(showtime).toHaveAttribute("aria-expanded", "true");
    expect(within(showtime).getByLabelText("1 failing")).toBeInTheDocument();
    const here = screen.getByRole("link", { current: "page" });
    expect(here).toHaveAttribute("href", "/dashboard/engagements/e1/skills/win-back");

    fireEvent.click(showtime);
    expect(showtime).toHaveAttribute("aria-expanded", "false");
    const whopToggle = screen.getByRole("button", { name: new RegExp(`Whop Agent\\s*${WHOP_AGENT_SKILL_IDS.length} on`) });
    fireEvent.click(whopToggle);
    expect(whopToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("the setup kebab opens the product's one setup page, not a page per skill", () => {
    pathname = "/dashboard";
    render(<SkillsNavList layout="grid" productIds={["showtime"]} enabledWorkerIds={enabled} engagementId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: "Setup for Showtime" }));
    const setupLinks = screen.getAllByRole("link", { name: /View setup/ });
    expect(setupLinks).toHaveLength(1);
    expect(setupLinks[0]).toHaveAttribute("href", "/dashboard/engagements/e1/bridges/pin-down");
  });

  it("says so when nothing is on", () => {
    render(<SkillsNavList layout="grid" productIds={["showtime"]} enabledWorkerIds={[]} engagementId="e1" />);
    expect(screen.getByText(/No skills are on for this client yet/)).toBeInTheDocument();
  });

  it("knows which product a page belongs to", () => {
    expect(productForPath("/dashboard/engagements/e1/skills/whop-bridge-manager")).toBe("whop-agent");
    expect(productForPath("/dashboard/engagements/e1/skills/reputation-manager?source=reddit")).toBe("reputation-manager");
    expect(productForPath("/dashboard/engagements/e1/bridges/icp-lock")).toBe("cold-open");
    expect(productForPath("/dashboard/library/showtime")).toBe("showtime");
    expect(productForPath("/dashboard/queue")).toBeNull();
  });
});
