import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionMenu, ActionMenuItem } from "@/components/action-menu";

describe("a dropdown menu", () => {
  it("opens where it belongs instead of sliding in from the corner it's first drawn at", () => {
    render(
      <ActionMenu align="end" panelWidth={220} trigger={({ toggle }) => <button onClick={toggle}>More</button>}>
        {() => <ActionMenuItem label="Edit workspace name" />}
      </ActionMenu>
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const positioned = screen.getByRole("menu").parentElement!;
    // Its fade uses a duration class, which would otherwise animate top/left too.
    expect(positioned.style.transition).toBe("none");
  });
});
