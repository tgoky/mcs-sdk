import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }), usePathname: () => "/dashboard" }));
vi.mock("@/components/toast/toast-provider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
// The settings themselves are tested in skill-settings-panel.test.tsx; here
// the panel stands in, able to say it has unsaved changes.
vi.mock("@/components/skill-settings/skill-settings-panel", () => ({
  SkillSettingsPanel: ({ skillId, onDirtyChange }: { skillId: string; onDirtyChange?: (d: boolean) => void }) => (
    <div data-testid="settings">
      {skillId}
      <button onClick={() => onDirtyChange?.(true)}>edit</button>
    </div>
  ),
}));

import { settingsBeyondSetup, SETUP_COVERS, SKILL_SETTINGS } from "@/lib/skill-settings/schema";
import { SkillPaneProvider, useSkillPane } from "@/components/skill-settings/skill-pane-context";
import { SkillSettingsPane } from "@/components/skill-settings/skill-settings-pane";
import { InPageSettings } from "@/components/skill-settings/in-page-settings";
import { SkillConfigureMenu } from "@/app/dashboard/engagements/[id]/skill-configure-menu";
import { SkillsNavList } from "@/components/skills-nav-list";
import { WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";

function setDesktop(desktop: boolean) {
  window.matchMedia = ((q: string) => ({ matches: desktop && q.includes("min-width"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  push.mockClear();
  setDesktop(true);
});

describe("setup pages cover everything, once", () => {
  it("leaves nothing out and shows nothing twice", () => {
    for (const [skill, spec] of Object.entries(SKILL_SETTINGS)) {
      const product = WORKER_REGISTRY[skill as WorkerId].productId;
      const covered = new Set(SETUP_COVERS[product] ?? []);
      const rest = settingsBeyondSetup(skill, product);
      for (const f of spec!.fields) {
        // Every setting is either asked by the setup or in its skill's block (addresses and connections go with their choice).
        if (f.kind === "copy" || f.kind === "connect") continue;
        expect(covered.has(f.path) || rest.includes(f.path), `${skill} ${f.path}`).toBe(true);
        expect(covered.has(f.path) && rest.includes(f.path), `${skill} ${f.path} twice`).toBe(false);
      }
    }
    // Whop's and Reputation's setups already ask all of theirs.
    expect(settingsBeyondSetup("whop-cancellation-save-offer", "whop-agent")).toEqual([]);
    expect(settingsBeyondSetup("rep-crisis-response", "reputation-manager")).toEqual([]);
    expect(settingsBeyondSetup("daily-send", "cold-open")).toEqual(["dailySendSettings.liveSendEnabled"]);
  });
});

function OpenSkill() {
  const pane = useSkillPane();
  return <p data-testid="open">{pane?.current?.skillId ?? "none"}</p>;
}

describe("the settings pane", () => {
  it("opens beside the page from a gear, swaps on another gear, and asks before dropping unsaved changes", async () => {
    render(
      <SkillPaneProvider>
        <SkillConfigureMenu skillId="pile-on" engagementId="e1" />
        <SkillConfigureMenu skillId="win-back" engagementId="e1" />
        <OpenSkill />
        <SkillSettingsPane width={440} onWidthChange={() => {}} />
      </SkillPaneProvider>
    );
    const [pileOn, winBack] = screen.getAllByRole("button", { name: "Configure" });
    fireEvent.click(pileOn);
    expect(screen.getByTestId("open")).toHaveTextContent("pile-on");
    expect(screen.getByTestId("settings")).toHaveTextContent("pile-on");

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    fireEvent.click(winBack);
    const ask = screen.getByRole("alert");
    expect(ask).toHaveTextContent("unsaved changes");
    expect(screen.getByTestId("open")).toHaveTextContent("pile-on");
    fireEvent.click(within(ask).getByRole("button", { name: "Discard" }));
    expect(screen.getByTestId("open")).toHaveTextContent("win-back");
    await act(async () => {});
    expect(screen.getByTestId("settings")).toHaveTextContent("win-back");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("open")).toHaveTextContent("none");
  });

  it("opens the settings page on a phone", () => {
    setDesktop(false);
    render(
      <SkillPaneProvider>
        <SkillConfigureMenu skillId="pile-on" engagementId="e1" />
      </SkillPaneProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    expect(push).toHaveBeenCalledWith("/dashboard/engagements/e1/skills/pile-on/settings");
  });

  it("gives no gear to a skill with nothing to set", () => {
    render(
      <SkillPaneProvider>
        <SkillConfigureMenu skillId="rep-digest" engagementId="e1" />
      </SkillPaneProvider>
    );
    expect(screen.queryByRole("button", { name: "Configure" })).toBeNull();
  });

  it("in a page's list, opens beside the list and tells the list which row is open", () => {
    render(
      <SkillPaneProvider>
        <OpenSkill />
        <InPageSettings>
          {(openSkillId) => (
            <div>
              <p data-testid="row-open">{openSkillId ?? "none"}</p>
              <SkillConfigureMenu skillId="pile-on" engagementId="e1" />
            </div>
          )}
        </InPageSettings>
      </SkillPaneProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    expect(screen.getByTestId("row-open")).toHaveTextContent("pile-on");
    // Not the app's right-edge one.
    expect(screen.getByTestId("open")).toHaveTextContent("none");
  });
});

describe("the sidebar's gears", () => {
  it("open a skill's settings at the right edge, only for skills with settings", () => {
    render(
      <SkillPaneProvider>
        <SkillsNavList layout="grid" productIds={["showtime", "reputation-manager"]} enabledWorkerIds={["pile-on", "rep-digest"] as WorkerId[]} engagementId="e1" />
        <OpenSkill />
      </SkillPaneProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Showtime\s*1 on/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reputation Manager\s*1 on/ }));
    expect(screen.queryByRole("button", { name: `${WORKER_REGISTRY["rep-digest"].name} settings` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `${WORKER_REGISTRY["pile-on"].name} settings` }));
    expect(screen.getByTestId("open")).toHaveTextContent("pile-on");
  });
});
