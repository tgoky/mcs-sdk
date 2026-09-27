import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { engagements, repIdentityGraphs, whopAgentConnections } from "@/models/schema";

// ── db and stores ──
const tables = new Map<unknown, Record<string, unknown>[]>();
const repUpdates: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => {
  const read = (t: unknown) => {
    const rows = () => tables.get(t) ?? [];
    const chain = { where: () => chain, limit: async () => rows(), then: (ok: (v: unknown) => unknown) => Promise.resolve(rows()).then(ok) };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (t: unknown) => read(t) }),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => void repUpdates.push(s) }) }),
    },
  };
});
const stackPatches: Record<string, unknown>[] = [];
vi.mock("@/lib/engagement-stack", () => ({ patchEngagementStack: async (_id: string, p: Record<string, unknown>) => void stackPatches.push(p) }));
let coldOpen: Record<string, unknown> | null = null;
const coldOpenPatches: Record<string, unknown>[] = [];
const phases: string[] = [];
vi.mock("@/features/cold-open/server/config", () => ({
  getColdOpenConfig: async () => coldOpen,
  upsertColdOpenConfig: async (_id: string, p: Record<string, unknown>) => void coldOpenPatches.push(p),
  setColdOpenPhaseState: async (_id: string, key: string) => void phases.push(key),
}));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
const resync = vi.fn(async () => ({ action: "updated", events: [] }));
vi.mock("@/lib/whop-setup/save", () => ({ resyncWhopWebhook: (...a: unknown[]) => (resync as (...x: unknown[]) => unknown)(...a) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { cleanSettings, cleanValue, settingsFor, storedValue, SKILL_SETTINGS, defaultValue, type SettingField } from "@/lib/skill-settings/schema";
import { loadSkillSettings, saveSkillSettings } from "@/lib/skill-settings/server";
import { SkillSettingsPanel } from "@/components/skill-settings/skill-settings-panel";

beforeEach(() => {
  tables.clear();
  stackPatches.length = 0;
  coldOpenPatches.length = 0;
  repUpdates.length = 0;
  phases.length = 0;
  coldOpen = null;
  resync.mockClear();
});

describe("each skill's settings are real and sane", () => {
  it("every default fits its own limits and choices", () => {
    for (const [skill, spec] of Object.entries(SKILL_SETTINGS)) {
      for (const f of spec!.fields) {
        const d = defaultValue(f);
        if (d === null) continue;
        if (f.kind === "number") {
          const shown = f.percent ? (d as number) * 100 : (d as number);
          expect(shown, `${skill} ${f.path}`).toBeGreaterThanOrEqual(f.min);
          expect(shown, `${skill} ${f.path}`).toBeLessThanOrEqual(f.max);
        }
        if (f.kind === "select") expect(f.options.map((o) => o.value), `${skill} ${f.path}`).toContain(String(f.default));
      }
    }
  });

  it("checks values the way the running code needs them", () => {
    const num = settingsFor("whop-refund-dispute-velocity")!.fields[0] as SettingField;
    expect(cleanValue(num, 8)).toEqual({ value: 0.08 });
    expect(cleanValue(num, 80)).toMatchObject({ error: expect.stringContaining("between 1 and 50") });
    const tz = settingsFor("daily-send")!.fields.find((f) => f.path === "dailySendSettings.timezone")!;
    expect(cleanValue(tz, "America/New_York")).toEqual({ value: "America/New_York" });
    expect(cleanValue(tz, "Mars/Base")).toMatchObject({ error: expect.stringContaining("isn't a time zone") });
    const msg = settingsFor("rep-review-requests")!.fields.find((f) => f.path === "rep_review_request_message")!;
    expect(cleanValue(msg, "Please review us")).toMatchObject({ error: expect.stringContaining("{link}") });
  });

  it("keeps the save offer all or nothing, and the opt-out line honest", () => {
    const offer = settingsFor("whop-cancellation-save-offer")!;
    expect(cleanSettings(offer, { whop_save_offer_discount_percentage: 20 })).toMatchObject({ error: expect.stringContaining("together") });
    expect(cleanSettings(offer, { whop_save_offer_discount_percentage: 20, whop_save_offer_duration_months: 2, whop_save_offer_message: "Stay" })).toHaveProperty("values");
    const pile = settingsFor("pile-on")!;
    expect(cleanSettings(pile, { sms_compliance_footer_variant: "custom", sms_compliance_footer_custom: "Bye" })).toMatchObject({ error: expect.stringContaining("STOP") });
  });

  it("clears a top-level setting set back to its default, so the code's default applies", () => {
    const f = settingsFor("leak-map")!.fields.find((x) => x.path === "sample_size_minimum")!;
    expect(storedValue(f, 5)).toBeNull();
    expect(storedValue(f, 12)).toBe(12);
  });
});

describe("loading and saving", () => {
  it("loads stored values with defaults filled in, and what the skill runs on", async () => {
    tables.set(engagements, [{ stack: { sms_platform: "twilio", sms_a2p_10dlc_status: "campaign_approved", at_risk_check_in: true, ad_data_platform: "none" } }]);
    const view = (await loadSkillSettings("e1", "pile-on"))!;
    expect(view.values).toMatchObject({ at_risk_check_in: true, at_risk_threshold: 50, reminder_holdout_percent: 0, sms_compliance_footer_variant: "standard" });
    expect(view.usingDefault).toContain("at_risk_threshold");
    expect(view.facts).toEqual(expect.arrayContaining([{ label: "Twilio A2P registration", value: "Approved" }]));
    expect(view.setupHref).toBe("/dashboard/engagements/e1/bridges/pin-down");
  });

  it("saves only the changed shape: defaults cleared, percents stored as fractions", async () => {
    tables.set(engagements, [{ stack: {} }]);
    expect(await saveSkillSettings("e1", "win-back", { win_back_bounce_rate_threshold: 3, recovery_window_days: "30", daily_send_tolerance: "1" })).toEqual({ ok: true });
    expect(stackPatches[0]).toMatchObject({ win_back_bounce_rate_threshold: 0.03, recovery_window_days: undefined, daily_send_tolerance: 1 });
  });

  it("writes Leak Map's schedules whole, sharing the hour and time zone", async () => {
    tables.set(engagements, [{ stack: { timezone: "Europe/London" } }]);
    await saveSkillSettings("e1", "leak-map", { "weekly_summary_schedule.dayOfWeek": "3", "weekly_summary_schedule.hourLocal": "14", "monthly_deep_dive_schedule.dayOfMonth": "10" });
    expect(stackPatches[0]).toMatchObject({
      weekly_summary_schedule: { dayOfWeek: 3, hourLocal: 14, timezone: "Europe/London" },
      monthly_deep_dive_schedule: { dayOfMonth: 10, hourLocal: 14, timezone: "Europe/London" },
    });
  });

  it("refuses Slack reports without Slack connected", async () => {
    tables.set(engagements, [{ stack: {} }]);
    expect(await saveSkillSettings("e1", "leak-map", { audit_output_format: "slack" })).toMatchObject({ ok: false, field: "audit_output_format" });
    expect(stackPatches).toEqual([]);
  });

  it("won't turn scoring off while at-risk check-ins need it", async () => {
    tables.set(engagements, [{ stack: { at_risk_check_in: true } }]);
    await saveSkillSettings("e1", "pre-call-read", { show_rate_scoring_enabled: false });
    expect(stackPatches[0]).toMatchObject({ show_rate_scoring_enabled: true });
  });

  it("writes Cold Open's settings in full and marks Daily Send set up", async () => {
    tables.set(engagements, [{ stack: {} }]);
    coldOpen = { icps: [], dailySendSettings: null, campaignMap: {}, leadSources: [] };
    await saveSkillSettings("e1", "daily-send", { "dailySendSettings.volume": 40, "dailySendSettings.liveSendEnabled": true });
    expect(coldOpenPatches[0]).toEqual({ dailySendSettings: { volume: 40, localHour: 9, copyMode: "generate", liveSendEnabled: true, timezone: null } });
    expect(phases).toEqual(["daily_send"]);
  });

  it("says when the product isn't set up yet", async () => {
    tables.set(engagements, [{ stack: {} }]);
    expect(await saveSkillSettings("e1", "send-report", { reportWindowDays: 14 })).toMatchObject({ ok: false, error: expect.stringContaining("Set up Cold Open first") });
    tables.set(repIdentityGraphs, []);
    expect((await loadSkillSettings("e1", "rep-crisis-response"))!.blocked).toContain("Reputation Manager");
  });

  it("brings Whop's webhook in line after a Whop setting changes", async () => {
    tables.set(engagements, [{ stack: {} }]);
    tables.set(whopAgentConnections, [{ id: "c1" }]);
    await saveSkillSettings("e1", "whop-cancellation-save-offer", { whop_save_offer_discount_percentage: 20, whop_save_offer_duration_months: 2, whop_save_offer_message: "Stay with us" });
    expect(resync).toHaveBeenCalledTimes(1);
  });
});

describe("the panel", () => {
  it("shows the skill's own settings, reveals dependent ones, and saves in the form's units", async () => {
    const view = {
      skillId: "pile-on",
      name: "Pile-On",
      description: "Warm-up texts between a booking and the call.",
      values: { at_risk_check_in: false, at_risk_threshold: 50, at_risk_check_in_message: "Hi {name}", reminder_holdout_percent: 0, sms_compliance_footer_variant: "standard", sms_compliance_footer_custom: null },
      usingDefault: [],
      options: {},
      context: {},
      facts: [{ label: "Texts through", value: "Twilio" }],
      setupHref: "/dashboard/engagements/e1/bridges/pin-down",
      blocked: null,
    };
    const posted: unknown[] = [];
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify(view), { status: 200 });
    }) as unknown as typeof fetch;
    const onSaved = vi.fn();
    render(<SkillSettingsPanel engagementId="e1" skillId="pile-on" onClose={() => undefined} onSaved={onSaved} />);

    await screen.findByText("Check in with at-risk calls");
    expect(screen.queryByText("At risk under")).toBeNull();
    expect(screen.getByText("Twilio")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Tools and connections in setup/ }).getAttribute("href")).toBe("/dashboard/engagements/e1/bridges/pin-down");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("switch", { name: "Check in with at-risk calls" }));
    await screen.findByText("At risk under");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(posted[0]).toMatchObject({ at_risk_check_in: true, at_risk_threshold: 50 });
  });

  it("says so when a skill has nothing of its own to set", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ skillId: "rep-digest", name: "Daily Digest", description: "d", values: {}, usingDefault: [], options: {}, context: {}, facts: [], setupHref: "/x", blocked: null }), { status: 200 })) as unknown as typeof fetch;
    render(<SkillSettingsPanel engagementId="e1" skillId="rep-digest" onClose={() => undefined} />);
    await screen.findByText("Nothing to set for this skill. It runs on its own.");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
