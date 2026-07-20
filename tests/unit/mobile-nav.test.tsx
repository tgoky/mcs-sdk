import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileNav } from "@/app/dashboard/mobile-nav";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/engagements", label: "Clients" },
  { href: "/dashboard/credentials", label: "Credentials" },
];

describe("MobileNav", () => {
  it("is closed by default — no Home link or nav links visible", () => {
    render(<MobileNav links={links} displayName="alex" />);
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("shows a Home link above the in-app nav links once opened", () => {
    render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));

    const home = screen.getByText("Home");
    expect(home.closest("a")).toHaveAttribute("href", "/home");

    // Home must render before (visually above) the in-app links, so it
    // reads as "leave this app" rather than another item in the same list.
    const allLinks = screen.getAllByRole("link").map((el) => el.textContent);
    expect(allLinks[0]).toBe("Home");
    expect(allLinks).toContain("Dashboard");
  });

  it("renders every provided nav link with its own href", () => {
    render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));

    for (const link of links) {
      expect(screen.getByText(link.label).closest("a")).toHaveAttribute("href", link.href);
    }
  });

  it("shows the display name and a sign-out link when provided", () => {
    render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(screen.getByText("alex")).toBeInTheDocument();
    expect(screen.getByText("Sign out").closest("a")).toHaveAttribute("href", "/api/auth/logout");
  });

  it("omits the user footer entirely when no displayName is given", () => {
    render(<MobileNav links={links} />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("closes the panel when the Home link is clicked", () => {
    render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    fireEvent.click(screen.getByText("Home"));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("closes the panel when a nav link is clicked", () => {
    render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    fireEvent.click(screen.getByText("Clients"));
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("closes the panel when the backdrop is clicked", () => {
    const { container } = render(<MobileNav links={links} displayName="alex" />);
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    const backdrop = container.querySelector(".fixed.inset-0")!;
    fireEvent.click(backdrop);
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });
});
