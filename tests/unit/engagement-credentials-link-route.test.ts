import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/workspace", () => ({ getActiveWorkspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/credentials", () => ({
  linkEngagementToVault: vi.fn(),
  unlinkEngagementFromVault: vi.fn(),
  vaultCredentialBelongsToTenant: vi.fn(),
  syncStackCredentialMarkers: vi.fn(),
  resolveVaultCredentialValue: vi.fn(),
}));
vi.mock("@/lib/account-harvest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account-harvest")>("@/lib/account-harvest");
  return { isHarvestableProvider: actual.isHarvestableProvider, harvestAccountMetadata: vi.fn() };
});
vi.mock("@/lib/paste-key-harvest", () => ({ harvestPasteKeyMetadata: vi.fn() }));

import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db";
import { linkEngagementToVault, vaultCredentialBelongsToTenant, resolveVaultCredentialValue } from "@/lib/credentials";
import { harvestAccountMetadata } from "@/lib/account-harvest";
import { harvestPasteKeyMetadata } from "@/lib/paste-key-harvest";
import { fakeDb } from "../helpers/fake-db";

async function importRoute() {
  return import("@/app/api/engagements/[id]/credentials/link/route");
}

function postBody(body: unknown) {
  return new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const params = { params: Promise.resolve({ id: "e1" }) };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("POST /api/engagements/[id]/credentials/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ whopUserId: "user-1" } as any);
    vi.mocked(getActiveWorkspace).mockResolvedValue({ workspaceId: "ws-1" } as any);
    vi.mocked(vaultCredentialBelongsToTenant).mockResolvedValue(true);
    vi.mocked(resolveVaultCredentialValue).mockResolvedValue("secret-value");
    Object.assign(db, fakeDb([{ id: 1 }]));
  });

  it("harvests an OAuth account for this client when a saved connection is reused", async () => {
    const { POST } = await importRoute();
    const res = await POST(postBody({ provider: "hubspot", vaultId: "v1" }), params);
    await flush();

    expect(res.status).toBe(200);
    expect(linkEngagementToVault).toHaveBeenCalledWith("e1", "hubspot", "v1");
    expect(harvestAccountMetadata).toHaveBeenCalledWith("e1", "hubspot", "secret-value");
    expect(harvestPasteKeyMetadata).not.toHaveBeenCalled();
  });

  it("uses the paste-a-key harvester for pasted keys", async () => {
    const { POST } = await importRoute();
    await POST(postBody({ provider: "cal_com", vaultId: "v2" }), params);
    await flush();

    expect(harvestPasteKeyMetadata).toHaveBeenCalledWith("e1", "cal_com", "secret-value");
    expect(harvestAccountMetadata).not.toHaveBeenCalled();
  });

  it("still links when reading the saved value fails", async () => {
    vi.mocked(resolveVaultCredentialValue).mockRejectedValue(new Error("vault read failed"));
    const { POST } = await importRoute();
    const res = await POST(postBody({ provider: "hubspot", vaultId: "v1" }), params);
    await flush();

    expect(res.status).toBe(200);
    expect(harvestAccountMetadata).not.toHaveBeenCalled();
  });

  it("doesn't harvest a credential from another workspace", async () => {
    vi.mocked(vaultCredentialBelongsToTenant).mockResolvedValue(false);
    const { POST } = await importRoute();
    const res = await POST(postBody({ provider: "hubspot", vaultId: "v9" }), params);
    await flush();

    expect(res.status).toBe(404);
    expect(resolveVaultCredentialValue).not.toHaveBeenCalled();
  });
});
