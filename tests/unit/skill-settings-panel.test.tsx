import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { engagements, repIdentityGraphs, whopAgentConnections } from "@/models/schema";

// ── db and stores ──
const tables = new Map<unknown, Record<string, unknown>[]>();
const updates: { table: unknown; set: Record<string, unknown> }[] = [];
vi.mock("@/lib/db", () => {
  const read = (t: unknown) => {
    const rows = () => tables.get(t) ?? [];
    const chain = { where: () => chain, limit: async () => rows(), then: (ok: (v: unknown) => unknown) => Promise.resolve(rows()).then(ok) };
    return chain;
  };
  return {
    db: {
      select: () => ({ from: (t: unknown) => read(t) }),
      update: (table: unknown) => ({ set: (set: Record<string, unknown>) => ({ where: async () => void updates.push({ table, set }) }) }),
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
const sendConnect = vi.fn(async (...args: unknown[]) => {
  void args;
  return { ok: true } as { ok: true } | { error: string };
});
vi.mock("@/features/cold-open/server/send-connect", () => ({ saveSendConnect: (...a: unknown[]) => sendConnect(...a) }));
vi.mock("@/lib/cold-open-setup/sender", () => ({ pullSender: async () => ({ campaigns: [] }) }));
vi.mock("@/lib/engagement-skills", () => ({ isSkillEnabledForEngagement: async () => true }));
const resync = vi.fn(async () => ({ action: "updated", events: [] }));
vi.mock("@/lib/whop-setup/save", () => ({ resyncWhopWebhook: (...a: unknown[]) => (resync as (...x: unknown[]) => unknown)(...a) }));
const credentials = new Set<string>();
const storedSecrets: Record<string, string> = {};
const markers: unknown[][] = [];
vi.mock("@/lib/credentials", () => ({
  hasCredential: async (_id: string, p: string) => credentials.has(p),
  resolveCredential: async () => "token",
  storeCredential: async (_id: string, p: string, _ref: string, v: string) => void (storedSecrets[p] = v),
  syncMarkersForChosenPlatforms: async (_id: string, list: unknown[]) => void markers.push(list),
}));
const facts: Record<string, { value: unknown }> = {};
vi.mock("@/lib/client-facts", () => ({ getClientFact: async (_id: string, k: string) => facts[k] ?? null, getClientFacts: async () => ({}) }));
vi.mock("@/lib/showtime-setup/tool-states", () => ({
  loadToolStates: async (_id: string, _ws: string, tools: { provider: string; group: string }[]) => tools.map((t) => ({ provider: t.provider, group: t.group, linked: credentials.has(t.provider), seenOnSite: false, saved: [], accountCheck: null })),
}));
const signing: Record<string, string> = {};
vi.mock("@/lib/signing-secrets", () => ({ setSigningSecret: async (_id: string, kind: string, v: string) => void (signing[kind] = v) }));
vi.mock("@/lib/paste-key-harvest", () => ({ harvestTwilioA2PStatus: async () => undefined }));
vi.mock("@/lib/after-response", () => ({ afterResponse: () => undefined }));
const dispatched: string[] = [];
vi.mock("@/lib/skill-dispatch", () => ({ dispatchSkillRun: async (_id: string, skill: string) => void dispatched.push(skill) }));
const rebuilds = vi.fn(async () => ({ ok: true, runId: "r1", message: "" }));
vi.mock("@/lib/chat-skill-trigger", () => ({ triggerConfirmationPageRebuildForEngagement: (...a: unknown[]) => (rebuilds as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/safe-fetch", () => ({
  UnsafeUrlError: class extends Error {},
  assertPublicUrl: async (raw: string) => {
    const u = new URL(raw);
    if (u.hostname === "localhost") throw new Error("private");
    return u;
  },
}));
vi.mock("@/lib/webhook-url-token", () => ({ webhookUrl: (origin: string, path: string, id: string) => `${origin}/api/webhooks/${path}/${id}?token=t` }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/engagements/e1" }));

import { cleanSettings, cleanValue, isShown, settingsFor, storedValue, SKILL_SETTINGS, defaultValue, type SettingField } from "@/lib/skill-settings/schema";
import { loadSkillSettings, saveSkillSettings, type SkillSettingsView } from "@/lib/skill-settings/server";
import { SkillSettingsPanel } from "@/components/skill-settings/skill-settings-panel";

const ctx = { origin: "https://app.test", whopUserId: "u1", workspaceId: "w1" };
const engagementRow = (stack: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  stack,
  buyer: "Mudd",
  workspaceId: "w1",
  confirmationPageTemplate: "contract",
  heroVideoUrl: null,
  confirmationPageAnimationsEnabled: false,
  prospectMeets: null,
  topCallQuestions: [],
  topObjections: [],
  rawVoiceCorpus: null,
  offerDetails: { name: "Coaching" },
  ...extra,
});

beforeEach(() => {
  tables.clear();
  stackPatches.length = 0;
  coldOpenPatches.length = 0;
  updates.length = 0;
  phases.length = 0;
  markers.length = 0;
  dispatched.length = 0;
  credentials.clear();
  for (const k of Object.keys(storedSecrets)) delete storedSecrets[k];
  for (const k of Object.keys(signing)) delete signing[k];
  for (const k of Object.keys(facts)) delete facts[k];
  coldOpen = null;
  resync.mockClear();
  rebuilds.mockClear();
  sendConnect.mockClear();
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
        if (f.kind === "select" && !f.optionsFrom) expect(f.options.map((o) => o.value), `${skill} ${f.path}`).toContain(String(f.default));
      }
    }
  });

  it("every tool row offers real, connectable tools, and every condition points at a field", () => {
    for (const [skill, spec] of Object.entries(SKILL_SETTINGS)) {
      const keys = new Set(spec!.fields.map((f) => f.path));
      for (const f of spec!.fields) {
        if (f.showIf) expect(keys.has(f.showIf.path), `${skill} ${f.path} depends on ${f.showIf.path}`).toBe(true);
        if (f.kind === "tool") for (const c of f.choices) if (c.tool) expect(c.tool.needsKey === false || c.tool.provider.length > 0, `${skill} ${c.value}`).toBe(true);
      }
    }
  });

  it("checks values the way the running code needs them", () => {
    const num = settingsFor("whop-refund-dispute-velocity")!.fields[0] as SettingField;
    expect(cleanValue(num, 8)).toEqual({ value: 0.08 });
    expect(cleanValue(num, 80)).toMatchObject({ error: expect.stringContaining("between 1 and 50") });
    const tz = settingsFor("daily-send")!.fields.find((f) => f.path === "dailySendSettings.timezone")!;
    expect(cleanValue(tz, "Mars/Base")).toMatchObject({ error: expect.stringContaining("isn't a time zone") });
    const msg = settingsFor("rep-review-requests")!.fields.find((f) => f.path === "rep_review_request_message")!;
    expect(cleanValue(msg, "Please review us")).toMatchObject({ error: expect.stringContaining("{link}") });
    const sms = settingsFor("pile-on")!.fields.find((f) => f.path === "sms_platform")!;
    expect(cleanValue(sms, "twilio")).toEqual({ value: "twilio" });
    expect(cleanValue(sms, "carrier-pigeon")).toMatchObject({ error: expect.any(String) });
  });

  it("hides a setting whose parent is hidden (no at-risk level when texts are off)", () => {
    const fields = settingsFor("pile-on")!.fields;
    const level = fields.find((f) => f.path === "at_risk_threshold")!;
    expect(isShown(level, { sms_platform: "twilio", at_risk_check_in: true }, fields)).toBe(true);
    expect(isShown(level, { sms_platform: "none", at_risk_check_in: true }, fields)).toBe(false);
  });

  it("keeps the save offer all or nothing, the opt-out line honest, and HubSpot replies on HubSpot", () => {
    const offer = settingsFor("whop-cancellation-save-offer")!;
    expect(cleanSettings(offer, { whop_save_offer_discount_percentage: 20 })).toMatchObject({ error: expect.stringContaining("together") });
    const pile = settingsFor("pile-on")!;
    expect(cleanSettings(pile, { sms_platform: "twilio", sms_compliance_footer_variant: "custom", sms_compliance_footer_custom: "Bye" })).toMatchObject({ error: expect.stringContaining("STOP") });
    const win = settingsFor("win-back")!;
    expect(cleanSettings(win, { email_platform: "klaviyo", inbound_reply_mode: "native" })).toMatchObject({ error: expect.stringContaining("HubSpot") });
  });

  it("clears a top-level setting set back to its default, so the code's default applies", () => {
    const f = settingsFor("leak-map")!.fields.find((x) => x.path === "sample_size_minimum")!;
    expect(storedValue(f, 5)).toBeNull();
    expect(storedValue(f, 12)).toBe(12);
  });
});

describe("loading", () => {
  it("loads values, each tool's connection, and the address to paste", async () => {
    tables.set(engagements, [engagementRow({ sms_platform: "twilio", sms_a2p_10dlc_status: "campaign_approved", at_risk_check_in: true, ad_data_platform: "none" })]);
    credentials.add("twilio");
    const view = (await loadSkillSettings("e1", "pile-on", ctx))!;
    expect(view.values).toMatchObject({ sms_platform: "twilio", at_risk_check_in: true, at_risk_threshold: 50 });
    expect(view.tools.find((t) => t.provider === "twilio")).toMatchObject({ linked: true });
    expect(view.tools.map((t) => t.provider)).toEqual(expect.arrayContaining(["twilio", "ghl", "hubspot", "hyros", "google_sheets"]));
    expect(view.copies.twilioReplyUrl).toBe("https://app.test/api/webhooks/twilio-inbound/e1?token=t");
    expect(view.facts).toEqual([{ label: "Twilio A2P registration", value: "Approved" }]);
    expect(view.buyer).toBe("Mudd");
  });

  it("offers the connected Slack's channels, and says which secrets are saved", async () => {
    tables.set(engagements, [engagementRow({ conversation_intelligence_provider: "recall_ai" })]);
    facts.slackChannels = { value: [{ id: "C1", name: "#sales" }] };
    credentials.add("recall_webhook_signing_secret");
    const view = (await loadSkillSettings("e1", "pre-call-read", ctx))!;
    expect(view.options.slack_channel_id).toEqual([{ value: "C1", label: "#sales" }]);
    expect(view.secretsSet).toEqual(["secret:recall"]);
    expect(view.copies.recallWebhookUrl).toBe("https://app.test/api/recall");
  });

  it("says when the product isn't set up yet", async () => {
    tables.set(engagements, [engagementRow({})]);
    expect(await saveSkillSettings("e1", "send-report", { reportWindowDays: 14 }, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("Set up Cold Open first") });
    tables.set(repIdentityGraphs, []);
    expect((await loadSkillSettings("e1", "rep-crisis-response", ctx))!.blocked).toContain("Reputation Manager");
  });
});

describe("saving", () => {
  it("saves only the changed shape: defaults cleared, percents stored as fractions", async () => {
    tables.set(engagements, [engagementRow({ recovery_window_days: 45 })]);
    expect(await saveSkillSettings("e1", "win-back", { win_back_bounce_rate_threshold: 3, recovery_window_days: "30", daily_send_tolerance: "1", reschedule_mode: "time_slots" }, ctx)).toEqual({ ok: true });
    // Back to its default: cleared. Unchanged (the reschedule mode): not written at all.
    expect(stackPatches[0]).toEqual({ win_back_bounce_rate_threshold: 0.03, recovery_window_days: undefined, daily_send_tolerance: 1 });
  });

  it("picks Twilio with its details merged into what's saved, marks it connected, and saves the webhook secret", async () => {
    tables.set(engagements, [engagementRow({ email_platform: "klaviyo", sms_platform_meta: { twilio_from_number: "+15550000000" } })]);
    credentials.add("twilio");
    const r = await saveSkillSettings("e1", "win-back", { sms_platform: "twilio", "sms_platform_meta.twilio_account_sid": "AC1", "secret:klaviyo": "whsec" }, ctx);
    expect(r).toEqual({ ok: true });
    expect(stackPatches[0]).toMatchObject({ sms_platform: "twilio", sms_platform_meta: { twilio_account_sid: "AC1", twilio_from_number: "+15550000000" } });
    expect(markers[0]).toEqual(expect.arrayContaining(["twilio", "klaviyo"]));
    expect(storedSecrets.klaviyo_webhook_secret).toBe("whsec");
  });

  it("sends briefs to a Slack channel only from the connected workspace, keeping its name", async () => {
    tables.set(engagements, [engagementRow({})]);
    expect(await saveSkillSettings("e1", "pre-call-read", { brief_landing_destination: "slack" }, ctx)).toMatchObject({ ok: false, field: "slack_channel_id" });
    facts.slackChannels = { value: [{ id: "C1", name: "#sales" }] };
    credentials.add("slack");
    expect(await saveSkillSettings("e1", "pre-call-read", { brief_landing_destination: "slack", slack_channel_id: "C1" }, ctx)).toEqual({ ok: true });
    expect(stackPatches.at(-1)).toMatchObject({ brief_landing_destination: "slack", slack_channel_id: "C1", slack_channel_name: "sales" });
  });

  it("saves the Recall signing secret where the webhook checks it", async () => {
    tables.set(engagements, [engagementRow({})]);
    await saveSkillSettings("e1", "pre-call-read", { conversation_intelligence_provider: "recall_ai", "conversation_intelligence_meta.recall_region": "us-west-2", "secret:recall": "s3cret" }, ctx);
    expect(signing.recall).toBe("s3cret");
    expect(stackPatches[0]).toMatchObject({ conversation_intelligence_provider: "recall_ai", conversation_intelligence_meta: { recall_region: "us-west-2" } });
  });

  it("writes Leak Map's schedules whole, sharing the hour and time zone", async () => {
    tables.set(engagements, [engagementRow({ timezone: "Europe/London" })]);
    await saveSkillSettings("e1", "leak-map", { "weekly_summary_schedule.dayOfWeek": "3", "weekly_summary_schedule.hourLocal": "14", "monthly_deep_dive_schedule.dayOfMonth": "10" }, ctx);
    expect(stackPatches[0]).toMatchObject({
      weekly_summary_schedule: { dayOfWeek: 3, hourLocal: 14, timezone: "Europe/London" },
      monthly_deep_dive_schedule: { dayOfMonth: 10, hourLocal: 14, timezone: "Europe/London" },
    });
  });

  it("won't turn scoring off while at-risk check-ins need it", async () => {
    tables.set(engagements, [engagementRow({ at_risk_check_in: true })]);
    await saveSkillSettings("e1", "pre-call-read", { show_rate_scoring_enabled: false }, ctx);
    expect(stackPatches[0]).toMatchObject({ show_rate_scoring_enabled: true });
  });

  it("sets Showtime up again when the booking tool changes, and rebuilds the page when its design does", async () => {
    tables.set(engagements, [engagementRow({ booking_platform: "calendly" })]);
    expect(await saveSkillSettings("e1", "pin-down", { booking_platform: "cal_com" }, ctx)).toMatchObject({ ok: true, notice: expect.stringContaining("again") });
    expect(dispatched).toEqual(["pin-down"]);
    expect(rebuilds).not.toHaveBeenCalled();

    const r = await saveSkillSettings("e1", "pin-down", { confirmationPageTemplate: "minimalist", "offerDetails.hybrid_mode_enabled": true }, ctx);
    expect(r).toMatchObject({ ok: true, notice: expect.stringContaining("Rebuilding the page") });
    const written = updates.filter((u) => u.table === engagements);
    expect(written).toHaveLength(1);
    expect(written[0].set).toEqual({ confirmationPageTemplate: "minimalist", offerDetails: { name: "Coaching", hybrid_mode_enabled: true }, updatedAt: expect.any(Date) });
    expect(rebuilds).toHaveBeenCalledWith("u1", "w1", "e1");
  });

  it("refuses a page video that can't be embedded", async () => {
    tables.set(engagements, [engagementRow({})]);
    expect(await saveSkillSettings("e1", "pin-down", { heroVideoUrl: "https://example.com/not-a-video" }, ctx)).toMatchObject({ ok: false, field: "heroVideoUrl" });
  });

  it("switches Cold Open's sending tool through Send Connect's own save, with campaigns", async () => {
    tables.set(engagements, [engagementRow({})]);
    coldOpen = { icps: [{ slug: "agencies", label: "Agencies" }], sendPlatform: { platform: "instantly" }, campaignMap: { agencies: "c1" }, autoPushIcps: [], leadSources: [] };
    expect(await saveSkillSettings("e1", "send-connect", { "sendPlatform.platform": "smartlead" }, ctx)).toMatchObject({ ok: false, field: "campaignMap" });
    expect(await saveSkillSettings("e1", "send-connect", { "sendPlatform.platform": "smartlead", campaignMap: { agencies: "s9" } }, ctx)).toEqual({ ok: true });
    expect(sendConnect).toHaveBeenCalledWith("e1", { platform: "smartlead", baseUrl: undefined, campaignMap: { agencies: "s9" }, autoPushIcps: [] });
  });

  it("writes Cold Open's settings in full and marks Daily Send set up", async () => {
    tables.set(engagements, [engagementRow({})]);
    coldOpen = { icps: [], dailySendSettings: null, campaignMap: {}, leadSources: [] };
    await saveSkillSettings("e1", "daily-send", { "dailySendSettings.volume": 40, "dailySendSettings.liveSendEnabled": true }, ctx);
    expect(coldOpenPatches[0]).toEqual({ dailySendSettings: { volume: 40, localHour: 9, copyMode: "generate", liveSendEnabled: true } });
    expect(phases).toEqual(["daily_send"]);
  });

  it("only forwards Whop events to a public https address, and keeps Whop's webhook in line", async () => {
    tables.set(engagements, [engagementRow({})]);
    tables.set(whopAgentConnections, [{ id: "c1" }]);
    expect(await saveSkillSettings("e1", "whop-bridge-manager", { whop_bridge_destination_url: "https://localhost/x" }, ctx)).toMatchObject({ ok: false });
    expect(await saveSkillSettings("e1", "whop-bridge-manager", { whop_bridge_destination_url: "https://hooks.example.com/whop" }, ctx)).toEqual({ ok: true });
    expect(stackPatches.at(-1)).toMatchObject({ whop_bridge_destination_url: "https://hooks.example.com/whop" });
    expect(resync).toHaveBeenCalledTimes(1);
  });
});

// ── The panel ──

function viewOf(over: Partial<SkillSettingsView>): SkillSettingsView {
  return {
    skillId: "pile-on",
    name: "Pre-Call Sequence",
    buyer: "Mudd",
    description: "Warm-up texts between a booking and the call.",
    values: {},
    usingDefault: [],
    options: {},
    mapKeys: {},
    context: {},
    tools: [],
    copies: {},
    secretsSet: [],
    facts: [],
    alert: null,
    setupHref: "/dashboard/engagements/e1/bridges/pin-down",
    blocked: null,
    ...over,
  } as SkillSettingsView;
}

function serve(view: SkillSettingsView) {
  const posted: { url: string; body: unknown }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify(view), { status: 200 });
  }) as unknown as typeof fetch;
  return posted;
}

describe("the panel", () => {
  it("shows the tools as logos, and picking one reveals what it needs", async () => {
    const posted = serve(
      viewOf({
        values: { sms_platform: "none", at_risk_check_in: false, at_risk_threshold: 50, reminder_holdout_percent: 0, sms_compliance_footer_variant: "standard", ad_data_platform: "none" },
        tools: [{ provider: "twilio", group: "sms", linked: true, seenOnSite: false, saved: [], accountCheck: null }],
        copies: { twilioReplyUrl: "https://app.test/api/webhooks/twilio-inbound/e1?token=t" },
      })
    );
    const onSaved = vi.fn();
    render(<SkillSettingsPanel engagementId="e1" skillId="pile-on" onClose={() => undefined} onSaved={onSaved} />);

    await screen.findByText("Texts through");
    // Texts are off: nothing that depends on them shows, and nowhere says "go to setup".
    expect(screen.queryByText("Check in with at-risk calls")).toBeNull();
    expect(screen.queryByText(/in setup/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Twilio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use Twilio" }));
    await screen.findByText("Twilio Account SID");
    expect(screen.getByText("https://app.test/api/webhooks/twilio-inbound/e1?token=t")).toBeTruthy();
    expect(screen.getByText("Check in with at-risk calls")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Twilio Account SID" }), { target: { value: "AC123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(posted[0].body).toMatchObject({ sms_platform: "twilio", "sms_platform_meta.twilio_account_sid": "AC123" });
  });

  it("connects a tool from its logo with a key, through the shared connect route", async () => {
    const posted = serve(viewOf({ skillId: "pre-call-read", name: "Call Brief", values: { brief_landing_destination: null, prospect_research_sources_used: null } }));
    render(<SkillSettingsPanel engagementId="e1" skillId="pre-call-read" onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Apollo" }));
    fireEvent.change(await screen.findByPlaceholderText("API key"), { target: { value: "k-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(posted.some((p) => p.url.endsWith("/setup/showtime/connect"))).toBe(true));
    expect(posted.find((p) => p.url.endsWith("/setup/showtime/connect"))!.body).toEqual({ provider: "apollo", value: "k-123" });
  });

  it("picks from a styled list, not a browser select", async () => {
    const posted = serve(viewOf({ skillId: "win-back", name: "Booking Recovery", values: { email_platform: "hubspot", sms_platform: "none", recovery_window_days: 30, daily_send_tolerance: 2, reschedule_mode: "time_slots", inbound_reply_mode: "none" } }));
    render(<SkillSettingsPanel engagementId="e1" skillId="win-back" onClose={() => undefined} onSaved={() => undefined} />);
    await screen.findByText("Keep trying for");
    expect(document.querySelector("select")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Keep trying for" }));
    const list = await screen.findByRole("listbox", { name: "Keep trying for" });
    fireEvent.click(within(list).getByRole("button", { name: "45 days" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted.length).toBe(1));
    expect(posted[0].body).toMatchObject({ recovery_window_days: "45" });
  });

  it("says so when a skill has nothing of its own to set", async () => {
    serve(viewOf({ skillId: "rep-digest", name: "Daily Digest", description: "d" }));
    render(<SkillSettingsPanel engagementId="e1" skillId="rep-digest" onClose={() => undefined} />);
    await screen.findByText(/nothing to set/);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
