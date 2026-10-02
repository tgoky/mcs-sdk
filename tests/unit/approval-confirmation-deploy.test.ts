import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn() }));
vi.mock("@/lib/engagement-status", () => ({ isEngagementPaused: vi.fn(() => false) }));
vi.mock("@/lib/credentials", () => ({ resolveCredential: vi.fn(async () => "tok") }));
vi.mock("@/lib/run-log", () => ({ logStep: vi.fn() }));
vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.test" }));
vi.mock("@/lib/platforms/hosting", () => ({ publishConfirmationPage: vi.fn() }));

import { db } from "@/lib/db";
import { publishConfirmationPage } from "@/lib/platforms/hosting";
import { ACTION_EXECUTORS } from "@/lib/approval-gate";
import { fakeDb } from "../helpers/fake-db";

const pageContent = { html: "<!doctype html><p>Acme page</p>", title: "Acme" };
const tenant = { engagementId: "e1", deletedAt: null, stack: { hosting_platform: "webflow", hosting_platform_meta: {} } };

function setCalls() {
  return (db as unknown as { set: ReturnType<typeof vi.fn> }).set.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

describe("approving a queued confirmation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(db, fakeDb([tenant]));
  });

  it("records the approved page for the hosted address when it went live", async () => {
    vi.mocked(publishConfirmationPage).mockResolvedValue({ mode: "live", url: "https://acme.com/confirmed", deployedVia: "webflow" });
    await ACTION_EXECUTORS.confirmation_page_deploy("e1", { runId: "r1", pageContent });
    const set = setCalls().find((s) => "confirmationPageDeployment" in s)!;
    expect(set.confirmationPageUrl).toBe("https://acme.com/confirmed");
    expect(set.confirmationPageHtml).toBe(pageContent.html);
    expect(set.confirmationPageBuiltAt).toBeInstanceOf(Date);
  });

  it("records it too when it's handed over to paste, and points at the hosted page", async () => {
    vi.mocked(publishConfirmationPage).mockResolvedValue({ mode: "paste_ready", reason: "No API", instructions: "Paste it", html: "<iframe srcdoc=…></iframe>" });
    await ACTION_EXECUTORS.confirmation_page_deploy("e1", { runId: "r1", pageContent });
    const set = setCalls().find((s) => "confirmationPageDeployment" in s)!;
    expect(set.confirmationPageUrl).toBe("https://app.test/confirm/e1");
    expect(set.pasteReadyHtml).toBe("<iframe srcdoc=…></iframe>");
    expect(set.confirmationPageHtml).toBe(pageContent.html);
  });
});
