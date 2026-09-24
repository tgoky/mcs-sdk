import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { PRODUCTS_WITH_SKILL_SETTINGS, WORKER_IDS, WORKER_REGISTRY } from "@/lib/worker-registry";
import { WORKERS_WITH_CONFIG_FORM, hasWorkerConfigForm, renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { ShowtimeSetup } from "@/components/product-setup/showtime-setup";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { WhopSetup } from "@/components/product-setup/whop-setup";
import { ColdOpenSetup } from "@/components/product-setup/cold-open-setup";

type AnyProps = Record<string, unknown> & { onCancel?: () => void; onSaved?: (r?: unknown) => void; cancelLabel?: string };
const element = (id: Parameters<typeof renderWorkerConfigForm>[0], h: Parameters<typeof renderWorkerConfigForm>[1]) =>
  renderWorkerConfigForm(id, h) as ReactElement<AnyProps>;

describe("config form lookup", () => {
  it("has a form for exactly the workers with a Configure panel, and for every skill of a product whose setup opens per skill", () => {
    const withPanel = WORKER_IDS.filter((id) => WORKER_REGISTRY[id].hasHingesPanel || PRODUCTS_WITH_SKILL_SETTINGS.includes(WORKER_REGISTRY[id].productId)).sort();
    expect([...WORKERS_WITH_CONFIG_FORM].sort()).toEqual(withPanel);
  });

  it("covers the Cold Open and Whop Connect forms the Library used to be missing", () => {
    for (const id of ["icp-lock", "voice-capture", "source-connect", "send-connect", "daily-send", "whop-connect"]) {
      expect(hasWorkerConfigForm(id), id).toBe(true);
    }
  });

  it("reports unknown and form-less workers as having none", () => {
    expect(hasWorkerConfigForm("not-a-worker")).toBe(false);
    expect(hasWorkerConfigForm("pile-on")).toBe(false);
    expect(renderWorkerConfigForm("pile-on", { engagementId: "e1", onClose: () => {} })).toBeNull();
  });

  it("wires a simple form's cancel and label", () => {
    const onClose = vi.fn();
    const el = element("leak-map", { engagementId: "e1", onClose, cancelLabel: "Close" });
    expect(el.type).toBe(LeakMapConfigForm);
    expect(el.props.engagementId).toBe("e1");
    expect(el.props.onCancel).toBe(onClose);
    expect(el.props.cancelLabel).toBe("Close");
    expect(el.props.onSaved).toBeUndefined();
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
