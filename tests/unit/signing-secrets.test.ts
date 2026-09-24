import { describe, it, expect, vi, beforeEach } from "vitest";

const vault = new Map<string, string>();
const patches: Record<string, unknown>[] = [];
let stack: Record<string, unknown> = {};
let removedNested = 0;
vi.mock("@/lib/credentials", () => ({
  hasCredential: async (e: string, p: string) => vault.has(`${e}/${p}`),
  resolveCredential: async (e: string, p: string) => vault.get(`${e}/${p}`)!,
  storeCredential: async (e: string, p: string, _ref: string, v: string) => void vault.set(`${e}/${p}`, v),
}));
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: async (_e: string, p: Record<string, unknown>) => void patches.push(p) }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ stack }] }) }) }),
    update: () => ({ set: () => ({ where: async () => void removedNested++ }) }),
  },
}));

import { getSigningSecret, setSigningSecret, hasSigningSecret } from "@/lib/signing-secrets";

describe("webhook signing secrets", () => {
  beforeEach(() => {
    vault.clear();
    patches.length = 0;
    removedNested = 0;
    stack = {};
  });

  it("moves a secret still sitting in the stack into the vault on first read, and clears it there", async () => {
    stack = { webhook_signing_secret: "old-plaintext" };
    expect(await getSigningSecret("e1", "booking_webhook")).toBe("old-plaintext");
    expect(vault.get("e1/webhook_signing_secret")).toBe("old-plaintext");
    expect(patches).toContainEqual({ webhook_signing_secret: undefined });
    // Later reads come from the vault.
    stack = {};
    expect(await getSigningSecret("e1", "booking_webhook")).toBe("old-plaintext");
  });

  it("moves Recall's nested secret by removing just that key", async () => {
    stack = { conversation_intelligence_meta: { recall_region: "us", recall_webhook_signing_secret: "whsec_x" } };
    expect(await getSigningSecret("e1", "recall")).toBe("whsec_x");
    expect(vault.get("e1/recall_webhook_signing_secret")).toBe("whsec_x");
    expect(removedNested).toBe(1);
  });

  it("stores a new secret in the vault and marks the stack so the UI knows one is set", async () => {
    await setSigningSecret("e1", "slack", "s3cret");
    expect(vault.get("e1/slack_signing_secret")).toBe("s3cret");
    expect(patches).toContainEqual({ slack_signing_secret_set: true });
    expect(await hasSigningSecret("e1", "slack", { slack_signing_secret_set: true } as never)).toBe(true);
  });

  it("has nothing when none was ever set", async () => {
    expect(await getSigningSecret("e1", "slack")).toBeNull();
  });
});
