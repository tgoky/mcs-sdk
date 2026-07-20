import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

/**
 * credentials.ts reads its encryption keys from process.env at MODULE LOAD
 * time (ENCRYPTION_KEYS is computed once, outside any function). That means
 * every test in this file needs the relevant env vars set *before* the
 * module is imported, and vi.resetModules() + a fresh dynamic import
 * whenever a test needs a different key configuration (e.g. simulating key
 * rotation, where a second version's key must exist alongside the first).
 */

const CURRENT_KEY = "a".repeat(64); // 32 bytes hex
const ROTATED_OUT_KEY = "b".repeat(64);

/** A minimal in-memory stand-in for the credentials_refs table — real
 * mutable state, not just a canned response, since storeCredential's
 * select-then-insert-or-update logic depends on what's already there. */
function makeFakeCredentialsDb() {
  type Row = {
    id: string;
    engagementId: string;
    provider: string;
    refKey: string;
    encryptedValue: string;
    iv: string;
    keyVersion: number;
    createdAt: Date;
    updatedAt: Date;
  };
  const rows: Row[] = [];

  function matchesWhere(row: Row, engagementId: string, provider: string) {
    return row.engagementId === engagementId && row.provider === provider;
  }

  // We don't parse drizzle's `and(eq(...), eq(...))` condition objects —
  // instead we capture the (engagementId, provider) pair actually passed to
  // storeCredential/resolveCredential/hasCredential via closures set by the
  // test, since the fake only needs to be correct for the call shapes this
  // file actually exercises below.
  let lastLookup: { engagementId: string; provider: string } | null = null;

  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (!lastLookup) return [];
            return rows.filter((r) => matchesWhere(r, lastLookup!.engagementId, lastLookup!.provider));
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (patch: Partial<Row>) => ({
        where: async () => {
          if (!lastLookup) return;
          const target = rows.find((r) => matchesWhere(r, lastLookup!.engagementId, lastLookup!.provider));
          if (target) Object.assign(target, patch);
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: async (row: Row) => {
        rows.push(row);
      },
    })),
    __setLookup(engagementId: string, provider: string) {
      lastLookup = { engagementId, provider };
    },
    __rows: rows,
  };

  return db;
}

describe("credentials — encrypt/decrypt round trip", () => {
  let storeCredential: typeof import("@/lib/credentials").storeCredential;
  let resolveCredential: typeof import("@/lib/credentials").resolveCredential;
  let hasCredential: typeof import("@/lib/credentials").hasCredential;
  let fakeDb: ReturnType<typeof makeFakeCredentialsDb>;

  beforeAll(async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = CURRENT_KEY;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION;
    vi.resetModules();

    fakeDb = makeFakeCredentialsDb();
    vi.doMock("@/lib/db", () => ({ db: fakeDb }));

    const mod = await import("@/lib/credentials");
    storeCredential = mod.storeCredential;
    resolveCredential = mod.resolveCredential;
    hasCredential = mod.hasCredential;
  });

  afterAll(() => {
    vi.doUnmock("@/lib/db");
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  });

  it("hasCredential is false before anything is stored", async () => {
    fakeDb.__setLookup("eng-1", "calendly");
    expect(await hasCredential("eng-1", "calendly")).toBe(false);
  });

  it("round-trips a stored value back to the original plaintext", async () => {
    fakeDb.__setLookup("eng-1", "calendly");
    await storeCredential("eng-1", "calendly", "api_key", "sk-live-super-secret-123", fakeDb as any);

    fakeDb.__setLookup("eng-1", "calendly");
    const value = await resolveCredential("eng-1", "calendly");
    expect(value).toBe("sk-live-super-secret-123");
  });

  it("hasCredential is true after storing", async () => {
    fakeDb.__setLookup("eng-1", "calendly");
    expect(await hasCredential("eng-1", "calendly")).toBe(true);
  });

  it("never stores the plaintext value anywhere in the row", async () => {
    const row = fakeDb.__rows[0];
    expect(JSON.stringify(row)).not.toContain("sk-live-super-secret-123");
  });

  it("produces a different ciphertext and IV each time the same plaintext is stored (random IV)", async () => {
    fakeDb.__setLookup("eng-2a", "calendly");
    await storeCredential("eng-2a", "calendly", "api_key", "same-secret");
    const first = { ...fakeDb.__rows.find((r) => r.engagementId === "eng-2a")! };

    fakeDb.__setLookup("eng-2b", "calendly");
    await storeCredential("eng-2b", "calendly", "api_key", "same-secret");
    const second = { ...fakeDb.__rows.find((r) => r.engagementId === "eng-2b")! };

    expect(first.encryptedValue).not.toBe(second.encryptedValue);
    expect(first.iv).not.toBe(second.iv);
  });

  it("rejects a tampered ciphertext instead of silently returning garbage", async () => {
    fakeDb.__setLookup("eng-3", "calendly");
    await storeCredential("eng-3", "calendly", "api_key", "tamper-test-secret");

    // Flip a character in the stored ciphertext — AES-GCM's auth tag must
    // catch this rather than decrypt() returning corrupted plaintext.
    const row = fakeDb.__rows.find((r) => r.engagementId === "eng-3")!;
    row.encryptedValue = row.encryptedValue.slice(0, -4) + (row.encryptedValue.endsWith("A") ? "B" : "A") + row.encryptedValue.slice(-3);

    fakeDb.__setLookup("eng-3", "calendly");
    await expect(resolveCredential("eng-3", "calendly")).rejects.toThrow();
  });

  it("throws a clear, actionable error when no credential exists", async () => {
    fakeDb.__setLookup("eng-nope", "calendly");
    await expect(resolveCredential("eng-nope", "calendly")).rejects.toThrow(/No credential found/);
  });

  it("re-saving an existing credential updates the row rather than duplicating it", async () => {
    fakeDb.__setLookup("eng-4", "calendly");
    await storeCredential("eng-4", "calendly", "api_key", "first-value");
    const countAfterFirst = fakeDb.__rows.filter((r) => r.engagementId === "eng-4").length;
    expect(countAfterFirst).toBe(1);

    fakeDb.__setLookup("eng-4", "calendly");
    await storeCredential("eng-4", "calendly", "api_key", "second-value");
    const countAfterSecond = fakeDb.__rows.filter((r) => r.engagementId === "eng-4").length;
    expect(countAfterSecond).toBe(1); // still one row, not two

    fakeDb.__setLookup("eng-4", "calendly");
    expect(await resolveCredential("eng-4", "calendly")).toBe("second-value");
  });
});

describe("credentials — key rotation", () => {
  afterAll(() => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_V1;
    vi.doUnmock("@/lib/db");
    vi.resetModules();
  });

  it("decrypts a row written under a retired key version once the current key has rotated forward", async () => {
    // Phase 1: only the "old" key exists, as version 1 (the default).
    process.env.CREDENTIAL_ENCRYPTION_KEY = ROTATED_OUT_KEY;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION;
    vi.resetModules();

    const db = makeFakeCredentialsDb();
    vi.doMock("@/lib/db", () => ({ db }));

    const phase1 = await import("@/lib/credentials");
    db.__setLookup("eng-rot", "calendly");
    await phase1.storeCredential("eng-rot", "calendly", "api_key", "pre-rotation-secret", db as any);
    expect(db.__rows[0].keyVersion).toBe(1);

    // Phase 2: rotate — CREDENTIAL_ENCRYPTION_KEY becomes the new key at
    // version 2, and the old key is preserved as CREDENTIAL_ENCRYPTION_KEY_V1
    // so existing rows keep decrypting.
    process.env.CREDENTIAL_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION = "2";
    process.env.CREDENTIAL_ENCRYPTION_KEY_V1 = ROTATED_OUT_KEY;
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db }));

    const phase2 = await import("@/lib/credentials");
    db.__setLookup("eng-rot", "calendly");
    // The old row (keyVersion 1) must still decrypt correctly post-rotation.
    expect(await phase2.resolveCredential("eng-rot", "calendly")).toBe("pre-rotation-secret");

    // A fresh write after rotation uses the new key version...
    db.__setLookup("eng-rot-2", "calendly");
    await phase2.storeCredential("eng-rot-2", "calendly", "api_key", "post-rotation-secret", db as any);
    const newRow = db.__rows.find((r) => r.engagementId === "eng-rot-2")!;
    expect(newRow.keyVersion).toBe(2);

    // ...and re-saving the OLD row migrates it onto the new key version.
    db.__setLookup("eng-rot", "calendly");
    await phase2.storeCredential("eng-rot", "calendly", "api_key", "migrated-secret", db as any);
    expect(db.__rows[0].keyVersion).toBe(2);
    db.__setLookup("eng-rot", "calendly");
    expect(await phase2.resolveCredential("eng-rot", "calendly")).toBe("migrated-secret");
  });

  it("throws a specific, actionable error if a retired key's env var is missing", async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = CURRENT_KEY;
    process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION = "2";
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_V1; // deliberately not set
    vi.resetModules();

    const db = makeFakeCredentialsDb();
    vi.doMock("@/lib/db", () => ({ db }));
    // Manually seed a row claiming to be encrypted at version 1, without
    // ever having had a working v1 key in this phase — simulates a
    // deployment that lost its retired key.
    db.__rows.push({
      id: "orphan-row",
      engagementId: "eng-orphan",
      provider: "calendly",
      refKey: "api_key",
      encryptedValue: "irrelevant==",
      iv: "00".repeat(16),
      keyVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mod = await import("@/lib/credentials");
    db.__setLookup("eng-orphan", "calendly");
    await expect(mod.resolveCredential("eng-orphan", "calendly")).rejects.toThrow(
      /No usable key configured.*version 1/
    );
  });
});
