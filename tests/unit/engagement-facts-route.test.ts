import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/client-facts", () => ({
  confirmClientFact: vi.fn(),
  editClientFact: vi.fn(),
  rejectClientFact: vi.fn(),
  getClientFact: vi.fn(),
}));
vi.mock("@/lib/field-writeback", () => ({ applyResolvableFacts: vi.fn() }));

import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { confirmClientFact, editClientFact, rejectClientFact, getClientFact } from "@/lib/client-facts";
import { applyResolvableFacts } from "@/lib/field-writeback";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/facts/[key]/route");
}
const params = (key: string) => ({ params: Promise.resolve({ id: "e1", key }) });
const post = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/engagements/[id]/facts/[key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
    vi.mocked(getClientFact).mockResolvedValue({ key: "offerName" } as any);
    vi.mocked(applyResolvableFacts).mockResolvedValue([]);
    Object.assign(db, fakeDb([{ id: 1 }]));
  });

  it("rejects a suggestion without re-applying anything", async () => {
    const { POST } = await importRoute();
    const res = await POST(post({ action: "reject" }), params("offerName"));
    expect(res.status).toBe(200);
    expect(rejectClientFact).toHaveBeenCalledWith("e1", "offerName");
    expect(applyResolvableFacts).not.toHaveBeenCalled();
  });

  it("confirms a suggestion and runs the writeback", async () => {
    const { POST } = await importRoute();
    await POST(post({ action: "confirm" }), params("offerName"));
    expect(confirmClientFact).toHaveBeenCalledWith("e1", "offerName");
    expect(applyResolvableFacts).toHaveBeenCalledWith("e1");
  });

  it("stores a human edit", async () => {
    const { POST } = await importRoute();
    await POST(post({ action: "edit", value: "Growth Program" }), params("offerName"));
    expect(editClientFact).toHaveBeenCalledWith("e1", "offerName", "Growth Program");
  });

  it("404s for a client in another workspace", async () => {
    Object.assign(db, fakeDb([]));
    const { POST } = await importRoute();
    const res = await POST(post({ action: "reject" }), params("offerName"));
    expect(res.status).toBe(404);
    expect(rejectClientFact).not.toHaveBeenCalled();
  });

  it("404s when there's no stored suggestion to act on", async () => {
    vi.mocked(getClientFact).mockResolvedValue(null);
    const { POST } = await importRoute();
    const res = await POST(post({ action: "confirm" }), params("smsPlatform"));
    expect(res.status).toBe(404);
  });

  it("400s on an unknown action or an edit without a value", async () => {
    const { POST } = await importRoute();
    expect((await POST(post({ action: "delete" }), params("offerName"))).status).toBe(400);
    expect((await POST(post({ action: "edit" }), params("offerName"))).status).toBe(400);
  });
});
