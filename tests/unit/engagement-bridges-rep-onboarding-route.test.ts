import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/workspace", () => ({
  getActiveWorkspace: vi.fn(),
  isPackageInstalledInWorkspace: vi.fn(),
}));
vi.mock("@/lib/engagement-skills", () => ({
  isSkillEnabledForEngagement: vi.fn(),
  setSkillEnabledForEngagement: vi.fn(),
}));
vi.mock("@/lib/skill-dispatch", () => ({ dispatchSkillRun: vi.fn() }));
vi.mock("@/lib/client-profile", () => ({
  getPrimaryDomainForEngagement: vi.fn(),
  seedPrimaryDomainFromUrl: vi.fn(),
}));
vi.mock("@/lib/client-facts", () => ({ getClientFact: vi.fn(), getClientFacts: vi.fn().mockResolvedValue({}), recordDossierDecisions: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/field-writeback", () => ({ applyResolvableFacts: vi.fn() }));
vi.mock("@/features/reputation-manager/server/onboarding-service", () => ({
  saveRepIdentityGraphIntake: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getActiveWorkspace, isPackageInstalledInWorkspace } from "@/lib/workspace";
import { setSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { seedPrimaryDomainFromUrl } from "@/lib/client-profile";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { saveRepIdentityGraphIntake } from "@/features/reputation-manager/server/onboarding-service";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/bridges/rep-onboarding/route");
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postBody(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// One row serves both the ownership lookup and the saved-graph lookup —
// fakeDb returns the same rows for every query in the chain.
const savedRow = {
  engagementId: "e1",
  buyer: "Acme",
  operatorName: "Acme",
  operatorAliases: ["Acme Inc"],
  operatorHandles: { twitter: "@acme" },
  operatorDomains: ["acme.com", "acme.io"],
  operatorEmailContacts: ["founder@acme.com"],
  entities: [],
  offerings: [],
  competitors: [{ name: "Globex", monitorFor: ["pricing"], highPriority: true }],
  collisions: [
    { name: "Acme Anvils", whoTheyAre: "Unrelated", disambiguationNote: "Different industry", source: "buyer" },
    { name: "Acme .co", whoTheyAre: "Web host", disambiguationNote: "Check", source: "collision_check" },
  ],
  trustedSources: ["trustpilot.com"],
  seedPanelPrompts: [],
  soleAuthorityName: "Jane",
  crisisThresholdOverride: 3,
  activeEngines: null,
  operatorPagePhone: "+15550000000",
};

describe("POST /api/engagements/[id]/bridges/rep-onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
    vi.mocked(isPackageInstalledInWorkspace).mockResolvedValue(true);
    vi.mocked(applyResolvableFacts).mockResolvedValue([]);
    vi.mocked(saveRepIdentityGraphIntake).mockResolvedValue({ id: "g1" } as any);
    vi.mocked(setSkillEnabledForEngagement).mockResolvedValue(undefined);
    vi.mocked(seedPrimaryDomainFromUrl).mockResolvedValue(undefined);
    vi.mocked(dispatchSkillRun).mockResolvedValue("run-1");
    Object.assign(db, fakeDb([savedRow]));
  });

  it("keeps saved values for every field the request doesn't send", async () => {
    const { POST } = await importRoute();
    // The dossier's subset of fields.
    const res = await POST(
      postBody({
        operatorName: "Acme",
        soleAuthorityName: "Jane",
        operatorDomains: ["acme.com", "acme.io"],
        competitors: [{ name: "Globex", monitorFor: ["pricing"], highPriority: true }],
        entities: [],
        seedPanelPrompts: [],
        activeEngines: null,
        crisisThresholdOverride: 3,
        operatorHandles: { twitter: "@acme" },
      }),
      makeParams("e1")
    );

    expect(res.status).toBe(200);
    const input = vi.mocked(saveRepIdentityGraphIntake).mock.calls[0][1];
    expect(input.operatorAliases).toEqual(["Acme Inc"]);
    expect(input.operatorEmailContacts).toEqual(["founder@acme.com"]);
    expect(input.trustedSources).toEqual(["trustpilot.com"]);
    expect(input.operatorPagePhone).toBe("+15550000000");
    // Only buyer-entered collisions are resubmitted; collision_check entries
    // are merged separately by the service and must not be re-tagged as buyer.
    expect(input.collisions).toEqual([{ name: "Acme Anvils", whoTheyAre: "Unrelated", disambiguationNote: "Different industry" }]);
  });

  it("still lets a caller clear a field by sending it empty", async () => {
    const { POST } = await importRoute();
    await POST(
      postBody({ operatorName: "Acme", soleAuthorityName: "Jane", trustedSources: [], operatorAliases: [] }),
      makeParams("e1")
    );

    const input = vi.mocked(saveRepIdentityGraphIntake).mock.calls[0][1];
    expect(input.trustedSources).toEqual([]);
    expect(input.operatorAliases).toEqual([]);
  });

  it("returns 404 for an engagement this tenant doesn't own", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(postBody({ operatorName: "Acme" }), makeParams("e1"));
    expect(res.status).toBe(404);
    expect(saveRepIdentityGraphIntake).not.toHaveBeenCalled();
  });
});
