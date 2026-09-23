import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn() }));
vi.mock("@/lib/whop-access", () => ({ isAdminEmail: vi.fn(), isAuthorizedForEngagement: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/features/reputation-manager/server/response-routing", () => ({ draftForChosenPosture: vi.fn() }));

import { getSession } from "@/lib/session";
import { isAdminEmail, isAuthorizedForEngagement } from "@/lib/whop-access";
import { db } from "@/lib/db";
import { draftForChosenPosture } from "@/features/reputation-manager/server/response-routing";
import { RESPONSE_POSTURES } from "@/features/reputation-manager/rep-thresholds";
import { fakeDb, fakeDbSequence } from "../helpers/fake-db";
import { POST } from "@/app/api/engagements/[id]/incidents/[incidentId]/posture/route";

const posture = RESPONSE_POSTURES.find((p) => p.id !== "escalate_externally")!.id;
const params = { params: Promise.resolve({ id: "e1", incidentId: "inc-1" }) };
const body = () => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posture }) });

describe("incident posture route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "u1", email: "admin@x.com" } as any);
    vi.mocked(isAdminEmail).mockReturnValue(true);
    vi.mocked(isAuthorizedForEngagement).mockResolvedValue(true);
  });

  it("checks access before looking up the incident, so ids can't be probed", async () => {
    vi.mocked(isAuthorizedForEngagement).mockResolvedValue(false);
    const selects = fakeDb([]);
    Object.assign(db, selects);
    const res = await POST(body(), params);
    expect(res.status).toBe(403);
    expect(selects.select).not.toHaveBeenCalled();
  });

  it("releases the chosen posture when drafting fails, so it can be retried", async () => {
    const fake = fakeDb([{ id: "inc-1", selectedPosture: posture }]);
    Object.assign(db, fake);
    vi.mocked(draftForChosenPosture).mockRejectedValue(new Error("model timeout"));
    const res = await POST(body(), params);
    expect(res.status).toBe(500);
    // claim, then release
    expect(fake.set).toHaveBeenLastCalledWith({ selectedPosture: null });
  });

  it("lets a retry of the same posture draft again when no draft was queued", async () => {
    // incident lookup, current posture, existing-draft check (none)
    Object.assign(db, { ...fakeDbSequence([[{ id: "inc-1", selectedPosture: posture }], [{ selectedPosture: posture }], []]), update: fakeDb([]).update });
    vi.mocked(draftForChosenPosture).mockResolvedValue(undefined);
    const res = await POST(body(), params);
    expect(res.status).toBe(200);
    expect(draftForChosenPosture).toHaveBeenCalledTimes(1);
  });

  it("still refuses a second draft once one is queued", async () => {
    Object.assign(db, { ...fakeDbSequence([[{ id: "inc-1", selectedPosture: posture }], [{ selectedPosture: posture }], [{ id: "pa-1" }]]), update: fakeDb([]).update });
    const res = await POST(body(), params);
    expect(res.status).toBe(409);
    expect(draftForChosenPosture).not.toHaveBeenCalled();
  });
});
