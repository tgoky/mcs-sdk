import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { insert: vi.fn(), delete: vi.fn() } }));
vi.mock("@/features/whop-agent/server/webhook-subscription-service", () => ({ getAgentWebhookSecrets: vi.fn() }));
vi.mock("@/lib/whop-agent/webhook-verify", () => ({ verifyWhopWebhookSignature: vi.fn() }));
vi.mock("@/lib/inngest", () => ({ inngest: { send: vi.fn() }, whopWebhookProcess: { create: vi.fn((d: unknown) => d) } }));

import { db } from "@/lib/db";
import { getAgentWebhookSecrets } from "@/features/whop-agent/server/webhook-subscription-service";
import { verifyWhopWebhookSignature } from "@/lib/whop-agent/webhook-verify";
import { inngest } from "@/lib/inngest";
import { fakeDb } from "../helpers/fake-db";
import { POST } from "@/app/api/webhooks/whop-agent/[engagementId]/route";

const params = { params: Promise.resolve({ engagementId: "e1" }) };
const request = () =>
  new Request("http://x", {
    method: "POST",
    headers: { "webhook-id": "msg_1", "webhook-timestamp": "1", "webhook-signature": "v1,x" },
    body: JSON.stringify({ type: "membership.went_valid", api_version: "v1", data: { id: "mem_1" } }),
  });

describe("Whop Agent webhook", () => {
  let fake: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    fake = fakeDb([{ id: "dedup-row-1" }]);
    Object.assign(db, fake);
    vi.mocked(getAgentWebhookSecrets).mockResolvedValue([{ whopWebhookId: "wh_1", secret: "s" }] as any);
    vi.mocked(verifyWhopWebhookSignature).mockReturnValue({ ok: true } as any);
  });

  it("queues the event and keeps the dedup row", async () => {
    vi.mocked(inngest.send).mockResolvedValue(undefined as any);
    const res = await POST(request(), params);
    expect(res.status).toBe(200);
    expect(fake.delete).not.toHaveBeenCalled();
  });

  it("when queuing fails, releases the dedup row and answers 500 so Whop's retry is processed", async () => {
    vi.mocked(inngest.send).mockRejectedValue(new Error("inngest down"));
    const res = await POST(request(), params);
    expect(res.status).toBe(500);
    expect(fake.delete).toHaveBeenCalledTimes(1);
  });
});
