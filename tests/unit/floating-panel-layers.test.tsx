import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FloatingPanel } from "@/components/floating-panel";
import { ToolAvatar } from "@/components/product-setup/tool-avatar";
import { findShowtimeTool } from "@/lib/showtime-setup/catalog";

const actions = { useSaved: async () => null, connectKey: async () => null, signIn: async () => null, disconnect: async () => null, choose: () => {} };

describe("a card opened from inside a settings panel", () => {
  it("can be clicked without closing the panel it came from", async () => {
    render(
      <FloatingPanel defaultOpen trigger={({ toggle }) => <button onClick={toggle}>gear</button>}>
        {() => (
          <div data-testid="panel">
            <ToolAvatar tool={findShowtimeTool("calendly")!} state={undefined} selected={false} buyer="B" actions={actions} />
          </div>
        )}
      </FloatingPanel>
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Calendly/ }));
    await act(async () => {});
    const card = screen.getByRole("dialog", { name: "Calendly connection" });
    fireEvent.mouseDown(card);
    await act(async () => {});
    expect(screen.getByTestId("panel")).toBeInTheDocument();

    // A real click away still closes it.
    fireEvent.mouseDown(document.body);
    await act(async () => {});
    expect(screen.queryByTestId("panel")).not.toBeInTheDocument();
  });
});
