import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
const breadcrumbs: string[] = [];
vi.mock("@/components/breadcrumbs/breadcrumb-context", () => ({
  SetBreadcrumbLabel: ({ label }: { label: string }) => {
    breadcrumbs.push(label);
    return null;
  },
}));
vi.mock("@/app/dashboard/engagements/[id]/owned-engagement", () => ({ loadOwnedEngagement: vi.fn() }));
// The panels the pages below render, stubbed to show what they were given.
vi.mock("@/app/dashboard/engagements/[id]/skill-configure-menu", () => ({
  SkillConfigureMenu: (p: { skillId: string; pileOnInitial?: object; defaultOpen?: boolean }) => (
    <div data-testid="configure" data-open={String(Boolean(p.defaultOpen))}>
      {p.skillId}
      {p.pileOnInitial ? JSON.stringify(p.pileOnInitial) : ""}
    </div>
  ),
}));
vi.mock("@/app/dashboard/engagements/[id]/leak-map-schedule", () => ({
  LeakMapSchedule: (p: { engagementId: string }) => <div data-testid="body">leak-map {p.engagementId}</div>,
}));
vi.mock("@/app/dashboard/engagements/[id]/rep-findings-panel", () => ({
  RepFindingsPanel: (p: { initialSource: string | null }) => <div data-testid="body">source={String(p.initialSource)}</div>,
}));
vi.mock("@/components/skill-consoles/bridge-manager-console", () => ({
  BridgeManagerConsole: () => <div data-testid="body">bridge-manager</div>,
}));

import { loadOwnedEngagement } from "@/app/dashboard/engagements/[id]/owned-engagement";
import { SKILL_PAGES } from "@/app/dashboard/engagements/[id]/skill-pages";
import SkillPage from "@/app/dashboard/engagements/[id]/skills/[skillId]/page";
import { WORKER_IDS, SKILLS_CONFIGURED_ON_OWN_PAGE, workerPrimaryHref } from "@/lib/worker-registry";

const props = (skillId: string, query: Record<string, string> = {}) => ({
  params: Promise.resolve({ id: "e1", skillId }),
  searchParams: Promise.resolve(query),
});

describe("skill page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    breadcrumbs.length = 0;
    vi.mocked(loadOwnedEngagement).mockResolvedValue({ engagementId: "e1", buyer: "Acme", stack: null });
  });

  it("has a page for every skills/ link the app builds", () => {
    const linked = new Set<string>();
    for (const workerId of WORKER_IDS) {
      const href = workerPrimaryHref(workerId, "e1");
      const match = href.match(/^\/dashboard\/engagements\/e1\/skills\/([^?#]+)/);
      if (!match) continue;
      linked.add(match[1]);
      expect(SKILL_PAGES, `${workerId} links to ${href}`).toHaveProperty([match[1]]);
    }
    expect([...linked]).toEqual(expect.arrayContaining(["pin-down", "win-back", "leak-map", "pile-on", "pre-call-read", "cold-open", "reputation-manager"]));
  });

  it("404s for an unknown skill (including Object built-ins) and for a client the user can't see", async () => {
    await expect(SkillPage(props("not-a-skill"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(SkillPage(props("constructor"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadOwnedEngagement).not.toHaveBeenCalled();
    vi.mocked(loadOwnedEngagement).mockResolvedValue(null);
    await expect(SkillPage(props("leak-map"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadOwnedEngagement).toHaveBeenCalledWith("e1");
  });

  it("renders the shared header, breadcrumb, Configure menu and body", async () => {
    render(await SkillPage(props("leak-map")));
    expect(screen.getByRole("heading", { name: "Funnel Audit for Acme" })).toBeInTheDocument();
    expect(screen.getByText(/Automated weekly and monthly audits/)).toBeInTheDocument();
    expect(screen.getByTestId("configure")).toHaveTextContent("leak-map");
    expect(screen.getByTestId("body")).toHaveTextContent("leak-map e1");
    expect(breadcrumbs).toEqual(["Acme · Funnel Audit"]);
    expect(screen.getByLabelText("Back to client")).toHaveAttribute("href", "/dashboard/engagements/e1");
  });

  it("goes back to the module page named by ?from=, and ignores any other ?from=", async () => {
    const { unmount } = render(await SkillPage(props("leak-map", { from: "/dashboard/modules/leak-map" })));
    expect(screen.getByLabelText("Back to Module")).toHaveAttribute("href", "/dashboard/modules/leak-map");
    unmount();
    render(await SkillPage(props("leak-map", { from: "https://evil.example" })));
    expect(screen.getByLabelText("Back to client")).toHaveAttribute("href", "/dashboard/engagements/e1");
  });

  it("passes a valid ?source= to the Reputation Manager findings and drops an invalid one", async () => {
    const { unmount } = render(await SkillPage(props("reputation-manager", { source: "reddit" })));
    expect(screen.getByTestId("body")).toHaveTextContent("source=reddit");
    unmount();
    render(await SkillPage(props("reputation-manager", { source: "bogus" })));
    expect(screen.getByTestId("body")).toHaveTextContent("source=null");
  });

  it("opens the Configure menu on arrival from a settings link, and only then", async () => {
    const { unmount } = render(await SkillPage(props("leak-map")));
    expect(screen.getByTestId("configure")).toHaveAttribute("data-open", "false");
    unmount();
    render(await SkillPage(props("leak-map", { configure: "1" })));
    expect(screen.getByTestId("configure")).toHaveAttribute("data-open", "true");
  });

  it("opens Pile-On's Configure menu on arrival via ?configure=1", () => {
    // Pile-On now also has a real config form in config-form-registry.tsx
    // (PileOnConfigForm, fully self-loading), so the Library's own
    // settings gear configures it in place there instead of linking here
    // — workerSettingsHref("pile-on", ...) returns null now. The page's
    // own ?configure=1 arrival convention still works independently of
    // that (a direct/bookmarked link, or SkillConfigureMenu's own
    // pre-fetched values here), so it's still covered directly.
    const engagement = { engagementId: "e1", buyer: "Acme", stack: null } as never;
    const { unmount } = render(<>{SKILL_PAGES["pile-on"].headerAction!({ engagement, searchParams: { configure: "1" } })}</>);
    expect(screen.getByTestId("configure")).toHaveTextContent("pile-on");
    expect(screen.getByTestId("configure")).toHaveAttribute("data-open", "true");
    unmount();
    render(<>{SKILL_PAGES["pile-on"].headerAction!({ engagement, searchParams: {} })}</>);
    expect(screen.getByTestId("configure")).toHaveAttribute("data-open", "false");
  });

  it("has no skills left that only send settings links to their own page (SKILLS_CONFIGURED_ON_OWN_PAGE is empty now that Pile-On has a real inline form)", () => {
    expect(SKILLS_CONFIGURED_ON_OWN_PAGE).toEqual([]);
  });

  it("uses the breadcrumb override, and edits Bridge Manager through Configure rather than a form in the page", async () => {
    render(await SkillPage(props("whop-bridge-manager")));
    expect(screen.getByRole("heading", { name: "Bridge Manager for Acme" })).toBeInTheDocument();
    expect(screen.getByTestId("configure")).toBeInTheDocument();
    expect(SKILL_PAGES["whop-webhook-audit"].breadcrumb).toBe("Webhook Fleet");
  });
});
