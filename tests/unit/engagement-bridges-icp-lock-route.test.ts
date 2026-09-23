import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn(), isPackageInstalledInWorkspace: vi.fn() }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: vi.fn(), setSkillEnabledForEngagement: vi.fn() }));
vi.mock("@/lib/skill-dispatch", () => ({ dispatchSkillRun: vi.fn() }));
vi.mock("@/features/cold-open/server/icp-lock", () => ({ saveIcpLockIntake: vi.fn() }));
vi.mock("@/features/cold-open/server/config", () => ({ getColdOpenConfig: vi.fn(), upsertColdOpenConfig: vi.fn() }));
vi.mock("@/features/cold-open/server/voice-capture", () => ({ saveVoiceCapture: vi.fn() }));
vi.mock("@/features/cold-open/server/daily-send", () => ({ saveDailySendSettings: vi.fn() }));
vi.mock("@/lib/client-profile", () => ({ getPrimaryDomainForEngagement: vi.fn(), seedPrimaryDomainFromUrl: vi.fn() }));
vi.mock("@/lib/client-facts", () => ({ getClientFacts: vi.fn(), recordDossierDecisions: vi.fn() }));
vi.mock("@/lib/field-writeback", async () => {
  const actual = await vi.importActual<typeof import("@/lib/field-writeback")>("@/lib/field-writeback");
  return { isFactTrusted: actual.isFactTrusted, applyResolvableFacts: vi.fn() };
});

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { isSkillEnabledForEngagement, setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { saveIcpLockIntake } from "@/features/cold-open/server/icp-lock";
import { getColdOpenConfig, upsertColdOpenConfig } from "@/features/cold-open/server/config";
import { saveVoiceCapture } from "@/features/cold-open/server/voice-capture";
import { saveDailySendSettings } from "@/features/cold-open/server/daily-send";
import { getPrimaryDomainForEngagement, seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { getClientFacts, recordDossierDecisions } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/icp-lock/route");
}
const params = { params: Promise.resolve({ id: "e1" }) };
function postBody(body: unknown) {
  return new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function fact(key: string, value: unknown, source: string, extra: Record<string, unknown> = {}) {
  return { key, value, source, status: "suggested", confidence: null, sourceDetail: null, evidence: null, updatedAt: new Date(), ...extra };
}

const baseInput = {
  productName: "Acme Demos",
  productUrl: "https://acme.com",
  productPrice: "",
  productValueProp: "More demos",
  productAllocation: { "Acme Demos": 1 },
  icps: [{ slug: "saas", label: "SaaS founders", weight: 1 }],
  sizingBounds: {},
  reviewRequiredIcps: [],
};

describe("icp-lock bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
    vi.mocked(isPackageInstalledInWorkspace).mockResolvedValue(true);
    vi.mocked(isSkillEnabledForEngagement).mockResolvedValue(false);
    vi.mocked(setSkillEnabledForEngagement).mockResolvedValue(undefined);
    vi.mocked(dispatchSkillRun).mockResolvedValue("run-1");
    vi.mocked(applyResolvableFacts).mockResolvedValue([]);
    vi.mocked(getPrimaryDomainForEngagement).mockResolvedValue("acme.com");
    vi.mocked(seedPrimaryDomainFromUrl).mockResolvedValue(undefined);
    vi.mocked(getClientFacts).mockResolvedValue({});
    vi.mocked(recordDossierDecisions).mockResolvedValue(undefined);
    vi.mocked(saveIcpLockIntake).mockResolvedValue({ ok: true } as any);
    vi.mocked(saveVoiceCapture).mockResolvedValue({ ok: true, warnings: [] });
    vi.mocked(saveDailySendSettings).mockResolvedValue({ ok: true });
    Object.assign(db, fakeDb([{ engagementId: "e1", buyer: "Acme", stack: { timezone: "America/Chicago" } }]));
  });

  it("GET returns low-scored ICPs as a suggestion, not as the configured list, and no invented voice", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue(null as any);
    vi.mocked(getClientFacts).mockResolvedValue({
      icps: fact("icps", [{ slug: "saas", label: "SaaS founders", weight: 1 }], "jev", { confidence: 30 }),
    } as any);

    const { GET } = await importRoute();
    const data = await (await GET(new Request("http://x"), params)).json();

    expect(data.config.icps).toEqual([]);
    expect(data.suggestions.icps.confidence).toBe(30);
    expect(data.config.voiceProfile).toBeNull();
    expect(data.config.productName).toBe("");
    expect(data.config.productUrl).toBe("https://acme.com");
    expect(data.config.dailySendSettings).toBeNull();
    expect(data.config.defaultCopyMode).toBe("generate");
    expect(data.config.clientTimezone).toBe("America/Chicago");
  });

  it("POST saves the voice through Voice Capture, keeping saved subject lines and templates", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue({
      subjectVariants: ["Quick question"],
      bodyVariantPools: { saas: [{ a: 1 }] },
      voiceProfile: { greeting: "Hi", signOff: "Best", tone: "Direct", sourceDomain: "acme.com" },
      dailySendSettings: { volume: 20, localHour: 9, copyMode: "upload", liveSendEnabled: true },
    } as any);

    const { POST } = await importRoute();
    const res = await POST(postBody({ ...baseInput, voiceProfile: { greeting: "Hey {first_name},", signOff: "Cheers,", tone: "Warm" } }), params);

    expect(res.status).toBe(200);
    expect(saveVoiceCapture).toHaveBeenCalledWith("e1", {
      greeting: "Hey {first_name},",
      signOff: "Cheers,",
      tone: "Warm",
      sourceDomain: "acme.com",
      subjectVariants: ["Quick question"],
      bodyVariantPools: { saas: [{ a: 1 }] },
    });
  });

  it("POST saves daily-send in the real shape and keeps the live-send switch as saved", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue({ dailySendSettings: { liveSendEnabled: true } } as any);

    const { POST } = await importRoute();
    await POST(postBody({ ...baseInput, dailySendSettings: { volume: 40, localHour: 10, timezone: "America/Chicago", copyMode: "generate" } }), params);

    expect(saveDailySendSettings).toHaveBeenCalledWith("e1", {
      volume: 40,
      localHour: 10,
      timezone: "America/Chicago",
      copyMode: "generate",
      liveSendEnabled: true,
    });
  });

  it("POST doesn't touch voice or daily-send when the dossier didn't fill them in", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue(null as any);
    const { POST } = await importRoute();
    await POST(postBody(baseInput), params);

    expect(saveVoiceCapture).not.toHaveBeenCalled();
    expect(saveDailySendSettings).not.toHaveBeenCalled();
    expect(recordDossierDecisions).toHaveBeenCalledWith("e1", expect.objectContaining({ icps: baseInput.icps }));
  });

  it("POST reports a voice validation error instead of dropping it", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue(null as any);
    vi.mocked(saveVoiceCapture).mockResolvedValue({ error: "Subject pool failed validation" });
    const { POST } = await importRoute();
    const res = await POST(postBody({ ...baseInput, voiceProfile: { greeting: "Hi", signOff: "Best", tone: "Direct" } }), params);
    expect(res.status).toBe(400);
  });

  it("POST saves the sending tool picked in the connect panel", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue({ sendPlatform: null } as any);
    const { POST } = await importRoute();
    await POST(postBody({ ...baseInput, sendPlatform: "smartlead" }), params);
    expect(upsertColdOpenConfig).toHaveBeenCalledWith("e1", { sendPlatform: { platform: "smartlead" } });
  });

  it("POST ignores an unknown sending tool", async () => {
    vi.mocked(getColdOpenConfig).mockResolvedValue(null as any);
    const { POST } = await importRoute();
    await POST(postBody({ ...baseInput, sendPlatform: "gmail" }), params);
    expect(upsertColdOpenConfig).not.toHaveBeenCalled();
  });
});
