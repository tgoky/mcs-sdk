import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { QueuePanel, type QueueItemDTO } from "@/app/dashboard/queue-panel";
import { LiveExecutionFeed } from "@/app/dashboard/live-execution-feed";

const CLIENTS = [
  { engagementId: "eng-acme", buyer: "Acme Co" },
  { engagementId: "eng-globex", buyer: "Globex Inc" },
];

function queueItem(overrides: Partial<QueueItemDTO> = {}): QueueItemDTO {
  return {
    id: `item-${Math.random()}`,
    source: "action",
    category: "approve",
    title: "Approve outreach copy",
    subtitle: "Ready to send",
    engagementId: "eng-acme",
    buyer: "Acme Co",
    runId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function run(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `run-${Math.random()}`,
    skillName: "pile-on",
    status: "success",
    phase: null,
    startedAt: new Date().toISOString(),
    buyerName: "Acme Co",
    engagementId: "eng-acme",
    ...overrides,
  };
}

/** Both panels render more than one role="tablist" (the All/Clients scope
 * switch, plus each panel's own internal category tabs) — "Clients" is
 * the only tab labeled that in either, so it's safe to locate the scope
 * switch by starting from it. */
function getScopeTablist() {
  return screen.getByRole("tab", { name: /^Clients/ }).closest('[role="tablist"]') as HTMLElement;
}

describe("Client scope rail — QueuePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to All: no roster, no per-client list, existing flat item list shown", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <QueuePanel
        initialItems={[queueItem({ title: "Approve Acme copy", buyer: "Acme Co" })]}
        clients={CLIENTS}
      />
    );
    expect(screen.getByText("Approve Acme copy")).toBeInTheDocument();
    // The rail's client-search box only renders once "Clients" is picked.
    expect(screen.queryByPlaceholderText("Search clients...")).not.toBeInTheDocument();
  });

  it("switching to Clients (nothing picked) shows the aggregate roster, not the item list", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <QueuePanel
        initialItems={[
          queueItem({ engagementId: "eng-acme", buyer: "Acme Co", category: "approve" }),
          queueItem({ engagementId: "eng-acme", buyer: "Acme Co", category: "approve" }),
          queueItem({ engagementId: "eng-globex", buyer: "Globex Inc", category: "alert" }),
        ]}
        clients={CLIENTS}
      />
    );

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));

    // Roster grain: one row per client, not one row per item.
    const acmeRow = screen.getByTestId("roster-row-eng-acme");
    expect(within(acmeRow).getByText("2")).toBeInTheDocument(); // 2 approve-category items rolled up
    expect(screen.getByTestId("roster-row-eng-globex")).toBeInTheDocument();
    expect(screen.queryByText("Approve outreach copy")).not.toBeInTheDocument();
  });

  it("picking a client from the rail scopes the item list down to just that client", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <QueuePanel
        initialItems={[
          queueItem({ id: "a1", engagementId: "eng-acme", buyer: "Acme Co", title: "Acme item" }),
          queueItem({ id: "g1", engagementId: "eng-globex", buyer: "Globex Inc", title: "Globex item" }),
        ]}
        clients={CLIENTS}
      />
    );

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));
    fireEvent.click(screen.getByTestId("rail-client-eng-acme"));

    expect(screen.getByText("Acme item")).toBeInTheDocument();
    expect(screen.queryByText("Globex item")).not.toBeInTheDocument();
  });

  it("picking a roster row drills into that client the same way the rail entry does", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <QueuePanel
        initialItems={[
          queueItem({ id: "a1", engagementId: "eng-acme", buyer: "Acme Co", title: "Acme item" }),
          queueItem({ id: "g1", engagementId: "eng-globex", buyer: "Globex Inc", title: "Globex item" }),
        ]}
        clients={CLIENTS}
      />
    );

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));
    fireEvent.click(screen.getByTestId("roster-row-eng-globex"));

    expect(screen.getByText("Globex item")).toBeInTheDocument();
    expect(screen.queryByText("Acme item")).not.toBeInTheDocument();
  });

  it("switching back to All un-scopes everything, even if a client was previously picked", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(
      <QueuePanel
        initialItems={[
          queueItem({ id: "a1", engagementId: "eng-acme", buyer: "Acme Co", title: "Acme item" }),
          queueItem({ id: "g1", engagementId: "eng-globex", buyer: "Globex Inc", title: "Globex item" }),
        ]}
        clients={CLIENTS}
      />
    );

    const scopeTablist = getScopeTablist();
    fireEvent.click(within(scopeTablist).getByRole("tab", { name: /^Clients/ }));
    fireEvent.click(screen.getByTestId("rail-client-eng-acme"));
    expect(screen.queryByText("Globex item")).not.toBeInTheDocument();

    fireEvent.click(within(scopeTablist).getByRole("tab", { name: "All" }));
    expect(screen.getByText("Acme item")).toBeInTheDocument();
    expect(screen.getByText("Globex item")).toBeInTheDocument();
    // No stale "back to all clients" breadcrumb once we're actually back on All.
    expect(screen.queryByText(/All clients/)).not.toBeInTheDocument();
  });

  it("searching the rail filters the client list", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<QueuePanel initialItems={[queueItem()]} clients={CLIENTS} />);

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));
    fireEvent.change(screen.getByPlaceholderText("Search clients..."), { target: { value: "glob" } });

    expect(screen.getByTestId("rail-client-eng-globex")).toBeInTheDocument();
    expect(screen.queryByTestId("rail-client-eng-acme")).not.toBeInTheDocument();
  });

  it("omitting the clients prop renders exactly as before — no rail at all", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<QueuePanel initialItems={[queueItem({ title: "Unscoped item" })]} />);
    expect(screen.getByText("Unscoped item")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Clients/ })).not.toBeInTheDocument();
  });
});

describe("Client scope rail — LiveExecutionFeed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to All: existing flat run list shown, no roster", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await act(async () => {
      render(<LiveExecutionFeed initialRuns={[run({ buyerName: "Acme Co" })]} clients={CLIENTS} />);
    });
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search clients...")).not.toBeInTheDocument();
  });

  it("Clients scope with nothing picked shows the roster (running/failed/completed rollup), not run rows", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await act(async () => {
      render(
        <LiveExecutionFeed
          initialRuns={[
            run({ id: "r1", buyerName: "Acme Co", engagementId: "eng-acme", status: "running" }),
            run({ id: "r2", buyerName: "Acme Co", engagementId: "eng-acme", status: "running" }),
            run({ id: "r3", buyerName: "Globex Inc", engagementId: "eng-globex", status: "success" }),
          ]}
          clients={CLIENTS}
        />
      );
    });

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));

    const acmeRow = screen.getByTestId("roster-row-eng-acme");
    expect(within(acmeRow).getByText("2")).toBeInTheDocument(); // 2 running
    expect(screen.getByTestId("roster-row-eng-globex")).toBeInTheDocument();
  });

  it("picking a client from the rail scopes runs down to that client", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await act(async () => {
      render(
        <LiveExecutionFeed
          initialRuns={[
            run({ id: "r1", buyerName: "Acme Co", engagementId: "eng-acme" }),
            run({ id: "r2", buyerName: "Globex Inc", engagementId: "eng-globex" }),
          ]}
          clients={CLIENTS}
        />
      );
    });

    fireEvent.click(within(getScopeTablist()).getByRole("tab", { name: /^Clients/ }));
    fireEvent.click(screen.getByTestId("rail-client-eng-acme"));

    // Scope to the run table itself — the rail (still visible in Clients
    // mode) also shows "Acme Co" as a list entry, so an unscoped query
    // here would be ambiguous.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Acme Co")).toBeInTheDocument();
    expect(within(table).queryByText("Globex Inc")).not.toBeInTheDocument();
  });

  it("omitting the clients prop renders exactly as before — no rail at all", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await act(async () => {
      render(<LiveExecutionFeed initialRuns={[run({ buyerName: "Unscoped Co" })]} />);
    });
    expect(screen.getByText("Unscoped Co")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Clients/ })).not.toBeInTheDocument();
  });
});
