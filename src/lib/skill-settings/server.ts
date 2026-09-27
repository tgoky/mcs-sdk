// src/lib/skill-settings/server.ts
//
// Reads and saves one skill's own settings (schema.ts) wherever they're
// stored, with the state of every tool the skill runs on (connected, saved
// accounts to reuse), so Configure can connect them in place.
//
// Saving keeps each store's rules:
//   stack       top-level keys equal to their default are cleared, so the
//               running code's own default applies; values inside an
//               object (Leak Map's schedules, Twilio's details) are merged.
//   coldOpen    Cold Open's columns are read without fallbacks, so values
//               are always written in full; its sending tool and campaigns
//               go through Send Connect's own save.
//   rep         Reputation's identity-graph columns, written as given.
//   engagement  the engagement's own columns (Show Rate Setup's page).
// Then what the change needs done: a new booking, email or page tool sets
// Showtime up again; a page change rebuilds the page; a chosen tool whose
// key is already saved is marked connected; Twilio's registration is
// re-read; Whop's webhook follows what the workers can now use.

import { db } from "@/lib/db";
import { engagements, repIdentityGraphs, whopAgentConnections, type ColdOpenSendPlatformId, type EngagementStack } from "@/models/schema";
import { eq } from "drizzle-orm";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { getColdOpenConfig, upsertColdOpenConfig, setColdOpenPhaseState, type ColdOpenConfigRow } from "@/features/cold-open/server/config";
import { saveSendConnect } from "@/features/cold-open/server/send-connect";
import { isSkillEnabledForEngagement } from "@/lib/engagement-skills";
import { WHOP_AGENT_SKILL_IDS } from "@/lib/whop-agent-skill-manifest";
import { resyncWhopWebhook } from "@/lib/whop-setup/save";
import { PRODUCT_ONBOARDING_WORKER_ID, WORKER_REGISTRY, type WorkerId } from "@/lib/worker-registry";
import type { ProductId } from "@/lib/product-catalog";
import { hasCredential, resolveCredential, storeCredential, syncMarkersForChosenPlatforms } from "@/lib/credentials";
import { getClientFact, getClientFacts } from "@/lib/client-facts";
import { loadToolStates } from "@/lib/showtime-setup/tool-states";
import type { ToolState } from "@/lib/showtime-setup/types";
import type { SetupTool } from "@/lib/showtime-setup/catalog";
import { setSigningSecret } from "@/lib/signing-secrets";
import { harvestTwilioA2PStatus } from "@/lib/paste-key-harvest";
import { afterResponse } from "@/lib/after-response";
import { dispatchSkillRun } from "@/lib/skill-dispatch";
import { triggerConfirmationPageRebuildForEngagement } from "@/lib/chat-skill-trigger";
import { sanitizeVideoEmbedUrl } from "@/features/pin-down/server/templates/content-model";
import { TEMPLATE_IDS, DEFAULT_TEMPLATE } from "@/features/pin-down/server/templates/types";
import { assertPublicUrl, UnsafeUrlError } from "@/lib/safe-fetch";
import { webhookUrl } from "@/lib/webhook-url-token";
import { TWILIO_INBOUND_PATH } from "@/lib/sms-replies";
import { pullSender } from "@/lib/cold-open-setup/sender";
import type { Outbound } from "@/lib/cold-open-setup/types";
import { ghlLocationIdOf } from "@/lib/ghl-location";
import { buildWebhookReceiverUrl } from "@/lib/booking-sync-status";
import { bookingSyncPatch } from "@/lib/booking-sync-mode";
import { getSigningSecret } from "@/lib/signing-secrets";
import { recordSalesCallChoice } from "@/lib/account-intel/decisions";
import { NOTIFICATION_PACK, activateNotificationPackAlert, deactivateNotificationPackAlert } from "@/features/leak-map/server/notification-pack";
import { getOrCreateBridgeSigningSecret } from "@/features/whop-agent/server/bridge-manager-service";
import { cleanSettings, defaultValue, fieldKey, isValueless, settingsFor, SHOWTIME_CORE_TOOLS, storedValue, toShown, type CopyId, type SettingField, type SettingValue, type SettingValues } from "./schema";

type Obj = Record<string, unknown>;
type RepGraph = typeof repIdentityGraphs.$inferSelect;

export function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Obj)[k] : undefined), source);
}

export interface SkillSettingsView {
  skillId: WorkerId;
  name: string;
  /** The client's name, for "connected for …". */
  buyer: string;
  description: string;
  /** Stored values (fractions stay fractions), defaults filled in. */
  values: SettingValues;
  /** Which values are the default because nothing is stored. */
  usingDefault: string[];
  /** Choices loaded for this client (customer types, Slack channels, campaigns). */
  options: Record<string, { value: string; label: string }[]>;
  /** The keys a map field has a choice for (Cold Open's customer types). */
  mapKeys: Record<string, { value: string; label: string }[]>;
  /** Other settings a field's lock depends on, and what's known about the
   * client that a live list needs (GoHighLevel's Location ID,
   * ActiveCampaign's account address). */
  context: SettingValues;
  /** Every tool this skill's rows offer: connected here, or saved in the workspace. */
  tools: ToolState[];
  /** Addresses to paste into another tool. */
  copies: Partial<Record<CopyId, string | null>>;
  /** Secret rows that already have one saved. */
  secretsSet: string[];
  /** Plain facts that aren't settings (what's watched, a pause). */
  facts: { label: string; value: string }[];
  /** Something that needs doing now, with the call that does it. */
  alert: { text: string; action?: { label: string; endpoint: string } } | null;
  setupHref: string;
  /** Why the settings can't be edited yet (the product isn't set up). */
  blocked: string | null;
}

export interface SettingsContext {
  /** The app's own address, for webhook addresses. */
  origin: string;
  whopUserId: string;
  workspaceId: string;
}

interface EngagementColumns {
  buyer: string;
  workspaceId: string | null;
  confirmationPageTemplate: string;
  heroVideoUrl: string | null;
  confirmationPageAnimationsEnabled: boolean;
  prospectMeets: string | null;
  topCallQuestions: string[] | null;
  topObjections: string[] | null;
  rawVoiceCorpus: string | null;
  offerDetails: Obj | null;
}

interface Stores {
  stack: EngagementStack | null;
  engagement: EngagementColumns;
  coldOpen: ColdOpenConfigRow | null;
  rep: RepGraph | null;
  /** Confirmed client facts a setting stands for, by key (the chosen id). */
  facts: Record<string, string | null>;
}

/** The sales-call event, as its id; a rejected suggestion reads as unset. */
async function factIds(engagementId: string, fields: SettingField[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    if (f.store !== "fact") continue;
    const fact = await getClientFact(engagementId, f.path);
    const id = fact && fact.status !== "rejected" ? (fact.value as { id?: unknown } | null)?.id : null;
    out[f.path] = typeof id === "string" || typeof id === "number" ? String(id) : null;
  }
  return out;
}

async function loadStores(engagementId: string, need: { coldOpen: boolean; rep: boolean; fields?: SettingField[] }): Promise<Stores | null> {
  const [row] = await db
    .select({
      stack: engagements.stack,
      buyer: engagements.buyer,
      workspaceId: engagements.workspaceId,
      confirmationPageTemplate: engagements.confirmationPageTemplate,
      heroVideoUrl: engagements.heroVideoUrl,
      confirmationPageAnimationsEnabled: engagements.confirmationPageAnimationsEnabled,
      prospectMeets: engagements.prospectMeets,
      topCallQuestions: engagements.topCallQuestions,
      topObjections: engagements.topObjections,
      rawVoiceCorpus: engagements.rawVoiceCorpus,
      offerDetails: engagements.offerDetails,
    })
    .from(engagements)
    .where(eq(engagements.engagementId, engagementId))
    .limit(1);
  if (!row) return null;
  const [coldOpen, rep] = await Promise.all([
    need.coldOpen ? getColdOpenConfig(engagementId) : null,
    need.rep ? db.select().from(repIdentityGraphs).where(eq(repIdentityGraphs.engagementId, engagementId)).limit(1).then((r) => r[0] ?? null) : null,
  ]);
  const { stack, ...engagement } = row;
  // The page builder treats an unknown design as the default one.
  const template = (TEMPLATE_IDS as string[]).includes(engagement.confirmationPageTemplate) ? engagement.confirmationPageTemplate : DEFAULT_TEMPLATE;
  return {
    stack: (stack as EngagementStack | null) ?? null,
    engagement: { ...(engagement as unknown as EngagementColumns), confirmationPageTemplate: template },
    coldOpen,
    rep,
    facts: need.fields ? await factIds(engagementId, need.fields) : {},
  };
}

/** Facts that aren't settings: what's watched, what's paused, what's registered. */
function factsFor(skillId: WorkerId, s: Stores): { label: string; value: string }[] {
  const st = s.stack ?? ({} as EngagementStack);
  const co = s.coldOpen;
  const rep = s.rep;
  switch (skillId) {
    case "pile-on":
    case "win-back":
    case "rep-review-requests":
      return st.sms_platform === "twilio"
        ? [{ label: "Twilio A2P registration", value: st.sms_a2p_10dlc_status === "campaign_approved" ? "Approved" : st.sms_a2p_10dlc_status === "brand_registered" ? "Brand registered, campaign pending" : "Not registered yet (texts can't send until it is)" }]
        : [];
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
    case "icp-lock":
      return co ? [{ label: "Customer types", value: co.icps.map((i) => i.label || i.slug).join(", ") || "None yet" }] : [];
    case "daily-send":
    case "reply-sort":
      return co ? [{ label: "Campaigns mapped", value: String(new Set(Object.values(co.campaignMap)).size) }] : [];
    default:
      return [];
  }
}

function alertFor(skillId: WorkerId, s: Stores, engagementId: string): SkillSettingsView["alert"] {
  const st = s.stack;
  if (skillId === "win-back" && st?.win_back_auto_paused) {
    return {
      text: `Paused: ${st.win_back_auto_paused_reason ?? "too many bounces or complaints"}. Nobody new is added until you resume.`,
      action: { label: "Resume sending", endpoint: `/api/engagements/${encodeURIComponent(engagementId)}/win-back/resume-sends` },
    };
  }
  if (["send-connect", "daily-send", "reply-sort"].includes(skillId) && s.coldOpen?.sendingPause) {
    return { text: "Sending is paused during a reputation incident, until it's resolved and the restart is approved." };
  }
  return null;
}

function blockedReason(fields: SettingField[], s: Stores): string | null {
  if (fields.some((f) => f.store === "coldOpen") && !s.coldOpen) return "Set up Cold Open first; these settings live in its setup.";
  if (fields.some((f) => f.store === "rep") && !s.rep) return "Set up Reputation Manager first; these settings live in its identity.";
  return null;
}

function storeOf(f: SettingField, s: Stores): unknown {
  switch (f.store) {
    case "stack":
      return s.stack;
    case "coldOpen":
      return s.coldOpen;
    case "rep":
      return s.rep;
    case "engagement":
      return s.engagement;
    case "fact":
      return s.facts;
    default:
      return null;
  }
}

/** Every tool the skill's rows offer, once each. */
function toolsOf(fields: SettingField[]): SetupTool[] {
  const out = new Map<string, SetupTool>();
  for (const f of fields) {
    if (f.kind === "tool") for (const c of f.choices) if (c.tool) out.set(c.tool.provider, c.tool);
    if (f.kind === "connect") for (const t of f.tools) out.set(t.provider, t);
  }
  return [...out.values()];
}

async function copyValue(id: CopyId, engagementId: string, st: EngagementStack | null, origin: string): Promise<string | null> {
  switch (id) {
    case "slackInteractionsUrl":
      return `${origin.replace(/\/+$/, "")}/api/slack/interactions`;
    case "bookingWebhookUrl":
      return st?.webhook_receiver_mode === "webhook" ? buildWebhookReceiverUrl(engagementId, origin.replace(/\/+$/, "")) : null;
    case "bookingWebhookSecret":
      return st?.webhook_receiver_mode === "webhook" ? getSigningSecret(engagementId, "booking_webhook") : null;
    case "whopBridgeSecret":
      // Made the first time there's somewhere to send to.
      return st?.whop_bridge_destination_url ? getOrCreateBridgeSigningSecret(engagementId) : null;
    case "twilioReplyUrl":
      return webhookUrl(origin, TWILIO_INBOUND_PATH, engagementId);
    case "replyCatcherUrl":
      return webhookUrl(origin, "inbound-reply", engagementId);
    case "deliveryWebhookUrl": {
      const path = DELIVERY_WEBHOOK_PATHS[st?.email_platform ?? ""];
      return path ? webhookUrl(origin, path, engagementId) : null;
    }
    case "recallWebhookUrl":
      return `${origin.replace(/\/+$/, "")}/api/recall`;
  }
}

// Same paths the Win-Back bridge gives (bridges/win-back/route.ts).
const DELIVERY_WEBHOOK_PATHS: Record<string, string> = {
  klaviyo: "klaviyo-delivery",
  activecampaign: "activecampaign-delivery",
  mailchimp: "mailchimp-delivery",
  convertkit: "convertkit-delivery",
};

// Where each secret is kept (signing-secrets.ts keeps the signing ones).
const SIGNING_PROVIDER = { recall: "recall_webhook_signing_secret", slack: "slack_signing_secret" } as const;
const secretProvider = (f: Extract<SettingField, { kind: "secret" }>) => ("credential" in f.secret ? f.secret.credential : SIGNING_PROVIDER[f.secret.signing]);

/** The sending tool's campaigns: from its last read, or read now (bounded). */
async function coldOpenCampaigns(engagementId: string, platform: ColdOpenSendPlatformId | null): Promise<{ value: string; label: string }[]> {
  if (!platform) return [];
  const fact = (await getClientFact(engagementId, "coldOpenOutbound"))?.value as Outbound | undefined;
  if (fact?.platform === platform && fact.campaigns.length) return fact.campaigns.map((c) => ({ value: c.id, label: c.name }));
  if (!(await hasCredential(engagementId, `cold_open_${platform}`))) return [];
  try {
    const key = await resolveCredential(engagementId, `cold_open_${platform}`);
    const intel = await Promise.race([pullSender(platform, key), new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000))]);
    return (intel?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }));
  } catch (err) {
    console.warn(`[skill-settings] couldn't read ${platform} campaigns for ${engagementId}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function loadSkillSettings(engagementId: string, skillId: WorkerId, ctx: SettingsContext): Promise<SkillSettingsView | null> {
  const spec = settingsFor(skillId);
  const fields = spec?.fields ?? [];
  const product = WORKER_REGISTRY[skillId].productId;
  const stores = await loadStores(engagementId, {
    coldOpen: fields.some((f) => f.store === "coldOpen") || fields.some((f) => f.kind === "leadLists") || product === "cold-open",
    rep: fields.some((f) => f.store === "rep") || product === "reputation-manager",
    fields,
  });
  if (!stores) return null;

  const values: SettingValues = {};
  const usingDefault: string[] = [];
  for (const f of fields) {
    if (isValueless(f) || f.kind === "secret") continue;
    const raw = readPath(storeOf(f, stores), f.path);
    const stored = raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0 && f.default === null) ? null : (raw as SettingValue);
    if (stored === null) usingDefault.push(fieldKey(f));
    values[fieldKey(f)] = stored ?? defaultValue(f);
  }

  const options: SkillSettingsView["options"] = {};
  const mapKeys: SkillSettingsView["mapKeys"] = {};
  const icps = (stores.coldOpen?.icps ?? []).map((i) => ({ value: i.slug, label: i.label || i.slug }));
  for (const f of fields) {
    if (f.kind === "multi" && f.optionsFrom === "coldOpenIcps") options[fieldKey(f)] = icps;
    if (f.kind === "multi" && f.optionsFrom === "notificationPack") {
      options[fieldKey(f)] = NOTIFICATION_PACK.map((p) => ({ value: p.id, label: p.label, hint: `${p.comparison === "below" ? "Below" : "Above"} ${p.defaultThreshold}. ${p.watches}` }));
    }
    if (f.kind === "select" && f.optionsFrom === "bookingEventTypes") {
      const types = ((await getClientFact(engagementId, "bookingEventTypes"))?.value as { types?: { id: string; name: string; durationMin?: number | null; active?: boolean }[] } | undefined)?.types ?? [];
      options[fieldKey(f)] = types.filter((t) => t.active !== false).map((t) => ({ value: String(t.id), label: t.name, ...(t.durationMin ? { hint: `${t.durationMin} min` } : {}) }));
    }
    if (f.kind === "leadLists") mapKeys[fieldKey(f)] = icps;
    if (f.kind === "select" && f.optionsFrom === "slackChannels") {
      const channels = ((await getClientFact(engagementId, "slackChannels"))?.value as { id: string; name: string }[] | undefined) ?? [];
      options[fieldKey(f)] = channels.map((c) => ({ value: c.id, label: c.name.startsWith("#") ? c.name : `#${c.name}` }));
    }
    if (f.kind === "map") {
      mapKeys[fieldKey(f)] = icps;
      options[fieldKey(f)] = await coldOpenCampaigns(engagementId, stores.coldOpen?.sendPlatform?.platform ?? null);
    }
  }

  const context: SettingValues = {};
  for (const f of fields) if (f.lockedIf) context[f.lockedIf.path] = (readPath(stores.stack, f.lockedIf.path) as SettingValue) ?? null;
  if (fields.some((f) => f.kind === "pick")) {
    context.ghl_location_id = ghlLocationIdOf(stores.stack);
    context.activecampaign_base_url = stores.stack?.activecampaign_base_url ?? null;
  }

  const toolList = toolsOf(fields);
  const workspaceId = stores.engagement.workspaceId ?? ctx.workspaceId;
  const tools = toolList.length ? await loadToolStates(engagementId, workspaceId, toolList, await getClientFacts(engagementId)) : [];

  const copies: SkillSettingsView["copies"] = {};
  const secretsSet: string[] = [];
  for (const f of fields) {
    if (f.kind === "copy") copies[f.from] = await copyValue(f.from, engagementId, stores.stack, ctx.origin);
    if (f.kind === "secret" && (await hasCredential(engagementId, secretProvider(f)))) secretsSet.push(fieldKey(f));
  }

  return {
    skillId,
    name: WORKER_REGISTRY[skillId].name,
    buyer: stores.engagement.buyer,
    description: WORKER_REGISTRY[skillId].description,
    values,
    usingDefault,
    options,
    mapKeys,
    context,
    tools,
    copies,
    secretsSet,
    facts: factsFor(skillId, stores),
    alert: alertFor(skillId, stores, engagementId),
    setupHref: `/dashboard/engagements/${encodeURIComponent(engagementId)}/bridges/${PRODUCT_ONBOARDING_WORKER_ID[product as ProductId] ?? skillId}`,
    blocked: blockedReason(fields, stores),
  };
}

export type SaveResult = { ok: true; notice?: string } | { ok: false; error: string; field?: string };

/** Sets one value at a nested path of a patch built from `base`. */
function setNested(patch: Obj, top: string, rest: string[], base: unknown, value: unknown) {
  const obj = (patch[top] as Obj | undefined) ?? { ...((base as Obj | undefined) ?? {}) };
  let cur = obj;
  for (let i = 0; i < rest.length - 1; i++) {
    cur[rest[i]] = { ...((cur[rest[i]] as Obj | undefined) ?? {}) };
    cur = cur[rest[i]] as Obj;
  }
  const last = rest[rest.length - 1];
  if (value === null || value === undefined) delete cur[last];
  else cur[last] = value;
  patch[top] = obj;
}

export async function saveSkillSettings(engagementId: string, skillId: WorkerId, raw: Record<string, unknown>, ctx: SettingsContext): Promise<SaveResult> {
  const spec = settingsFor(skillId);
  if (!spec) return { ok: false, error: "This skill has no settings of its own." };
  const stores = await loadStores(engagementId, { coldOpen: spec.fields.some((f) => f.store === "coldOpen"), rep: spec.fields.some((f) => f.store === "rep"), fields: spec.fields });
  if (!stores) return { ok: false, error: "Client not found." };
  const blocked = blockedReason(spec.fields, stores);
  if (blocked) return { ok: false, error: blocked };

  // Fields not sent (hidden ones) are judged with what's stored, so a
  // cross-field check sees the whole picture.
  const current: Record<string, unknown> = {};
  // In the units the form uses (a percent as 8, not 0.08), like the incoming values.
  for (const f of spec.fields) {
    if (isValueless(f) || f.kind === "secret") continue;
    current[fieldKey(f)] = toShown(f, (readPath(storeOf(f, stores), f.path) as SettingValue) ?? defaultValue(f));
  }
  const merged = { ...current, ...raw };
  // A locked field can't be changed through here.
  for (const f of spec.fields) {
    if (f.lockedIf && readPath(stores.stack, f.lockedIf.path) === f.lockedIf.equals) merged[fieldKey(f)] = f.lockedIf.value;
  }
  const cleaned = cleanSettings(spec, merged);
  if ("error" in cleaned) return { ok: false, error: cleaned.error, field: cleaned.field };
  const next = cleaned.values;
  // Both sides in stored units (fractions, not percents). Unset (or an
  // empty list) reads as the default, the way loading shows it.
  const storedNow = (f: SettingField) => {
    const v = readPath(storeOf(f, stores), f.path) as SettingValue | undefined;
    return v === undefined || v === null || (Array.isArray(v) && v.length === 0) ? defaultValue(f) : v;
  };
  const changed = (f: SettingField) => fieldKey(f) in next && JSON.stringify(next[fieldKey(f)] ?? defaultValue(f)) !== JSON.stringify(storedNow(f));

  const stackPatch: Obj = {};
  const coldOpenPatch: Obj = {};
  const repPatch: Obj = {};
  const engagementPatch: Obj = {};
  const secrets: { field: Extract<SettingField, { kind: "secret" }>; value: string }[] = [];

  for (const f of spec.fields) {
    const key = fieldKey(f);
    if (!(key in next)) continue;
    // Only what changed is written; the rest stays exactly as stored.
    if (f.kind !== "secret" && !changed(f)) continue;
    const v = next[key];
    const [top, ...rest] = f.path.split(".");
    if (f.kind === "secret") {
      if (typeof v === "string" && v) secrets.push({ field: f, value: v });
      continue;
    }
    if (f.store === "stack") {
      if (rest.length === 0) stackPatch[top] = storedValue(f, v) ?? undefined;
      else setNested(stackPatch, top, rest, readPath(stores.stack, top), v ?? defaultValue(f));
    } else if (f.store === "fact") {
      continue; // Its own save, below.
    } else if (f.store === "coldOpen") {
      if (f.path.startsWith("sendPlatform.") || f.path === "campaignMap") continue; // Send Connect's own save, below.
      const full = v ?? defaultValue(f) ?? (f.kind === "multi" || f.kind === "list" ? [] : null);
      if (rest.length === 0) coldOpenPatch[top] = full;
      else setNested(coldOpenPatch, top, rest, readPath(stores.coldOpen, top), full);
    } else if (f.store === "rep") {
      repPatch[top] = f.kind === "list" ? (v ?? []) : f.path === "crisisThresholdOverride" ? storedValue(f, v) : v;
    } else if (f.store === "engagement") {
      if (rest.length === 0) engagementPatch[top] = f.kind === "list" ? (v ?? []) : v ?? defaultValue(f);
      else setNested(engagementPatch, top, rest, readPath(stores.engagement, top), v ?? defaultValue(f));
    }
  }

  // ── Checks that need this client's data ──
  const slackChannel = next.slack_channel_id;
  if (typeof slackChannel === "string" && slackChannel) {
    const channels = ((await getClientFact(engagementId, "slackChannels"))?.value as { id: string; name: string }[] | undefined) ?? [];
    const channel = channels.find((c) => c.id === slackChannel);
    if (!channel) return { ok: false, error: "That Slack channel isn't in the connected workspace.", field: "slack_channel_id" };
    stackPatch.slack_channel_name = channel.name.replace(/^#/, "");
  } else if ("slack_channel_id" in next) {
    stackPatch.slack_channel_name = undefined;
  }
  const wantsSlack = next.brief_landing_destination === "slack" || next.audit_output_format === "slack";
  if (wantsSlack) {
    const webhook = (next.slack_webhook_url ?? stores.stack?.slack_webhook_url) as string | null | undefined;
    const channel = (next.slack_channel_id ?? stores.stack?.slack_channel_id) as string | null | undefined;
    if (!webhook && !(channel && (await hasCredential(engagementId, "slack")))) {
      return { ok: false, error: "Connect Slack and pick a channel, or paste an incoming-webhook address.", field: "slack_channel_id" };
    }
  }
  const videoField = spec.fields.find((f) => f.path === "heroVideoUrl");
  if (videoField && changed(videoField) && typeof next.heroVideoUrl === "string" && next.heroVideoUrl && !sanitizeVideoEmbedUrl(next.heroVideoUrl)) {
    return { ok: false, error: "That video link can't be shown on the page. Use a YouTube, Vimeo or Loom share link.", field: "heroVideoUrl" };
  }
  const bridgeField = spec.fields.find((f) => f.path === "whop_bridge_destination_url");
  if (bridgeField && changed(bridgeField) && typeof next.whop_bridge_destination_url === "string" && next.whop_bridge_destination_url) {
    try {
      stackPatch.whop_bridge_destination_url = (await assertPublicUrl(next.whop_bridge_destination_url, { httpsOnly: true })).toString();
    } catch (err) {
      return { ok: false, error: `Use a public https:// address. ${err instanceof UnsafeUrlError ? err.message : ""}`.trim(), field: "whop_bridge_destination_url" };
    }
  }

  // How bookings come in: the same switch as the sync-mode route (a signing
  // secret made for webhooks, the watermark rewound for polling).
  if ("webhook_receiver_mode" in stackPatch || "webhook_poll_interval_minutes" in stackPatch) {
    if (!stores.stack?.booking_platform) return { ok: false, error: "Pick the booking tool first.", field: "webhook_receiver_mode" };
    const mode = (next.webhook_receiver_mode ?? stores.stack.webhook_receiver_mode) as "webhook" | "polling" | undefined;
    const interval = typeof next.webhook_poll_interval_minutes === "number" ? next.webhook_poll_interval_minutes : undefined;
    delete stackPatch.webhook_receiver_mode;
    delete stackPatch.webhook_poll_interval_minutes;
    const { patch } = await bookingSyncPatch(engagementId, stores.stack, { mode: "webhook_receiver_mode" in next && mode ? mode : undefined, pollIntervalMinutes: interval });
    Object.assign(stackPatch, patch);
  }

  // The sales call: recorded as the confirmed choice, and its id put where
  // the booking tool's code reads it.
  const salesField = spec.fields.find((f) => f.store === "fact" && f.path === "salesCallEventType");
  const salesChanged = Boolean(salesField && changed(salesField) && typeof next.salesCallEventType === "string" && next.salesCallEventType);
  if (salesChanged) {
    const known = ((await getClientFact(engagementId, "bookingEventTypes"))?.value as { types?: { id: string }[] } | undefined)?.types ?? [];
    if (!known.some((t) => String(t.id) === next.salesCallEventType)) return { ok: false, error: "That event isn't in the booking tool's list.", field: "salesCallEventType" };
  }

  // Cold Open's sending tool and campaigns: Send Connect's own save, which
  // checks the key is connected and every campaign's customer type exists.
  const sendField = spec.fields.find((f) => f.path === "sendPlatform.platform");
  const baseField = spec.fields.find((f) => f.path === "sendPlatform.baseUrl");
  if (sendField && (changed(sendField) || (baseField && changed(baseField)) || spec.fields.some((f) => f.path === "campaignMap" && changed(f)))) {
    const platform = (next["sendPlatform.platform"] ?? stores.coldOpen?.sendPlatform?.platform) as ColdOpenSendPlatformId | null;
    if (!platform) return { ok: false, error: "Pick the sending tool.", field: "sendPlatform.platform" };
    const samePlatform = platform === stores.coldOpen?.sendPlatform?.platform;
    // Campaigns picked in another tool mean nothing in this one.
    const mapField = spec.fields.find((f) => f.path === "campaignMap");
    const campaignMap = ((mapField && changed(mapField) ? next.campaignMap : samePlatform ? stores.coldOpen?.campaignMap : null) as Record<string, string> | null | undefined) ?? {};
    if (!Object.keys(campaignMap).length) {
      if (!spec.fields.some((f) => f.path === "campaignMap")) return { ok: false, error: "A new sending tool needs its campaigns picked. Do that in Send Connect's settings.", field: "sendPlatform.platform" };
      return { ok: false, error: "Pick a campaign for at least one customer type.", field: "campaignMap" };
    }
    const result = await saveSendConnect(engagementId, {
      platform,
      baseUrl: baseField && changed(baseField) ? ((next["sendPlatform.baseUrl"] as string | null) ?? undefined) : samePlatform ? stores.coldOpen?.sendPlatform?.baseUrl : undefined,
      campaignMap,
      autoPushIcps: (coldOpenPatch.autoPushIcps as string[] | undefined) ?? stores.coldOpen?.autoPushIcps ?? [],
    });
    if ("error" in result) return { ok: false, error: result.error, field: "sendPlatform.platform" };
  }

  if (skillId === "leak-map") {
    // The two schedules share the hour and the time zone, and are read in full.
    const weekly = { dayOfWeek: 1, hourLocal: 9, ...((readPath(stores.stack, "weekly_summary_schedule") as Obj) ?? {}), ...((stackPatch.weekly_summary_schedule as Obj) ?? {}) } as Obj;
    weekly.timezone = (weekly.timezone as string | undefined) || stores.stack?.timezone || "UTC";
    const monthly = { dayOfMonth: 1, ...((readPath(stores.stack, "monthly_deep_dive_schedule") as Obj) ?? {}), ...((stackPatch.monthly_deep_dive_schedule as Obj) ?? {}), hourLocal: weekly.hourLocal, timezone: weekly.timezone };
    stackPatch.weekly_summary_schedule = weekly;
    stackPatch.monthly_deep_dive_schedule = monthly;
  }
  if (skillId === "daily-send") {
    const d = coldOpenPatch.dailySendSettings as Obj | undefined;
    if (d) coldOpenPatch.dailySendSettings = { volume: 25, localHour: 9, copyMode: "generate", liveSendEnabled: false, ...d };
  }

  // ── Write ──
  if (Object.keys(stackPatch).length) await patchEngagementStack(engagementId, stackPatch as Partial<EngagementStack>);
  if (Object.keys(coldOpenPatch).length) await upsertColdOpenConfig(engagementId, coldOpenPatch as Partial<ColdOpenConfigRow>);
  if (Object.keys(repPatch).length) await db.update(repIdentityGraphs).set({ ...repPatch, updatedAt: new Date() }).where(eq(repIdentityGraphs.engagementId, engagementId));
  if (Object.keys(engagementPatch).length) await db.update(engagements).set({ ...engagementPatch, updatedAt: new Date() }).where(eq(engagements.engagementId, engagementId));
  for (const { field, value } of secrets) {
    if ("signing" in field.secret) await setSigningSecret(engagementId, field.secret.signing, value);
    else await storeCredential(engagementId, field.secret.credential, `secrets://${engagementId}/${field.secret.credential}`, value);
  }

  // ── What the change needs done ──
  const notices: string[] = [];
  const packField = spec.fields.find((f) => f.path === "notification_pack_selections");
  if (packField && changed(packField)) {
    const before = new Set(stores.stack?.notification_pack_selections ?? []);
    const after = new Set((next.notification_pack_selections as string[] | null) ?? []);
    for (const id of after) if (!before.has(id)) await activateNotificationPackAlert(engagementId, id);
    for (const id of before) if (!after.has(id)) await deactivateNotificationPackAlert(engagementId, id);
  }
  if (salesChanged) await recordSalesCallChoice(engagementId, next.salesCallEventType as string);
  const chosen = spec.fields.filter((f) => f.kind === "tool" && f.store === "stack").flatMap((f) => [next[fieldKey(f)]].flat()) as (string | null | undefined)[];
  if (chosen.length) await syncMarkersForChosenPlatforms(engagementId, chosen);

  const twilioChanged = spec.fields.some((f) => f.path.startsWith("sms_platform_meta.") && changed(f)) || (next.sms_platform === "twilio" && stores.stack?.sms_platform !== "twilio");
  if (twilioChanged && (next.sms_platform ?? stores.stack?.sms_platform) === "twilio" && (await hasCredential(engagementId, "twilio"))) {
    afterResponse(() =>
      resolveCredential(engagementId, "twilio")
        .then((token) => harvestTwilioA2PStatus(engagementId, token))
        .catch((err) => console.warn(`[skill-settings] Twilio A2P check failed for ${engagementId}:`, err))
    );
  }

  const coreChanged = salesChanged || spec.fields.some((f) => (SHOWTIME_CORE_TOOLS as readonly string[]).includes(f.path) && changed(f));
  const pageChanged = spec.fields.some((f) => f.store === "engagement" && ["confirmationPageTemplate", "heroVideoUrl", "offerDetails.hybrid_mode_enabled", "confirmationPageAnimationsEnabled", "topCallQuestions"].includes(f.path) && changed(f));
  if (coreChanged) {
    await dispatchSkillRun(engagementId, "pin-down", stores.engagement.buyer);
    notices.push("Setting Showtime up again with the new tools.");
  } else if (pageChanged) {
    const rebuilt = await triggerConfirmationPageRebuildForEngagement(ctx.whopUserId, ctx.workspaceId, engagementId);
    notices.push(rebuilt.ok ? "Rebuilding the page with these changes." : `Saved, but the page couldn't be rebuilt: ${rebuilt.error}`);
  }

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
        notices.push(`Saved, but Whop didn't accept the webhook update: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }
  return notices.length ? { ok: true, notice: notices.join(" ") } : { ok: true };
}
