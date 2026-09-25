import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RepRunNow, hasRepRunNow } from "@/components/product-setup/rep-run-now";

describe("a watch's one-off action", () => {
  it("exists only for the four watches that have one", () => {
    expect(hasRepRunNow("rep-trustpilot-watch")).toBe(true);
    expect(hasRepRunNow("rep-crisis-response")).toBe(false);
    expect(hasRepRunNow(undefined)).toBe(false);
  });

  it("looks further back on Trustpilot from a chosen date, and links the run", async () => {
    const bodies: unknown[] = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ runId: "run-3", message: "Scanning since Jan 1." }));
    }) as unknown as typeof fetch;
    render(<RepRunNow engagementId="e1" skill="rep-trustpilot-watch" />);
    const button = screen.getByRole("button", { name: "Look back" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Since"), { target: { value: "2026-01-01" } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("link", { name: /Follow it/ })).toHaveAttribute("href", "/dashboard/runs/run-3"));
    expect(bodies[0]).toEqual({ action: "trustpilot_deep_scan", deepScanSinceDate: "2026-01-01" });
  });

  it("widens Reddit over a window, with nothing to type", async () => {
    const bodies: unknown[] = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ message: "Started." }));
    }) as unknown as typeof fetch;
    render(<RepRunNow engagementId="e1" skill="rep-reddit-watch" />);
    fireEvent.change(screen.getByLabelText("Over"), { target: { value: "year" } });
    fireEvent.click(screen.getByRole("button", { name: "Widen the search" }));
    await waitFor(() => expect(bodies).toEqual([{ action: "reddit_deep_scan", deepScanTimeframe: "year" }]));
  });
});
