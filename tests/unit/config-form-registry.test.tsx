import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { PRODUCTS_WITH_SKILL_SETTINGS, WORKER_IDS, WORKER_REGISTRY } from "@/lib/worker-registry";
import { WORKERS_WITH_CONFIG_FORM, hasWorkerConfigForm, renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { ShowtimeSkillSettings } from "@/components/product-setup/showtime-skill-settings";
import { ShowtimeSetup } from "@/components/product-setup/showtime-setup";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { WhopSetup } from "@/components/product-setup/whop-setup";
import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";

type AnyProps = Record<string, unknown> & { onCancel?: () => void; onSaved?: (r?: unknown) => void; cancelLabel?: string };
const element = (id: Parameters<typeof renderWorkerConfigForm>[0], h: Parameters<typeof renderWorkerConfigForm>[1]) =>
  renderWorkerConfigForm(id, h) as ReactElement<AnyProps>;

describe("config form lookup", () => {
  it("has a form for exactly the workers with a Configure panel, every skill of a product whose setup opens per skill, and Pile-On", () => {
    // Pile-On has no "hinges panel" (worker.hasHingesPanel is false,
    // skill-manifest.ts) but still gets a real config form here
    // (ShowtimeSkillSettings, which loads its own current values) so every surface that renders a worker's
    // settings through this registry (the Library's product page among
    // them) can configure it in place instead of falling back to a
    // full-page navigation for lack of a registry entry.
    const withPanel = WORKER_IDS.filter((id) => WORKER_REGISTRY[id].hasHingesPanel || PRODUCTS_WITH_SKILL_SETTINGS.includes(WORKER_REGISTRY[id].productId) || id === "pile-on").sort();
    expect([...WORKERS_WITH_CONFIG_FORM].sort()).toEqual(withPanel);
  });

  it("covers the Cold Open and Whop Connect forms the Library used to be missing", () => {
    for (const id of ["icp-lock", "voice-capture", "source-connect", "send-connect", "daily-send", "whop-connect"]) {
      expect(hasWorkerConfigForm(id), id).toBe(true);
    }
  });

  it("reports an unknown worker as having none, but Pile-On as having a real one", () => {
    expect(hasWorkerConfigForm("not-a-worker")).toBe(false);
    expect(hasWorkerConfigForm("pile-on")).toBe(true);
    expect(renderWorkerConfigForm("pile-on", { engagementId: "e1", onClose: () => {} })).not.toBeNull();
  });

  it("opens Pile-On, Win-Back, Call Brief and Funnel Audit as their own Showtime settings, wiring cancel, save and the way back", () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    for (const id of ["pile-on", "win-back", "pre-call-read", "leak-map"] as const) {
      const el = element(id, { engagementId: "e1", onClose, onSaved, cancelLabel: "Close", backHref: "/dashboard/x" });
      expect(el.type, id).toBe(ShowtimeSkillSettings);
      expect(el.props.skill).toBe(id);
      expect(el.props.engagementId).toBe("e1");
      expect(el.props.onCancel).toBe(onClose);
      expect(el.props.onSaved).toBe(onSaved);
      expect(el.props.cancelLabel).toBe("Close");
      expect(el.props.backHref).toBe("/dashboard/x");
    }
  });

  it("passes onSaved through to setup forms", () => {
    const onSaved = vi.fn();
    const pinDown = element("pin-down", { engagementId: "e1", onClose: () => {}, onSaved });
    expect(pinDown.type).toBe(ShowtimeSetup);
    expect(pinDown.props.onSaved).toBe(onSaved);
    const rep = element("rep-onboarding", { engagementId: "e1", onClose: () => {}, onSaved });
    expect(rep.type).toBe(RepSetup);
    expect(rep.props.onSaved).toBe(onSaved);
    expect(element("icp-lock", { engagementId: "e1", onClose: () => {}, onSaved }).type).toBe(ColdOpenSetup);
  });

  it("opens Whop Agent's one setup from each of its configurable workers", () => {
    const onSaved = vi.fn();
    for (const id of ["whop-connect", "whop-cancellation-save-offer", "whop-bridge-manager"] as const) {
      const el = element(id, { engagementId: "e1", onClose: () => {}, onSaved });
      expect(el.type, id).toBe(WhopSetup);
      expect(el.props.onSaved).toBe(onSaved);
    }
  });

  it("opens each Cold Open, Rep and Whop skill as its own settings, and the onboarding page as the full setup", () => {
    const h = { engagementId: "e1", onClose: () => {} };
    expect(element("voice-capture", h).props.focus).toBe("voice-capture");
    expect(element("voice-capture", { ...h, mode: "setup" }).props.focus).toBe("voice-capture");
    expect(element("icp-lock", h).props.focus).toBe("icp-lock");
    expect(element("icp-lock", { ...h, mode: "setup" }).props.focus).toBeUndefined();
    expect(element("rep-crisis-response", h).type).toBe(RepSetup);
    expect(element("rep-crisis-response", h).props.focus).toBe("rep-crisis-response");
    expect(element("whop-dispute-response", h).type).toBe(WhopSetup);
    expect(element("whop-connect", { ...h, mode: "setup" }).props.focus).toBeUndefined();
  });
});
