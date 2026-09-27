// src/lib/skill-settings/server.ts
//
// Reads and saves one skill's own settings (schema.ts) wherever they're
// stored, and the facts about what it runs on (tools, destinations) that
// are changed in setup, not here.
//
// Saving keeps each store's rules:
//   stack      top-level keys equal to their default are cleared, so the
//              running code's own default applies; values inside an
//              object (Leak Map's schedules) are written in full.
//   coldOpen   Cold Open's columns are read without fallbacks, so values
//              are always written in full.
//   rep        Reputation's identity-graph columns, written as given.
// Then a few skills need something done after: Leak Map's schedules are
// completed, Daily Send is marked configured, and Whop's webhook follows
// what the workers can now use.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, whopAgentConnections, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState, type ColdOpenConfigRow } from "@/features/cold-open/server/config";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";
import { resyncWhopWebhook } from "@/lib/whop-setup/save";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import { AD_DATA_PLATFORM_LABELS, BOOKING_PLATFORM_LABELS, EMAIL_PLATFORM_LABELS, HOSTING_PLATFORM_LABELS, SMS_PLATFORM_LABELS } from "@/lib/copy";
import { cleanSettings, defaultValue, fieldKey, settingsFor, storedValue, toShown, type SettingField, type SettingValue, type SettingValues } from "./schema";

type Obj = Record<string, unknown>;
type RepGraph = typeof repIdentityGraphs.$inferSelect;

export function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Obj)[k] : undefined), source);
}

/** Where each product's setup lives: the page tools and connections change on. */

export interface SkillSettingsView {
  skillId: WorkerId;
  name: string;
  description: string;
  /** Stored values (fractions stay fractions), defaults filled in. */
  values: SettingValues;
  /** Which values are the default because nothing is stored. */
  usingDefault: string[];
  /** Choices loaded for this client (e.g. Cold Open's customer types). */
  options: Record<string, { value: string; label: string }[]>;
  /** Other settings a field's lock depends on. */
  context: SettingValues;
  /** What this skill runs on, changed in setup. */
  facts: { label: string; value: string }[];
  setupHref: string;
  /** Why the settings can't be edited yet (the product isn't set up). */
  blocked: string | null;
}

interface Stores {
  stack: EngagementStack | null;
  coldOpen: ColdOpenConfigRow | null;
  rep: RepGraph | null;
}

async function loadStores(engagementId: string, need: { coldOpen: boolean; rep: boolean }): Promise<Stores | null> {
  const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
  if (!row) return null;
  const [coldOpen, rep] = await Promise.all([
    need.coldOpen ? getColdOpenConfig(engagementId) : null,
    need.rep ? db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1).then((r) => r[0] ?? null) : null,
  ]);
  return { stack: (row.stack as EngagementStack | null) ?? null, coldOpen, rep };
}

const label = (map: Record<string, string>, v: string | null | undefined) => (v ? (map[v] ?? v) : "Not set");

/** What the skill runs on, as plain facts. Changed in setup. */
function factsFor(skillId: WorkerId, s: Stores): { label: string; value: string }[] {
  const st = s.stack ?? ({} as EngagementStack);
  const co = s.coldOpen;
  const rep = s.rep;
  switch (skillId) {
    case "pin-down":
      return [
        { label: "Bookings from", value: label(BOOKING_PLATFORM_LABELS, st.booking_platform) },
        { label: "Emails through", value: label(EMAIL_PLATFORM_LABELS, st.email_platform) },
        { label: "Confirmation page on", value: label(HOSTING_PLATFORM_LABELS, st.hosting_platform) },
      ];
    case "pile-on":
      return [
        { label: "Texts through", value: label(SMS_PLATFORM_LABELS, st.sms_platform) },
        ...(st.sms_platform === "twilio" ? [{ label: "Twilio A2P registration", value: st.sms_a2p_10dlc_status === "campaign_approved" ? "Approved" : st.sms_a2p_10dlc_status === "brand_registered" ? "Brand registered, campaign pending" : "Not registered" }] : []),
        { label: "Ad audiences", value: label(AD_DATA_PLATFORM_LABELS, st.ad_data_platform) },
      ];
    case "win-back":
      return [
        { label: "Emails through", value: label(EMAIL_PLATFORM_LABELS, st.email_platform) },
        { label: "Texts through", value: label(SMS_PLATFORM_LABELS, st.sms_platform) },
        { label: "Replies caught", value: st.inbound_reply_mode === "native" ? "From HubSpot conversations" : st.inbound_reply_mode === "forwarding" ? "From a forwarding address" : "Not set up" },
        ...(st.win_back_auto_paused ? [{ label: "Paused", value: st.win_back_auto_paused_reason ?? "Paused for delivery problems" }] : []),
      ];
    case "pre-call-read":
      return [
        { label: "Briefs land in", value: st.brief_landing_destination === "slack" ? (st.slack_channel_name ? `Slack #${st.slack_channel_name}` : "Slack") : st.brief_landing_destination === "crm_note" ? "A note on the CRM contact" : st.brief_landing_destination === "calendar_event" ? "The calendar event" : "Not set" },
        { label: "Research from", value: st.prospect_research_sources_used?.length ? st.prospect_research_sources_used.map((x) => (x === "pdl" ? "People Data Labs" : "Apollo")).join(", ") : "Public web only" },
        { label: "Calls recorded by", value: st.conversation_intelligence_provider === "recall_ai" ? "Recall.ai" : "Nothing" },
      ];
    case "leak-map":
      return [{ label: "Slack", value: st.slack_webhook_url || st.slack_channel_id ? "Connected" : "Not connected (needed to send the report to Slack)" }];
    case "rep-onboarding":
    case "rep-trustpilot-watch":
    case "rep-reddit-watch":
    case "rep-twitter-watch":
    case "rep-news-watch":
    case "rep-search-watch":
    case "rep-digest": {
      if (!rep) return [];
      const names = [rep.operatorName, ...rep.operatorAliases, ...rep.entities.map((e) => e.name)].filter(Boolean);
      return [
        { label: "Names watched", value: names.length ? `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` and ${names.length - 4} more` : ""}` : "None yet" },
        ...(skillId === "rep-onboarding" ? [{ label: "Competitors", value: String(rep.competitors.length) }, { label: "Domains", value: rep.operatorDomains.join(", ") || "None" }] : []),
      ];
    }
    case "rep-google-reviews-watch":
      return [{ label: "Google listing", value: rep?.googleListing ? `${rep.googleListing.name}${rep.googleListing.address ? `, ${rep.googleListing.address}` : ""}` : "None confirmed" }];
    case "rep-review-requests":
      return [
        { label: "Emails through", value: st.email_platform === "smtp" ? "Your SMTP or Resend sender" : "An SMTP or Resend sender, if connected" },
        { label: "Texts through", value: label(SMS_PLATFORM_LABELS, st.sms_platform) },
      ];
    case "icp-lock":
      return co ? [{ label: "Customer types", value: co.icps.map((i) => i.label || i.slug).join(", ") || "None yet" }] : [];
    case "source-connect":
      return co ? [{ label: "Lead sources", value: co.leadSources.length ? co.leadSources.map((l) => `${l.icp} (${l.fetcherType})`).join(", ") : "None yet" }] : [];
    case "send-connect":
    case "daily-send":
    case "reply-sort":
      return co
        ? [
            { label: "Sending tool", value: co.sendPlatform?.platform ?? "Not connected" },
            { label: "Campaigns mapped", value: String(new Set(Object.values(co.campaignMap)).size) },
            ...(co.sendingPause ? [{ label: "Paused", value: "During a reputation incident, until it's resolved and the restart is approved" }] : []),
          ]
        : [];
    case "whop-bridge-manager":
      return [{ label: "Forwards events to", value: st.whop_bridge_destination_url ?? "Nowhere yet" }];
    default:
      return [];
  }
}

function blockedReason(skillId: WorkerId, fields: SettingField[], s: Stores): string | null {
  if (fields.some((f) => f.store === "coldOpen") && !s.coldOpen) return "Set up Cold Open first; these settings live in its setup.";
  if (fields.some((f) => f.store === "rep") && !s.rep) return "Set up Reputation Manager first; these settings live in its identity.";
  void skillId;
  return null;
}

function storeOf(f: SettingField, s: Stores): unknown {
  return f.store === "stack" ? s.stack : f.store === "coldOpen" ? s.coldOpen : s.rep;
}

export async function loadSkillSettings(engagementId: string, skillId: WorkerId): Promise<SkillSettingsView | null> {
  const spec = settingsFor(skillId);
  const fields = spec?.fields ?? [];
  const stores = await loadStores(engagementId, { coldOpen: fields.some((f) => f.store === "coldOpen") || WORKER_REGISTRY[skillId].productId === "cold-open", rep: fields.some((f) => f.store === "rep") || WORKER_REGISTRY[skillId].productId === "reputation-manager" });
  if (!stores) return null;

  const values: SettingValues = {};
  const usingDefault: string[] = [];
  for (const f of fields) {
    const raw = readPath(storeOf(f, stores), f.path);
    const stored = raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0 && f.default === null) ? null : (raw as SettingValue);
    if (stored === null) usingDefault.push(fieldKey(f));
    values[fieldKey(f)] = stored ?? defaultValue(f);
  }

  const options: SkillSettingsView["options"] = {};
  for (const f of fields) {
    if (f.kind === "multi" && f.optionsFrom === "coldOpenIcps") options[fieldKey(f)] = (stores.coldOpen?.icps ?? []).map((i) => ({ value: i.slug, label: i.label || i.slug }));
  }

  const context: SettingValues = {};
  for (const f of fields) if (f.lockedIf) context[f.lockedIf.path] = (readPath(stores.stack, f.lockedIf.path) as SettingValue) ?? null;

  const product = WORKER_REGISTRY[skillId].productId;
  return {
    skillId,
    name: WORKER_REGISTRY[skillId].name,
    description: WORKER_REGISTRY[skillId].description,
    values,
    usingDefault,
    options,
    context,
    facts: factsFor(skillId, stores),
    setupHref: `/dashboard/engagements/${encodeURIComponent(engagementId)}/bridges/${PRODUCT_ONBOARDING_WORKER_ID[product as ProductId] ?? skillId}`,
    blocked: blockedReason(skillId, fields, stores),
  };
}

export type SaveResult = { ok: true; notice?: string } | { ok: false; error: string; field?: string };

export async function saveSkillSettings(engagementId: string, skillId: WorkerId, raw: Record<string, unknown>): Promise<SaveResult> {
  const spec = settingsFor(skillId);
  if (!spec) return { ok: false, error: "This skill has no settings of its own." };
  const stores = await loadStores(engagementId, { coldOpen: spec.fields.some((f) => f.store === "coldOpen"), rep: spec.fields.some((f) => f.store === "rep") });
  if (!stores) return { ok: false, error: "Client not found." };
  const blocked = blockedReason(skillId, spec.fields, stores);
  if (blocked) return { ok: false, error: blocked };

  // Fields not sent (hidden ones) are judged with what's stored, so a
  // cross-field check sees the whole picture.
  const current: Record<string, unknown> = {};
  // In the units the form uses (a percent as 8, not 0.08), like the incoming values.
  for (const f of spec.fields) current[fieldKey(f)] = toShown(f, (readPath(storeOf(f, stores), f.path) as SettingValue) ?? defaultValue(f));
  const merged = { ...current, ...raw };
  // A locked field can't be changed through here.
  for (const f of spec.fields) {
    if (f.lockedIf && readPath(stores.stack, f.lockedIf.path) === f.lockedIf.equals) merged[fieldKey(f)] = f.lockedIf.value;
  }
  const cleaned = cleanSettings(spec, merged);
  if ("error" in cleaned) return { ok: false, error: cleaned.error, field: cleaned.field };

  const stackPatch: Partial<Record<string, unknown>> = {};
  const coldOpenPatch: Record<string, unknown> = {};
  const repPatch: Record<string, unknown> = {};

  for (const f of spec.fields) {
    const key = fieldKey(f);
    if (!(key in cleaned.values)) continue;
    const v = cleaned.values[key];
    const [top, ...rest] = f.path.split(".");
    if (f.store === "stack") {
      if (rest.length === 0) {
        stackPatch[top] = storedValue(f, v) ?? undefined;
      } else {
        const base = (stackPatch[top] as Obj | undefined) ?? { ...((readPath(stores.stack, top) as Obj | undefined) ?? {}) };
        base[rest.join(".")] = v ?? defaultValue(f);
        stackPatch[top] = base;
      }
    } else if (f.store === "coldOpen") {
      const full = v ?? defaultValue(f) ?? (f.kind === "multi" || f.kind === "list" ? [] : null);
      if (rest.length === 0) coldOpenPatch[top] = full;
      else {
        const base = (coldOpenPatch[top] as Obj | undefined) ?? { ...((readPath(stores.coldOpen, top) as Obj | undefined) ?? {}) };
        base[rest.join(".")] = full;
        coldOpenPatch[top] = base;
      }
    } else {
      repPatch[top] = f.kind === "list" ? (v ?? []) : f.path === "crisisThresholdOverride" ? storedValue(f, v) : v;
    }
  }

  // ── After-save rules ──
  if (skillId === "leak-map") {
    // The two schedules share the hour and the time zone, and are read in full.
    const weekly = { dayOfWeek: 1, hourLocal: 9, ...((readPath(stores.stack, "weekly_summary_schedule") as Obj) ?? {}), ...((stackPatch.weekly_summary_schedule as Obj) ?? {}) } as Obj;
    weekly.timezone = (weekly.timezone as string | undefined) || stores.stack?.timezone || "UTC";
    const monthly = { dayOfMonth: 1, ...((readPath(stores.stack, "monthly_deep_dive_schedule") as Obj) ?? {}), ...((stackPatch.monthly_deep_dive_schedule as Obj) ?? {}), hourLocal: weekly.hourLocal, timezone: weekly.timezone };
    stackPatch.weekly_summary_schedule = weekly;
    stackPatch.monthly_deep_dive_schedule = monthly;
    if (stackPatch.audit_output_format === "slack" && !(stores.stack?.slack_webhook_url || stores.stack?.slack_channel_id)) {
      return { ok: false, error: "Connect Slack in Showtime setup first, or pick email or the dashboard.", field: "audit_output_format" };
    }
  }
  if (skillId === "daily-send") {
    const d = coldOpenPatch.dailySendSettings as Obj | undefined;
    if (d) coldOpenPatch.dailySendSettings = { volume: 25, localHour: 9, copyMode: "generate", liveSendEnabled: false, ...d };
  }

  if (Object.keys(stackPatch).length) await patchEngagementStack(engagementId, stackPatch as Partial<EngagementStack>);
  if (Object.keys(coldOpenPatch).length) await upsertColdOpenConfig(engagementId, coldOpenPatch as Partial<ColdOpenConfigRow>);
  if (Object.keys(repPatch).length) await db.update(repIdentityGraphs).set({ ...repPatch, updatedAt: new Date() }).where(eq(repIdentityGraphs.engagementId, engagementId));

  if (skillId === "daily-send") await setColdOpenPhaseState(engagementId, "daily_send", "complete");

  if ((WHOP_AGENT_SKILL_IDS as string[]).includes(skillId)) {
    const [connected] = await db.select({ id: whopAgentConnections.id }).from(whopAgentConnections).where(eq(whopAgentConnections.engagementId, engagementId)).limit(1);
    if (connected) {
      const [row] = await db.select({ stack: engagements.stack }).from(engagements).where(eq(engagements.engagementId, engagementId)).limit(1);
      const enabled: string[] = [];
      for (const id of WHOP_AGENT_SKILL_IDS) if (await isSkillEnabledForEngagement(engagementId, id)) enabled.push(id);
      try {
        await resyncWhopWebhook(engagementId, (row?.stack as EngagementStack | null) ?? {}, enabled);
      } catch (err) {
        return { ok: true, notice: `Saved, but Whop didn't accept the webhook update: ${err instanceof Error ? err.message : "unknown error"}` };
      }
    }
  }
  return { ok: true };
}
