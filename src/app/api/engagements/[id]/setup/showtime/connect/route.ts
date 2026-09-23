import { NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import {
  linkEngagementToVault,
  storeVaultCredential,
  syncStackCredentialMarkers,
  unlinkEngagementFromVault,
  vaultCredentialBelongsToTenant,
  resolveVaultCredentialValue,
  listVaultCredentials,
} from "@/lib/credentials";
import { harvestAccountMetadata, isHarvestableProvider } from "@/lib/account-harvest";
import { harvestPasteKeyMetadata } from "@/lib/paste-key-harvest";
import { deepPullAfterConnect } from "@/lib/account-intel";
import { patchEngagementStack } from "@/lib/engagement-stack";
import { getPrimaryDomainForEngagement } from "@/lib/client-profile";
import { CalendlyClient, CalComClient } from "@/lib/platforms/booking";
import { MailchimpClient, ConvertKitClient, SMTPClient, parseSmtpCredential } from "@/lib/platforms/email";
import { findSetupTool } from "@/lib/showtime-setup/catalog";
import { checkInstantlyCredential, checkLemlistCredential, checkReplyIoCredential, checkSmartleadCredential } from "@/features/cold-open/server/credential-check";
import { checkAccountMatches } from "@/lib/showtime-setup/jev-setup";
import { authorizeShowtimeSetup } from "../access";

export const runtime = "nodejs";
export const revalidate = 0;
// The deep account pull runs after the answer, inside this budget.
export const maxDuration = 180;

// Keys that can be checked with one cheap call before saving, so a typo
// fails here instead of on the first real run. Same checks the "Test
// connection" route runs (api/credentials/test), limited to the ones that
// need nothing but the key itself.
const KEY_CHECKS: Record<string, (value: string) => Promise<void>> = {
  calendly: (v) => new CalendlyClient(v).checkCredentialHealth(),
  cal_com: (v) => new CalComClient(v).checkCredentialHealth(),
  mailchimp: (v) => new MailchimpClient(v).checkCredentialHealth(),
  convertkit: (v) => new ConvertKitClient(v).checkCredentialHealth(),
  smtp: (v) => new SMTPClient(parseSmtpCredential(v)).checkCredentialHealth(),
  cold_open_instantly: checkInstantlyCredential,
  cold_open_smartlead: checkSmartleadCredential,
  cold_open_lemlist: checkLemlistCredential,
  cold_open_reply_io: checkReplyIoCredential,
};

const HARVEST_WAIT_MS = 15_000;

/**
 * Connects one Showtime tool for this client from the setup screen.
 *
 * Body, one of:
 *   { provider, value, activecampaignBaseUrl? }  paste a key: saved to the
 *       workspace's vault (so every other client can reuse it) and linked here
 *   { provider, vaultId }                        use a connection already saved
 *   { provider, disconnect: true }               stop using it for this client
 *
 * Either connect path runs the provider's account pull before answering
 * (bounded, so a slow vendor can't hang the screen), then Jev's "is this the
 * same business?" check, so the screen can show both right away.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorizeShowtimeSetup(id);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as {
    provider?: unknown;
    value?: unknown;
    vaultId?: unknown;
    disconnect?: unknown;
    activecampaignBaseUrl?: unknown;
  };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const tool = findSetupTool(provider);
  if (!tool || !tool.needsKey) {
    return NextResponse.json({ error: "That tool can't be connected here." }, { status: 400 });
  }

  try {
    if (body.disconnect === true) {
      await unlinkEngagementFromVault(id, provider);
      await syncStackCredentialMarkers(id, provider, false);
      return NextResponse.json({ ok: true });
    }

    let vaultId: string;
    let value: string;
    let label: string;

    if (typeof body.vaultId === "string" && body.vaultId) {
      if (!(await vaultCredentialBelongsToTenant(body.vaultId, access.workspaceId))) {
        return NextResponse.json({ error: "That saved connection isn't in this workspace." }, { status: 404 });
      }
      vaultId = body.vaultId;
      value = await resolveVaultCredentialValue(vaultId);
      label = (await listVaultCredentials(access.workspaceId, provider)).find((v) => v.id === vaultId)?.label ?? "";
    } else if (typeof body.value === "string" && body.value.trim()) {
      value = body.value.trim();
      const check = KEY_CHECKS[provider];
      if (check) {
        try {
          await check(value);
        } catch (err) {
          return NextResponse.json(
            { error: `${tool.label} didn't accept that key. ${err instanceof Error ? err.message.slice(0, 160) : ""}`.trim() },
            { status: 400 }
          );
        }
      }
      label = `${access.buyer} · ${tool.label}`;
      vaultId = await storeVaultCredential(
        access.workspaceId,
        access.whopUserId,
        provider,
        label,
        `secrets://vault/${access.workspaceId}/${provider}/${Date.now()}`,
        value
      );
    } else {
      return NextResponse.json({ error: "Paste a key, or pick a saved connection." }, { status: 400 });
    }

    await linkEngagementToVault(id, provider, vaultId);
    await syncStackCredentialMarkers(id, provider, true);

    if (provider === "activecampaign" && typeof body.activecampaignBaseUrl === "string" && body.activecampaignBaseUrl.trim()) {
      await patchEngagementStack(id, { activecampaign_base_url: body.activecampaignBaseUrl.trim().replace(/\/+$/, "") });
    }

    // The account pull writes what the account knows (timezone, name,
    // website, which platform). Waited on, within a bound, so the review
    // reflects it on the next read.
    const harvest = (isHarvestableProvider(provider) ? harvestAccountMetadata(id, provider, value) : harvestPasteKeyMetadata(id, provider, value)).catch(
      (err) => console.error(`[setup/showtime/connect] harvest failed for ${provider}:`, err)
    );
    await Promise.race([harvest, new Promise((resolve) => setTimeout(resolve, HARVEST_WAIT_MS))]);
    // Then the deep read of what the account has done (bookings, deals,
    // campaigns), after the answer is sent.
    afterResponse(() => deepPullAfterConnect(id, provider, value));

    const domain = await getPrimaryDomainForEngagement(id);
    const accountCheck = await checkAccountMatches(id, domain, provider, label || null);

    return NextResponse.json({ ok: true, vaultId, accountCheck });
  } catch (err) {
    console.error(`[setup/showtime/connect] ${id} ${provider}:`, err);
    return NextResponse.json({ error: `Couldn't connect ${tool.label}. Try again.` }, { status: 500 });
  }
}
