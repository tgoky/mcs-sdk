import { describe, it, expect, vi, beforeEach } from "vitest";

// The connected account id comes back in the callback's query string, so
// it's only trusted once Composio lists it under this workspace.

vi.mock("@/lib/db", () => ({ db: {} }));
const get = vi.fn();
const list = vi.fn();
vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = { get, list };
  },
}));

import { finalizeComposioConnection } from "@/lib/composio";

describe("finalizeComposioConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("COMPOSIO_API_KEY", "test-key");
    get.mockResolvedValue({ id: "ca_1", status: "ACTIVE", toolkit: { slug: "hubspot" } });
  });

  it("accepts a connection listed under this workspace", async () => {
    list.mockResolvedValue({ items: [{ id: "ca_0" }, { id: "ca_1" }], nextCursor: null });
    const r = await finalizeComposioConnection("ca_1", "ws-1");
    expect(r).toEqual({ toolkitSlug: "hubspot", status: "ACTIVE", ownedByWorkspace: true });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ userIds: ["ws-1"], toolkitSlugs: ["hubspot"] }));
  });

  it("refuses an id that belongs to another workspace", async () => {
    list.mockResolvedValue({ items: [{ id: "ca_other" }], nextCursor: null });
    const r = await finalizeComposioConnection("ca_1", "ws-1");
    expect(r.ownedByWorkspace).toBe(false);
  });

  it("follows the cursor to later pages", async () => {
    list.mockResolvedValueOnce({ items: [{ id: "ca_a" }], nextCursor: "p2" }).mockResolvedValueOnce({ items: [{ id: "ca_1" }], nextCursor: null });
    const r = await finalizeComposioConnection("ca_1", "ws-1");
    expect(r.ownedByWorkspace).toBe(true);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "p2" }));
  });
});
