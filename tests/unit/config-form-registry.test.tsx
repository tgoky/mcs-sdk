import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { WORKER_IDS, WORKER_REGISTRY } from "@/lib/worker-registry";
import { WORKERS_WITH_CONFIG_FORM, hasWorkerConfigForm, renderWorkerConfigForm } from "@/components/worker-config-forms/config-form-registry";
import { LeakMapConfigForm } from "@/components/worker-config-forms/leak-map-config-form";
import { ShowtimeSetup } from "@/components/product-setup/showtime-setup";
import { RepSetup } from "@/components/product-setup/rep-setup";
import { WhopConnectConfigForm } from "@/components/worker-config-forms/whop-connect-config-form";
import { WhopBridgeManagerConfigForm } from "@/components/worker-config-forms/whop-bridge-manager-config-form";
import { IcpLockConfigForm } from "@/components/worker-config-forms/icp-lock-config-form";

type AnyProps = Record<string, unknown> & { onCancel?: () => void; onSaved?: (r?: unknown) => void; cancelLabel?: string };
const element = (id: Parameters<typeof renderWorkerConfigForm>[0], h: Parameters<typeof renderWorkerConfigForm>[1]) =>
  renderWorkerConfigForm(id, h) as ReactElement<AnyProps>;

describe("config form lookup", () => {
  it("has a form for exactly the workers the registry says have a Configure panel", () => {
    const withPanel = WORKER_IDS.filter((id) => WORKER_REGISTRY[id].hasHingesPanel).sort();
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
    expect(element("icp-lock", { engagementId: "e1", onClose: () => {}, onSaved }).type).toBe(IcpLockConfigForm);
  });

  it("adapts forms whose onSaved has a different shape, and leaves it off when the caller has none", () => {
    const onSaved = vi.fn();
    const whopConnect = element("whop-connect", { engagementId: "e1", onClose: () => {}, onSaved });
    expect(whopConnect.type).toBe(WhopConnectConfigForm);
    whopConnect.props.onSaved?.(undefined);
    expect(onSaved).toHaveBeenLastCalledWith({});
    whopConnect.props.onSaved?.({ runId: "r1" });
    expect(onSaved).toHaveBeenLastCalledWith({ runId: "r1" });

    const bridge = element("whop-bridge-manager", { engagementId: "e1", onClose: () => {}, onSaved });
    expect(bridge.type).toBe(WhopBridgeManagerConfigForm);
    bridge.props.onSaved?.();
    expect(onSaved).toHaveBeenLastCalledWith({});

    expect(element("whop-bridge-manager", { engagementId: "e1", onClose: () => {} }).props.onSaved).toBeUndefined();
  });
});
