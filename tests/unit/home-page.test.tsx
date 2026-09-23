import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({
  listWorkspaces: vi.fn(),
  getInstalledPackagesByWorkspace: vi.fn(),
  getPrimaryEngagementIdsForWorkspaces: vi.fn(),
}));
vi.mock("@/lib/engagement-skills", () => ({ getEnabledWorkerIdsForEngagements: vi.fn() }));
vi.mock("@/lib/user-avatar", () => ({ getUserAvatar: vi.fn() }));
vi.mock("@/app/home/workspace-home-client", () => ({
  WorkspaceHomeClient: ({ workspaceList }: { workspaceList: Array<{ name: string }> }) => (
    <ul data-testid="workspaces">{workspaceList.map((w) => <li key={w.name}>{w.name}</li>)}</ul>
  ),
}));

import { getSession } from "@/lib/session";
import { listWorkspaces, getInstalledPackagesByWorkspace, getPrimaryEngagementIdsForWorkspaces } from "@/lib/workspace";
import { getEnabledWorkerIdsForEngagements } from "@/lib/engagement-skills";
import { getUserAvatar } from "@/lib/user-avatar";
import WorkspaceHomePage from "@/app/home/page";

describe("WorkspaceHomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1", email: "sarah@acme.com" } as any);
    vi.mocked(listWorkspaces).mockResolvedValue([{ workspaceId: "ws1", name: "Acme" }, { workspaceId: "ws2", name: "Beta" }] as any);
    vi.mocked(getInstalledPackagesByWorkspace).mockResolvedValue(new Map([["ws1", ["showtime"]]]));
    vi.mocked(getPrimaryEngagementIdsForWorkspaces).mockResolvedValue(new Map([["ws1", "e1"]]));
    vi.mocked(getEnabledWorkerIdsForEngagements).mockResolvedValue(new Map([["e1", ["pin-down"]]]) as any);
    vi.mocked(getUserAvatar).mockResolvedValue({ avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null });
  });

  it("greets the user by the local part of their email", async () => {
    render(await WorkspaceHomePage());
    expect(screen.getByText("Welcome back, sarah")).toBeInTheDocument();
  });

  it("lists every workspace", async () => {
    render(await WorkspaceHomePage());
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("looks up engagements and enabled skills once for all workspaces", async () => {
    await WorkspaceHomePage();
    expect(getPrimaryEngagementIdsForWorkspaces).toHaveBeenCalledTimes(1);
    expect(getPrimaryEngagementIdsForWorkspaces).toHaveBeenCalledWith(["ws1", "ws2"]);
    expect(getEnabledWorkerIdsForEngagements).toHaveBeenCalledTimes(1);
    expect(getEnabledWorkerIdsForEngagements).toHaveBeenCalledWith(["e1"]);
  });

  it("provides a sign-out control that posts to the logout route", async () => {
    const { container } = render(await WorkspaceHomePage());
    const form = container.querySelector('form[action="/api/auth/logout"]');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("method", "POST");
  });
});
