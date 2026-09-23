import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/features/cold-open/server/config", () => ({
  getColdOpenConfig: vi.fn(),
  upsertColdOpenConfig: vi.fn(),
  preconditionCheck: vi.fn().mockResolvedValue([]),
  setColdOpenPhaseState: vi.fn(),
}));
vi.mock("@/features/cold-open/server/fetchers/csv", () => ({ CsvFetcher: vi.fn() }));
vi.mock("@/features/cold-open/server/business-status", () => ({ verifyDomains: vi.fn() }));
vi.mock("@/features/cold-open/server/copy-engine", () => ({ assembleCopyForLead: vi.fn() }));
vi.mock("@/features/cold-open/server/esp/factory", () => ({ createEspAdapter: vi.fn() }));
vi.mock("@/lib/run-log", () => ({
  logStep: vi.fn(),
  finishRun: vi.fn(),
  failRun: vi.fn(),
  emptySummary: () => ({ whatWasAttempted: [], whatWorked: [], whatFailed: [], openItems: [], decisionsMade: [] }),
}));

import { db } from "@/lib/db";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { CsvFetcher } from "@/features/cold-open/server/fetchers/csv";
import { verifyDomains } from "@/features/cold-open/server/business-status";
import { assembleCopyForLead } from "@/features/cold-open/server/copy-engine";
import { createEspAdapter } from "@/features/cold-open/server/esp/factory";
import { runDailySend } from "@/features/cold-open/server/daily-send";
import { fakeDb } from "../helpers/fake-db";

const lead = (i: number, domain = `co${i}.com`) => ({
  domain, companyName: `Co ${i}`, firstName: "A", lastName: "B", email: `p${i}@${domain}`, title: "", city: "", state: "",
  country: "", linkedinUrl: "", phone: "", icp: "smb", source: "csv", extra: {},
});

function setup(rows: ReturnType<typeof lead>[], dead: string[], opts: { volume?: number; live?: boolean } = {}) {
  vi.mocked(getColdOpenConfig).mockResolvedValue({
    dailySendSettings: { volume: opts.volume ?? 2, localHour: 9, copyMode: "upload", liveSendEnabled: opts.live ?? true },
    sendPlatform: { platform: "instantly" },
    leadSources: [{ icp: "smb", fetcherType: "csv" }],
    campaignMap: { smb: "camp-1" },
    reviewRequiredIcps: [],
    autoPushIcps: [],
  } as any);
  vi.mocked(CsvFetcher).mockImplementation(function (this: any) {
    this.fetch = vi.fn().mockResolvedValue(rows);
  } as any);
  vi.mocked(verifyDomains).mockImplementation(async (domains: string[]) => new Map(domains.map((d) => [d, { alive: !dead.includes(d), status: 200, url: "" }])));
  vi.mocked(assembleCopyForLead).mockResolvedValue({ subject: "s", body1: "b", body2: "b", body3: "b" } as any);
  const pushLead = vi.fn().mockResolvedValue({ status: "pushed", detail: {} });
  vi.mocked(createEspAdapter).mockReturnValue({ pushLead } as any);
  const fake = fakeDb([]); // no leads handled before
  Object.assign(db, fake);
  return { pushLead, fake };
}

describe("runDailySend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("doesn't let dead domains use up the day's volume", async () => {
    const { pushLead } = setup([lead(1), lead(2), lead(3), lead(4)], ["co1.com", "co2.com"], { volume: 2 });
    await runDailySend({ engagementId: "e1" }, "run-1", undefined);
    expect(pushLead.mock.calls.map((c) => c[0].email)).toEqual(["p3@co3.com", "p4@co4.com"]);
  });

  it("records outcomes with an update for retryable rows, never a silent no-op", async () => {
    const { fake } = setup([lead(1)], [], { volume: 1 });
    await runDailySend({ engagementId: "e1" }, "run-1", undefined);
    expect(fake.onConflictDoUpdate).toHaveBeenCalled();
    expect(fake.onConflictDoNothing).not.toHaveBeenCalled();
    const conflict = fake.onConflictDoUpdate.mock.calls[0][0];
    expect(conflict.set.status).toBe("pushed");
    expect(conflict.setWhere).toBeDefined();
  });

  it("pushes a person once even if they appear twice in the run", async () => {
    const { pushLead } = setup([lead(1), { ...lead(1), icp: "smb" }], [], { volume: 5 });
    await runDailySend({ engagementId: "e1" }, "run-1", undefined);
    expect(pushLead).toHaveBeenCalledTimes(1);
  });
});
