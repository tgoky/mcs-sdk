import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/components/reports/compare-view", () => ({ CompareView: () => null }));

import { DynamicClientReport } from "@/components/reports/dynamic-client-report";
import { ReportPeriodProvider, PeriodTabs } from "@/app/dashboard/engagements/[id]/report-period-context";
import { emptyCounts } from "@/features/reports/server/client-results";
import type { ReportBlockWithTrend } from "@/lib/worker-report-blocks";

const block = (workerId: string, label: string, displayValue: string): ReportBlockWithTrend => ({ workerId: workerId as ReportBlockWithTrend["workerId"], label, value: 0, displayValue, trendLabel: "steady vs last week" });

describe("client report", () => {
  it("puts each skill's numbers inside its product's card, and keeps Targeting as its own line", () => {
    const week = [block("pin-down", "Bookings", "0"), block("win-back", "Win-back recovery", "No data"), block("rep-engine-panel", "AI engine mentions", "0")];
    render(
      <ReportPeriodProvider>
        <PeriodTabs />
        <DynamicClientReport
          engagementId="e1"
          offerDetails={{ name: "AI Clarity Call", icp: "Business owners pitched by AI agencies." }}
          blocksByPeriod={{ week, month: [block("pin-down", "Bookings", "4")], all_time: [] }}
          enabledWorkerIds={["pin-down", "win-back", "rep-engine-panel"]}
          results={{
            engagementId: "e1",
            buyer: "b",
            current: emptyCounts(),
            previous: emptyCounts(),
            products: [{ product: "showtime", metrics: [{ key: "booked", label: "Calls booked", current: 0, previous: 2, format: "count", better: "up" }] }],
            showRate: null,
            holdout: null,
          }}
        />
      </ReportPeriodProvider>
    );
    const showtime = screen.getByText("Showtime").parentElement!;
    expect(within(showtime).getByText("Calls booked")).toBeTruthy();
    expect(within(showtime).getByText("Bookings")).toBeTruthy();
    expect(within(showtime).getByText("Win-back recovery")).toBeTruthy();
    expect(within(showtime).queryByText("AI engine mentions")).toBeNull();
    // Reputation has no 30-day results yet, but still gets its card for its numbers.
    const rep = screen.getByText("Reputation Manager").parentElement!;
    expect(within(rep).getByText("AI engine mentions")).toBeTruthy();
    expect(screen.getByText("Business owners pitched by AI agencies.").closest(".rounded-xl")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    expect(within(showtime).getByText("4")).toBeTruthy();
    expect(screen.queryByText("AI engine mentions")).toBeNull();
  });
});
