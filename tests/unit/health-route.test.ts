import { describe, it, expect, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));

import { GET } from "@/app/api/health/route";

describe("/api/health", () => {

  it("is 200 when the database answers", async () => {
    execute.mockImplementation(() => Promise.resolve([{ "?column?": 1 }]));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("is 503, with no details, when the database doesn't", async () => {
    execute.mockImplementation(() => Promise.reject(new Error("connection refused")));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
