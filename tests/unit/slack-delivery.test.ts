import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/credentials", () => ({ hasCredential: vi.fn(), resolveCredential: vi.fn() }));
vi.mock("@/lib/http", () => ({ fetchWithTimeout: vi.fn() }));

import { db } from "@/lib/db";
import { hasCredential, resolveCredential } from "@/lib/credentials";
import { fetchWithTimeout } from "@/lib/http";
import { hasSlackConnection, postToClientSlack } from "@/lib/slack-delivery";
import { fakeDb } from "../helpers/fake-db";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as any;
const message = {
  text: "Brief ready",
  blocks: [{ type: "section", text: { type: "mrkdwn", text: "Brief" } }, { type: "actions", elements: [] }],
};

describe("postToClientSlack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCredential).mockResolvedValue("xoxb-token");
  });

  it("posts through the Slack connection to the picked channel, without buttons", async () => {
    Object.assign(db, fakeDb([{ stack: { slack_channel_id: "C1" } }]));
    vi.mocked(hasCredential).mockResolvedValue(true);
    vi.mocked(fetchWithTimeout).mockResolvedValue(reply(200, { ok: true }));

    expect(await postToClientSlack("e1", "https://hooks.slack.com/x", message)).toBe("connection");
    const [url, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer xoxb-token" });
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.channel).toBe("C1");
    expect(body.blocks).toEqual([message.blocks[0]]);
  });

  it("throws Slack's own error instead of dropping the message", async () => {
    Object.assign(db, fakeDb([{ stack: { slack_channel_id: "C1" } }]));
    vi.mocked(hasCredential).mockResolvedValue(true);
    vi.mocked(fetchWithTimeout).mockResolvedValue(reply(200, { ok: false, error: "not_in_channel" }));
    await expect(postToClientSlack("e1", undefined, message)).rejects.toThrow("not_in_channel");
  });

  it("uses the webhook when there's no channel picked, keeping the buttons", async () => {
    Object.assign(db, fakeDb([{ stack: {} }]));
    vi.mocked(hasCredential).mockResolvedValue(true);
    vi.mocked(fetchWithTimeout).mockResolvedValue(reply(200, {}));

    expect(await postToClientSlack("e1", "https://hooks.slack.com/x", message)).toBe("webhook");
    const [url, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/x");
    expect(JSON.parse(String((init as RequestInit).body)).blocks).toHaveLength(2);
  });

  it("uses the webhook when a channel is saved but Slack was disconnected", async () => {
    Object.assign(db, fakeDb([{ stack: { slack_channel_id: "C1" } }]));
    vi.mocked(hasCredential).mockResolvedValue(false);
    vi.mocked(fetchWithTimeout).mockResolvedValue(reply(200, {}));
    expect(await postToClientSlack("e1", "https://hooks.slack.com/x", message)).toBe("webhook");
  });

  it("throws on a failed webhook post", async () => {
    Object.assign(db, fakeDb([{ stack: {} }]));
    vi.mocked(hasCredential).mockResolvedValue(false);
    vi.mocked(fetchWithTimeout).mockResolvedValue(reply(404, {}));
    await expect(postToClientSlack("e1", "https://hooks.slack.com/x", message)).rejects.toThrow("HTTP 404");
  });

  it("reports none when the client has neither setup", async () => {
    Object.assign(db, fakeDb([{ stack: {} }]));
    vi.mocked(hasCredential).mockResolvedValue(false);
    expect(await postToClientSlack("e1", undefined, message)).toBe("none");
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe("hasSlackConnection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs both a picked channel and the Slack credential", async () => {
    vi.mocked(hasCredential).mockResolvedValue(true);
    expect(await hasSlackConnection("e1", { slack_channel_id: "C1" })).toBe(true);
    expect(await hasSlackConnection("e1", {})).toBe(false);
    vi.mocked(hasCredential).mockResolvedValue(false);
    expect(await hasSlackConnection("e1", { slack_channel_id: "C1" })).toBe(false);
  });
});
