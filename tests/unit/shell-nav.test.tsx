import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard/engagements/e1" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/components/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/right-utility-rail", () => ({ RightUtilityRail: () => null }));
vi.mock("@/components/tours/tour-launcher", () => ({ TourLauncher: () => null }));

import { TopNav } from "@/components/top-nav";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import type { Workspace } from "@/lib/workspace";

const workspaces = [
  { workspaceId: "w1", name: "Acme Dental" },
  { workspaceId: "w2", name: "Birch Law" },
] as unknown as Workspace[];

describe("the top nav", () => {
  it("shows the active client where the breadcrumb was, and opens the client list downward", () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ summaries: [] }))) as unknown as typeof fetch;
    render(<TopNav onToggleSidebar={() => {}} workspaces={workspaces} activeWorkspaceId="w1" activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} />);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    const switcher = screen.getByRole("button", { name: /Acme Dental/ });
    expect(switcher).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(switcher);
    expect(switcher).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("menu");
    expect(list.className).toContain("top-full");
    expect(screen.getByText("Birch Law")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New workspace" })).toHaveAttribute("href", "/home/new");
  });

  it("names the sidebar toggle by what it will do", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TopNav onToggleSidebar={onToggle} sidebarOpen activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggle).toHaveBeenCalled();
    rerender(<TopNav onToggleSidebar={onToggle} sidebarOpen={false} activePanel={null} onSelectPanel={() => {}} unreadNotifications={0} />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});

describe("the Work sidebar", () => {
  it("slides to zero width when collapsed instead of disappearing", () => {
    const { container, rerender } = render(<SecondarySidebar work={<p>work list</p>} settings={null} open width={280} />);
    const aside = container.querySelector("aside")!;
    expect(aside.style.width).toBe("280px");
    rerender(<SecondarySidebar work={<p>work list</p>} settings={null} open={false} width={280} />);
    expect(aside.style.width).toBe("0px");
    expect(aside).toHaveAttribute("aria-hidden", "true");
  });

  it("resizes from its right edge within limits, and resets on double-click", () => {
    const onWidth = vi.fn();
    render(<SecondarySidebar work={<p>work list</p>} settings={null} open width={240} onWidthChange={onWidth} />);
    const edge = screen.getByRole("separator", { name: "Resize sidebar" });
    fireEvent.mouseDown(edge, { clientX: 240 });
    fireEvent.mouseMove(window, { clientX: 300 });
    expect(onWidth).toHaveBeenLastCalledWith(300);
    fireEvent.mouseMove(window, { clientX: 2000 });
    expect(onWidth).toHaveBeenLastCalledWith(440);
    fireEvent.mouseUp(window);
    fireEvent.doubleClick(edge);
    expect(onWidth).toHaveBeenLastCalledWith(240);
  });
});

import { InPageSettings } from "@/components/skill-settings/in-page-settings";

describe("the settings pane beside a list", () => {
  it("takes no height while closed, so nothing below the list gets pushed down", () => {
    const { container } = render(<InPageSettings>{() => <p>skills</p>}</InPageSettings>);
    const pane = container.querySelector("aside")!;
    expect(pane).toHaveAttribute("aria-hidden", "true");
    expect(pane.className).toMatch(/\bh-0\b/);
    expect(pane.className).not.toContain("100vh");
  });
});
