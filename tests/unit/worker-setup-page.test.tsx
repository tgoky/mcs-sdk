import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ push }),
  useSearchParams: () => search,
}));
vi.mock("@/components/breadcrumbs/breadcrumb-context", () => ({ SetBreadcrumbLabel: () => null }));
vi.mock("@/app/dashboard/engagements/[id]/owned-engagement", () => ({ loadOwnedEngagement: vi.fn() }));
const handlersSeen: Array<Record<string, unknown>> = [];
vi.mock("@/components/worker-config-forms/config-form-registry", () => ({
  renderWorkerConfigForm: (workerId: string, handlers: Record<string, unknown>) => {
    handlersSeen.push({ workerId, ...handlers });
    return <div data-testid="form">{workerId}</div>;
  },
}));

import { loadOwnedEngagement } from "@/app/dashboard/engagements/[id]/owned-engagement";
import WorkerSetupPage from "@/app/dashboard/engagements/[id]/bridges/[workerId]/page";

const params = (workerId: string) => ({ params: Promise.resolve({ id: "e1", workerId }) });

describe("worker setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlersSeen.length = 0;
    search = new URLSearchParams();
    vi.mocked(loadOwnedEngagement).mockResolvedValue({ engagementId: "e1", buyer: "Acme", stack: null });
  });

  it("404s for an unknown worker, a worker with no form, and a client the user can't see", async () => {
    await expect(WorkerSetupPage(params("not-a-worker"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(WorkerSetupPage(params("pile-on"))).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(loadOwnedEngagement).mockResolvedValue(null);
    await expect(WorkerSetupPage(params("pin-down"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the heading, the one-line description and that worker's form", async () => {
    render(await WorkerSetupPage(params("leak-map")));
    expect(screen.getByRole("heading", { name: "Configure Funnel Audit" })).toBeInTheDocument();
    expect(screen.getByText(/Audits the funnel/)).toBeInTheDocument();
    expect(screen.getByTestId("form")).toHaveTextContent("leak-map");
  });

  it("leaves the heading to Whop Agent's own setup screen", async () => {
    render(await WorkerSetupPage(params("whop-connect")));
    expect(screen.queryByRole("heading", { name: /Configure|Connect your Whop account/ })).toBeNull();
    expect(screen.getByTestId("form")).toHaveTextContent("whop-connect");
  });

  it("goes back to ?from= on cancel, to the run a setup started, else back", async () => {
    search = new URLSearchParams({ from: "/dashboard/library" });
    render(await WorkerSetupPage(params("pin-down")));
    expect(screen.getByLabelText("Back")).toHaveAttribute("href", "/dashboard/library");

    const h = handlersSeen.at(-1) as { onClose: () => void; onSaved: (r: { runId?: string }) => void };
    h.onClose();
    expect(push).toHaveBeenLastCalledWith("/dashboard/library");
    h.onSaved({ runId: "run-7" });
    expect(push).toHaveBeenLastCalledWith("/dashboard/runs/run-7");
    h.onSaved({});
    expect(push).toHaveBeenLastCalledWith("/dashboard/library");
  });

  it("ignores a ?from= outside the dashboard", async () => {
    search = new URLSearchParams({ from: "https://evil.example" });
    render(await WorkerSetupPage(params("win-back")));
    expect(screen.getByLabelText("Back")).toHaveAttribute("href", "/dashboard/engagements/e1");
  });
});
