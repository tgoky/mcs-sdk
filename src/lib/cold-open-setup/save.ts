// src/lib/cold-open-setup/save.ts
//
// Saves the reviewed Cold Open setup through each skill's own save path,
// in the order their checks need (ICPs before voice and campaigns), so
// every rule the separate pages enforce still holds. Live sending is
// never changed here: it keeps whatever was saved (off for a new client).

import type { ColdOpenIcp, ColdOpenSendPlatformId, ColdOpenSizingBound } from "@/models/schema";
import { getColdOpenConfig } from "@/features/cold-open/server/config";
import { saveIcpLockIntake } from "@/features/cold-open/server/icp-lock";
import { saveVoiceCapture } from "@/features/cold-open/server/voice-capture";
import { saveSendConnect } from "@/features/cold-open/server/send-connect";
import { saveDailySendSettings } from "@/features/cold-open/server/daily-send";
import { DEFAULT_MIN_VARIANTS } from "@/features/cold-open/server/body-variants";
import { COLD_OPEN_SKILL_IDS } from "@/lib/cold-open-skill-manifest";
import { SEND_PLATFORMS } from "./state";
import type { Touchset } from "./analyze";

export interface ColdOpenSetupInput {
  product: { name: string; url: string; price: string; valueProp: string };
  icps: { slug: string; label: string; weight: number; teamSizeMin: number | null; teamSizeMax: number | null; disqualifyIf: string[] }[];
  voice: { greeting: string; signOff: string; tone: string };
  subjects: string[];
  touchsets: Touchset[];
  platform: ColdOpenSendPlatformId | null;
  campaignMap: Record<string, string>;
  daily: { volume: number; localHour: number; timezone: string | null; copyMode: "generate" | "upload" };
  skills: string[];
}

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const strings = (v: unknown, max = 50) => (Array.isArray(v) ? v.map((x) => str(x, 500)).filter(Boolean).slice(0, max) : []);

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "icp";
}

/** Reads the request body into a clean input, or says what's wrong. */
export function parseColdOpenSetup(body: unknown): ColdOpenSetupInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body." };
  const b = body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = b.product ?? {};
  const icps: ColdOpenSetupInput["icps"] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(b.icps) ? b.icps.slice(0, 20) : []) {
    const label = str(raw?.label, 200);
    if (!label) continue;
    let slug = str(raw?.slug, 60) || slugify(label);
    for (let n = 2; seen.has(slug); n++) slug = `${slugify(label)}-${n}`;
    seen.add(slug);
    const min = num(raw?.teamSizeMin);
    const max = num(raw?.teamSizeMax);
    if (min && max && min > max) return { error: `"${label}": the smallest team size is bigger than the largest.` };
    icps.push({ slug, label, weight: Math.max(0, Number(raw?.weight) || 0), teamSizeMin: min, teamSizeMax: max, disqualifyIf: strings(raw?.disqualifyIf) });
  }
  // Weights as shares of the total; equal when none were given.
  const total = icps.reduce((a, i) => a + i.weight, 0);
  for (const i of icps) i.weight = total > 0 ? i.weight / total : 1 / icps.length;

  const platform = SEND_PLATFORMS.includes(b.platform) ? (b.platform as ColdOpenSendPlatformId) : null;
  const campaignMap: Record<string, string> = {};
  for (const [slug, id] of Object.entries(b.campaignMap ?? {})) if (seen.has(slug) && str(id, 200)) campaignMap[slug] = str(id, 200);

  const d = b.daily ?? {};
  const touchsets: Touchset[] = (Array.isArray(b.touchsets) ? b.touchsets.slice(0, 20) : [])
    .map((t: Record<string, unknown>) => ({ subject: str(t?.subject, 300), body1: str(t?.body1, 20000), body2: str(t?.body2, 20000), body3: str(t?.body3, 20000) }))
    .filter((t: Touchset) => t.subject && t.body1);

  return {
    product: { name: str(p.name, 200), url: str(p.url, 500), price: str(p.price, 200), valueProp: str(p.valueProp, 500) },
    icps,
    voice: { greeting: str(b.voice?.greeting, 200), signOff: str(b.voice?.signOff, 500), tone: str(b.voice?.tone, 500) },
    subjects: strings(b.subjects, 26),
    touchsets,
    platform,
    campaignMap,
    daily: {
      volume: Number(d.volume),
      localHour: Number(d.localHour),
      timezone: str(d.timezone, 100) || null,
      copyMode: d.copyMode === "upload" ? "upload" : "generate",
    },
    skills: strings(b.skills, COLD_OPEN_SKILL_IDS.length),
  };
}

export type SaveResult = { ok: true; warnings: string[]; sendingSaved: boolean } | { error: string; step: string };

export async function saveColdOpenSetup(engagementId: string, input: ColdOpenSetupInput): Promise<SaveResult> {
  // Checked before anything is written.
  if (input.daily.copyMode === "upload" && input.touchsets.length < DEFAULT_MIN_VARIANTS) {
    return { error: `Sending your own emails needs at least ${DEFAULT_MIN_VARIANTS} of them, so the same email doesn't go to many similar people.`, step: "Your emails" };
  }

  const current = await getColdOpenConfig(engagementId);
  const slugs = input.icps.map((i) => i.slug);
  const sizingBounds: Record<string, ColdOpenSizingBound> = {};
  for (const i of input.icps) {
    sizingBounds[i.slug] = { ...(i.teamSizeMin ? { teamSizeMin: i.teamSizeMin } : {}), ...(i.teamSizeMax ? { teamSizeMax: i.teamSizeMax } : {}), disqualifyIf: i.disqualifyIf };
  }
  const icps: ColdOpenIcp[] = input.icps.map((i) => {
    const before = current?.icps.find((c) => c.slug === i.slug);
    return { slug: i.slug, label: i.label, weight: i.weight, ...(before?.tracking ? { tracking: before.tracking } : {}) };
  });

  const icp = await saveIcpLockIntake(engagementId, {
    productName: input.product.name,
    productUrl: input.product.url,
    productPrice: input.product.price,
    productValueProp: input.product.valueProp,
    // One product per setup; a saved multi-product split stays as it was.
    productAllocation: current && Object.keys(current.productAllocation ?? {}).length > 1 ? current.productAllocation : { [input.product.name || "product"]: 1 },
    icps,
    sizingBounds,
    reviewRequiredIcps: (current?.reviewRequiredIcps ?? []).filter((s) => slugs.includes(s)),
  });
  if ("error" in icp) return { error: icp.error, step: "Who you sell to" };

  // Imported sequences apply to every ICP; ICP-specific pools stay as saved.
  const pools = { ...(current?.bodyVariantPools ?? {}) };
  for (const key of Object.keys(pools)) if (key !== "default" && !slugs.includes(key)) delete pools[key];
  if (input.touchsets.length) pools.default = input.touchsets;
  else delete pools.default;

  const voice = await saveVoiceCapture(engagementId, {
    ...input.voice,
    sourceDomain: current?.voiceProfile?.sourceDomain,
    subjectVariants: input.subjects,
    bodyVariantPools: pools,
  });
  if ("error" in voice) return { error: voice.error, step: "How you write" };

  let sendingSaved = false;
  if (input.platform && Object.keys(input.campaignMap).length) {
    const send = await saveSendConnect(engagementId, {
      platform: input.platform,
      baseUrl: current?.sendPlatform?.platform === input.platform ? current.sendPlatform.baseUrl : undefined,
      campaignMap: input.campaignMap,
      autoPushIcps: (current?.autoPushIcps ?? []).filter((s) => slugs.includes(s)),
    });
    if ("error" in send) return { error: send.error, step: "Where it sends" };
    sendingSaved = true;
  }

  const daily = await saveDailySendSettings(engagementId, {
    volume: input.daily.volume,
    localHour: input.daily.localHour,
    timezone: input.daily.timezone ?? undefined,
    copyMode: input.daily.copyMode,
    liveSendEnabled: current?.dailySendSettings?.liveSendEnabled ?? false,
  });
  if ("error" in daily) return { error: daily.error, step: "Daily sending" };

  return { ok: true, warnings: voice.warnings, sendingSaved };
}
