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

  it("renders that worker's form with no heading of its own, handing it the way back", async () => {
    // Every form carries its own heading and puts Back on its line.
    for (const id of ["leak-map", "whop-connect", "voice-capture"]) {
      handlersSeen.length = 0;
      const { unmount } = render(await WorkerSetupPage(params(id)));
      expect(screen.queryByRole("heading")).toBeNull();
      expect(screen.queryByLabelText("Back")).toBeNull();
      expect(screen.getByTestId("form")).toHaveTextContent(id);
      expect((handlersSeen.at(-1) as { backHref?: string }).backHref).toBe("/dashboard/engagements/e1");
      unmount();
    }
  });

  it("goes back to ?from= on cancel, to the run a setup started, else back", async () => {
    search = new URLSearchParams({ from: "/dashboard/library" });
    render(await WorkerSetupPage(params("pin-down")));
    // Showtime's setup carries its own heading, so the way back is handed to
    // it (it renders the Back button in its own header) instead of drawn here.
    expect(screen.queryByLabelText("Back")).toBeNull();

    const h = handlersSeen.at(-1) as { onClose: () => void; onSaved: (r: { runId?: string }) => void; backHref?: string };
    expect(h.backHref).toBe("/dashboard/library");
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
    expect((handlersSeen.at(-1) as { backHref?: string }).backHref).toBe("/dashboard/engagements/e1");
  });
});
