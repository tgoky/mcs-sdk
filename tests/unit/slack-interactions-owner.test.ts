import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const decide = vi.fn(async () => ({ ok: true, status: "approved", executed: true }));
const rows: Record<string, unknown[]> = {};
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (table: { __name: string }) => ({ where: () => ({ limit: async () => rows[table.__name] ?? [] }) }),
    }),
  },
}));
vi.mock("@/models/schema", () => ({ engagements: { __name: "engagements", stack: {}, engagementId: {} }, pendingActions: { __name: "pendingActions", engagementId: {}, id: {} } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@/lib/platforms/email", () => ({ OUTCOME_BUTTON_LABEL: {} }));
vi.mock("@/features/pre-call-read/server/outcome-resolution", () => ({ resolveCallOutcome: vi.fn() }));
vi.mock("@/lib/signing-secrets", () => ({ getSigningSecret: async (engagementId: string) => (engagementId === "eng_a" ? "secret-of-client-a" : null) }));
vi.mock("@/lib/approval-gate", () => ({ decidePendingAction: (...a: unknown[]) => decide(...(a as [])) }));

import { POST } from "@/app/api/slack/interactions/route";

const SECRET_A = "secret-of-client-a";
function signed(value: object) {
  const payload = { type: "block_actions", actions: [{ action_id: "pending_action_approve", value: JSON.stringify(value) }], user: { username: "a" } };
  const body = `payload=${encodeURIComponent(JSON.stringify(payload))}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v0=" + crypto.createHmac("sha256", SECRET_A).update(`v0:${ts}:${body}`).digest("hex");
  return new Request("https://app.example/api/slack/interactions", { method: "POST", body, headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig } });
}

describe("Slack approve and reject buttons", () => {
  beforeEach(() => {
    decide.mockClear();
    rows.engagements = [{ stack: { slack_signing_secret: SECRET_A } }];
  });

  it("won't decide another client's action with this client's Slack signature", async () => {
    rows.pendingActions = [{ engagementId: "eng_b" }];
    const res = await POST(signed({ engagementId: "eng_a", id: "action-of-b" }));
    expect(res.status).toBe(404);
    expect(decide).not.toHaveBeenCalled();
  });

  it("decides this client's own action", async () => {
    rows.pendingActions = [{ engagementId: "eng_a" }];
    const res = await POST(signed({ engagementId: "eng_a", id: "action-of-a" }));
    expect(res.status).toBe(200);
    expect(decide).toHaveBeenCalledWith("action-of-a", "approved", "a");
  });
});
