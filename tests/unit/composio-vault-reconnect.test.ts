import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * Real, automated coverage for rotateComposioVaultCredential (the
 * Reconnect fix shipped this phase) — not just "read the code and it
 * looks right." Follows the exact same fake-db pattern credentials.test.ts
 * already established for this file: real mutable in-memory state, not a
 * canned single response, since the function's own logic (fetch current
 * refKey, conditionally revoke, then update) depends on what's already
 * there.
 *
 * deleteComposioConnection is mocked (it calls the real Composio SDK,
 * which throws without a real COMPOSIO_API_KEY this sandbox doesn't have
 * — see this phase's own commits for why the live OAuth round trip itself
 * can't be exercised here). connectedAccountIdFromRefKey and
 * composioVaultRefKey are left real: both are pure string functions with
 * no network dependency, so using the actual implementation here is
 * strictly more honest than re-mocking logic this test should be
 * verifying against.
 */

const OLD_ACCOUNT_ID = "ca_old_12345";
const NEW_ACCOUNT_ID = "ca_new_67890";

function makeFakeVaultDb(initialRow: {
  id: string;
  refKey: string;
  healthStatus: string;
  lastCheckedAt: Date | null;
  lastCheckError: string | null;
}) {
  const row = { ...initialRow };
  const setCalls: Array<Record<string, unknown>> = [];

  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ refKey: row.refKey }],
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (patch: Record<string, unknown>) => {
        setCalls.push(patch);
        return {
          where: async () => {
            Object.assign(row, patch);
          },
        };
      },
    })),
    __row: row,
    __setCalls: setCalls,
  };
  return db;
}

describe("rotateComposioVaultCredential", () => {
  let rotateComposioVaultCredential: typeof import("@/lib/credentials").rotateComposioVaultCredential;
  let deleteComposioConnection: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    deleteComposioConnection = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/composio", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/lib/composio")>();
      return { ...actual, deleteComposioConnection };
    });
  });

  afterAll(() => {
    vi.doUnmock("@/lib/composio");
    vi.resetModules();
  });

  it("revokes the OLD Composio connection before overwriting refKey to the new one", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${OLD_ACCOUNT_ID}`,
      healthStatus: "invalid",
      lastCheckedAt: new Date("2026-01-01"),
      lastCheckError: "token expired",
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    expect(deleteComposioConnection).toHaveBeenCalledExactlyOnceWith(OLD_ACCOUNT_ID);
    expect(deleteComposioConnection).not.toHaveBeenCalledWith(NEW_ACCOUNT_ID);
  });

  it("updates refKey to point at the new connected account", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${OLD_ACCOUNT_ID}`,
      healthStatus: "invalid",
      lastCheckedAt: new Date(),
      lastCheckError: "token expired",
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    expect(db.__row.refKey).toBe(`composio:${NEW_ACCOUNT_ID}`);
  });

  it("resets healthStatus to unknown and clears the stale invalid verdict", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${OLD_ACCOUNT_ID}`,
      healthStatus: "invalid",
      lastCheckedAt: new Date("2026-01-01"),
      lastCheckError: "token expired",
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    expect(db.__row.healthStatus).toBe("unknown");
    expect(db.__row.lastCheckedAt).toBeNull();
    expect(db.__row.lastCheckError).toBeNull();
  });

  it("never touches encryptedValue/iv/keyVersion — the Composio placeholder those hold is never read back", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${OLD_ACCOUNT_ID}`,
      healthStatus: "invalid",
      lastCheckedAt: null,
      lastCheckError: null,
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    const patch = db.__setCalls[0];
    expect(patch).not.toHaveProperty("encryptedValue");
    expect(patch).not.toHaveProperty("iv");
    expect(patch).not.toHaveProperty("keyVersion");
  });

  it("does not call deleteComposioConnection when reconnecting to the SAME account (no-op revoke)", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${NEW_ACCOUNT_ID}`, // already pointing at what we're "reconnecting" to
      healthStatus: "ok",
      lastCheckedAt: new Date(),
      lastCheckError: null,
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    expect(deleteComposioConnection).not.toHaveBeenCalled();
    // Still resets health status even though the account didn't change —
    // the person explicitly asked to reconnect, so still re-verify it.
    expect(db.__row.healthStatus).toBe("unknown");
  });

  it("still updates the row even when revoking the old connection fails — Composio being briefly unavailable never blocks the reconnect the person is actively doing", async () => {
    deleteComposioConnection.mockRejectedValueOnce(new Error("Composio API timeout"));
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: `composio:${OLD_ACCOUNT_ID}`,
      healthStatus: "invalid",
      lastCheckedAt: new Date(),
      lastCheckError: "token expired",
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await expect(rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID)).resolves.toBeUndefined();

    expect(db.__row.refKey).toBe(`composio:${NEW_ACCOUNT_ID}`);
    expect(db.__row.healthStatus).toBe("unknown");
  });

  it("is a no-op revoke (not a crash) when the row's current refKey isn't Composio-managed at all", async () => {
    const db = makeFakeVaultDb({
      id: "vault-1",
      refKey: "secrets://vault/ws-1/hubspot/12345", // a plain pasted-key row, not composio:-prefixed
      healthStatus: "ok",
      lastCheckedAt: new Date(),
      lastCheckError: null,
    });
    vi.doMock("@/lib/db", () => ({ db }));

    ({ rotateComposioVaultCredential } = await import("@/lib/credentials"));
    await rotateComposioVaultCredential("vault-1", NEW_ACCOUNT_ID);

    expect(deleteComposioConnection).not.toHaveBeenCalled();
    expect(db.__row.refKey).toBe(`composio:${NEW_ACCOUNT_ID}`);
  });
});
