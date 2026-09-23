import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const config = vi.fn();
type Save = (...a: unknown[]) => Promise<unknown>;
const icp = vi.fn<Save>(async () => ({ ok: true }));
const voice = vi.fn<Save>(async () => ({ ok: true, warnings: ["w"] }));
const send = vi.fn<Save>(async () => ({ ok: true }));
const daily = vi.fn<Save>(async () => ({ ok: true }));

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/cold-open/server/config", () => ({ getColdOpenConfig: () => config() }));
vi.mock("@/features/cold-open/server/icp-lock", () => ({ saveIcpLockIntake: (...a: unknown[]) => (calls.push("icp"), icp(...a)) }));
vi.mock("@/features/cold-open/server/voice-capture", () => ({ saveVoiceCapture: (...a: unknown[]) => (calls.push("voice"), voice(...a)) }));
vi.mock("@/features/cold-open/server/send-connect", () => ({ saveSendConnect: (...a: unknown[]) => (calls.push("send"), send(...a)) }));
vi.mock("@/features/cold-open/server/daily-send", () => ({ saveDailySendSettings: (...a: unknown[]) => (calls.push("daily"), daily(...a)) }));

import { saveColdOpenSetup, type ColdOpenSetupInput } from "@/lib/cold-open-setup/save";

const input = (over: Partial<ColdOpenSetupInput> = {}): ColdOpenSetupInput => ({
  product: { name: "Acme", url: "https://acme.io", price: "", valueProp: "Finds leaks" },
  icps: [{ slug: "agencies", label: "Agencies", weight: 1, teamSizeMin: 10, teamSizeMax: null, disqualifyIf: [] }],
  voice: { greeting: "Hi", signOff: "Best", tone: "Plain" },
  subjects: ["a", "b", "c"],
  touchsets: [
    { subject: "s1", body1: "a", body2: "b", body3: "c" },
    { subject: "s2", body1: "a", body2: "b", body3: "c" },
  ],
  platform: "instantly",
  campaignMap: { agencies: "c1" },
  daily: { volume: 20, localHour: 9, timezone: null, copyMode: "upload" },
  skills: [],
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  config.mockResolvedValue(null);
});

describe("saveColdOpenSetup", () => {
  it("saves each section through its own save path, in order, with live sending off for a new client", async () => {
    const r = await saveColdOpenSetup("e1", input());
    expect(r).toEqual({ ok: true, warnings: ["w"], sendingSaved: true });
    expect(calls).toEqual(["icp", "voice", "send", "daily"]);
    expect(icp.mock.calls[0][1]).toMatchObject({ productAllocation: { Acme: 1 }, sizingBounds: { agencies: { teamSizeMin: 10, disqualifyIf: [] } } });
    expect(voice.mock.calls[0][1]).toMatchObject({ bodyVariantPools: { default: input().touchsets } });
    expect(daily.mock.calls[0][1]).toMatchObject({ liveSendEnabled: false, copyMode: "upload" });
  });

  it("keeps live sending, other ICPs' own pools and a saved multi-product split as they were", async () => {
    config.mockResolvedValue({
      icps: [{ slug: "agencies", label: "Agencies", weight: 1, tracking: { openTracking: false, linkTracking: true } }],
      productAllocation: { A: 0.5, B: 0.5 },
      reviewRequiredIcps: ["agencies", "gone"],
      bodyVariantPools: { agencies: [{ subject: "x", body1: "x", body2: "x", body3: "x" }], gone: [], default: [] },
      voiceProfile: { greeting: "Hi", signOff: "Best", tone: "Plain", sourceDomain: "acme.io" },
      sendPlatform: { platform: "instantly", baseUrl: "https://eu.instantly.ai/api/v2" },
      autoPushIcps: [],
      dailySendSettings: { volume: 5, localHour: 8, copyMode: "upload", liveSendEnabled: true },
    });
    await saveColdOpenSetup("e1", input());
    expect(icp.mock.calls[0][1]).toMatchObject({ productAllocation: { A: 0.5, B: 0.5 }, reviewRequiredIcps: ["agencies"], icps: [{ slug: "agencies", tracking: { openTracking: false, linkTracking: true } }] });
    expect(Object.keys((voice.mock.calls[0][1] as { bodyVariantPools: object }).bodyVariantPools).sort()).toEqual(["agencies", "default"]);
    expect(send.mock.calls[0][1]).toMatchObject({ baseUrl: "https://eu.instantly.ai/api/v2" });
    expect(daily.mock.calls[0][1]).toMatchObject({ liveSendEnabled: true });
  });

  it("skips campaigns when none are mapped yet", async () => {
    const r = await saveColdOpenSetup("e1", input({ campaignMap: {}, daily: { volume: 20, localHour: 9, timezone: null, copyMode: "generate" }, touchsets: [] }));
    expect(r).toMatchObject({ ok: true, sendingSaved: false });
    expect(calls).toEqual(["icp", "voice", "daily"]);
  });

  it("stops at the first failing section and names it", async () => {
    voice.mockResolvedValueOnce({ error: "Subject pool failed" });
    expect(await saveColdOpenSetup("e1", input())).toEqual({ error: "Subject pool failed", step: "How you write" });
    expect(calls).toEqual(["icp", "voice"]);
  });

  it("won't send your own emails with fewer than two of them", async () => {
    const r = await saveColdOpenSetup("e1", input({ touchsets: [input().touchsets[0]] }));
    expect(r).toMatchObject({ step: "Your emails" });
    expect(calls).toEqual([]);
  });
});
