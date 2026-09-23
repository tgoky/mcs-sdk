import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/credentials", () => ({
  encryptSecret: vi.fn((v: string) => ({ encryptedValue: v, iv: "iv", keyVersion: 1 })),
  decryptSecret: vi.fn((v: string) => v),
}));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { db } from "@/lib/db";
import { safeFetch } from "@/lib/safe-fetch";
import { attemptBridgeDelivery, signBridgeBody } from "@/features/whop-agent/server/bridge-manager-service";
import { fakeDb } from "../helpers/fake-db";

describe("Whop bridge delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(db, fakeDb([{ stack: { whop_bridge_signing_secret: { encryptedValue: "topsecret", iv: "iv", keyVersion: 1 } } }]));
  });

  it("signs the exact body it sends, through the guarded fetch", async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(null, { status: 204 }));
    const result = await attemptBridgeDelivery("e1", { destinationUrl: "https://crm.example.com/hook", fieldMapping: {} }, { type: "membership.went_valid", data: { id: "m1" } }, false);
    expect(result.ok).toBe(true);

    const [url, init, opts] = vi.mocked(safeFetch).mock.calls[0];
    expect(url).toBe("https://crm.example.com/hook");
    expect(opts).toMatchObject({ httpsOnly: true });
    const headers = init!.headers as Record<string, string>;
    const expected = "v1=" + crypto.createHmac("sha256", "topsecret").update(`${headers["X-Whop-Agent-Timestamp"]}.${init!.body}`).digest("hex");
    expect(headers["X-Whop-Agent-Signature"]).toBe(expected);
    expect(signBridgeBody("topsecret", Number(headers["X-Whop-Agent-Timestamp"]), String(init!.body))).toBe(expected);
  });

  it("reports a refused or unreachable destination as a failed attempt", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("That address isn't reachable from here."));
    const result = await attemptBridgeDelivery("e1", { destinationUrl: "https://internal.example", fieldMapping: {} }, { type: "x" }, false);
    expect(result).toEqual({ ok: false, status: 0 });
  });
});
