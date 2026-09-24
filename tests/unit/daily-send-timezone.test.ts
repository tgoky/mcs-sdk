import { describe, it, expect, vi } from "vitest";

const saved: unknown[] = [];
vi.mock("@/features/cold-open/server/config", () => ({ upsertColdOpenConfig: async (_e: string, v: unknown) => void saved.push(v), setColdOpenPhaseState: async () => {}, getColdOpenConfig: async () => null }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { saveDailySendSettings } from "@/features/cold-open/server/daily-send";

describe("Daily Send's time zone", () => {
  it("refuses one that isn't a real time zone, instead of sending at the UTC hour", async () => {
    const r = await saveDailySendSettings("e1", { volume: 20, localHour: 9, timezone: "America/New York", copyMode: "generate", liveSendEnabled: false });
    expect(r).toEqual({ error: expect.stringContaining("isn't a time zone") });
    expect(saved).toEqual([]);
  });

  it("saves a real one, or none", async () => {
    expect(await saveDailySendSettings("e1", { volume: 20, localHour: 9, timezone: "America/New_York", copyMode: "generate", liveSendEnabled: false })).toEqual({ ok: true });
    expect(await saveDailySendSettings("e1", { volume: 20, localHour: 9, copyMode: "generate", liveSendEnabled: false })).toEqual({ ok: true });
  });
});
