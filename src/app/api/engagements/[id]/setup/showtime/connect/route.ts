import { NextResponse } from "next/server";
import { afterResponse } from "@/lib/after-response";
import {
  hasCredential,
  linkEngagementToVault,
  linkedVaultId,
  listEngagementsUsingVaultCredential,
  resolveCredential,
  storeVaultCredential,
  syncStackCredentialMarkers,
  unlinkEngagementFromVault,
  vaultCredentialBelongsToTenant,
  resolveVaultCredentialValue,
  listVaultCredentials,
} from "@/lib/credentials";
import { harvestAccountMetadata, harvestGHLLocation, isHarvestableProvider } from "@/lib/account-harvest";
import { upsertClientFact } from "@/lib/client-facts";
import {
  checkGhlLocation,
  ghlLocationFromSharedToken,
  ghlLocationIdOf,
  ghlLocationPatch,
  isGhlProvider,
  loadStack,
  otherGhlProvider,
  parseGhlLocationId,
} from "@/lib/ghl-location";
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
import { activeCampaignApiBase, ACTIVECAMPAIGN_URL_HINT } from "@/lib/outbound-urls";

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
 *   { provider, value, <extra>? }   paste a key: saved to the workspace's
 *       vault (so every other client can reuse it) and linked here
 *   { provider, vaultId, <extra>? } use a connection already saved
 *   { provider, <extra> }           add the tool's extra value to a
 *       connection this client already has (after signing in, say)
 *   { provider, disconnect: true }  stop using it for this client
 * where <extra> is the tool's extraField: activecampaignBaseUrl, or
 * ghlLocationId (the bare ID or a GoHighLevel address containing it).
 *
 * GoHighLevel's Location ID is checked against the token before anything is
 * saved, and when it isn't typed, the one this client or another client on
 * the same saved token already has is used. Once known it's saved where
 * every skill reads it (ghl-location.ts), and the token is linked for both
 * GoHighLevel sides, booking and email, so it's never asked twice. The
 * answer says `needs: "ghlLocationId"` while it's still missing.
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
    ghlLocationId?: unknown;
  };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const tool = findSetupTool(provider);
  if (!tool || !tool.needsKey) {
    return NextResponse.json({ error: "That tool can't be connected here." }, { status: 400 });
  }
  const ghl = isGhlProvider(provider);
  const acBaseUrlRaw = typeof body.activecampaignBaseUrl === "string" ? body.activecampaignBaseUrl.trim() : "";
  const acBaseUrl = acBaseUrlRaw ? activeCampaignApiBase(acBaseUrlRaw) : null;
  if (acBaseUrlRaw && !acBaseUrl) return NextResponse.json({ error: ACTIVECAMPAIGN_URL_HINT }, { status: 400 });
  const typedLocationRaw = ghl && typeof body.ghlLocationId === "string" ? body.ghlLocationId.trim() : "";
  const typedLocation = parseGhlLocationId(typedLocationRaw);
  if (typedLocationRaw && !typedLocation) {
    return NextResponse.json(
      { error: "That doesn't look like a GoHighLevel Location ID. Paste the ID, or the address of any page inside the sub-account." },
      { status: 400 }
    );
  }

  try {
    if (body.disconnect === true) {
      await unlinkEngagementFromVault(id, provider);
      await syncStackCredentialMarkers(id, provider, false);
      return NextResponse.json({ ok: true });
    }

    // What's being connected: a pasted key, a saved connection, or (extra
    // only) the connection this client already has.
    let mode: "paste" | "saved" | "existing";
    let vaultId: string | null;
    let value: string;
    let label: string;

    if (typeof body.vaultId === "string" && body.vaultId) {
      if (!(await vaultCredentialBelongsToTenant(body.vaultId, access.workspaceId))) {
        return NextResponse.json({ error: "That saved connection isn't in this workspace." }, { status: 404 });
      }
      mode = "saved";
      vaultId = body.vaultId;
      value = await resolveVaultCredentialValue(vaultId);
      label = (await listVaultCredentials(access.workspaceId, provider)).find((v) => v.id === vaultId)?.label ?? "";
    } else if (typeof body.value === "string" && body.value.trim()) {
      mode = "paste";
      vaultId = null;
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
    } else if ((typedLocation || acBaseUrl) && (await hasCredential(id, provider))) {
      mode = "existing";
      vaultId = await linkedVaultId(id, provider);
      value = await resolveCredential(id, provider);
      label = vaultId ? ((await listVaultCredentials(access.workspaceId, provider)).find((v) => v.id === vaultId)?.label ?? "") : "";
    } else {
      return NextResponse.json({ error: "Paste a key, or pick a saved connection." }, { status: 400 });
    }

    // GoHighLevel: settle the Location ID before saving anything, so a key
    // and an ID from two different sub-accounts are caught here.
    let location: { id: string; name: string } | null = null;
    if (ghl) {
      const stack = await loadStack(id);
      const others = vaultId ? (await listEngagementsUsingVaultCredential(vaultId)).filter((e) => e !== id) : [];
      const candidate = typedLocation ?? ghlLocationIdOf(stack) ?? (await ghlLocationFromSharedToken(others));
      if (candidate) {
        const checked = await checkGhlLocation(value, candidate);
        if (checked.ok) {
          location = { id: checked.id, name: checked.name };
        } else if (typedLocation) {
          return NextResponse.json({ error: ghlLocationError(checked.status) }, { status: 400 });
        } else {
          console.warn(`[setup/showtime/connect] known GoHighLevel location ${candidate} didn't open with this key for ${id} [${checked.status}]`);
        }
      }
    }

    if (mode === "paste") {
      vaultId = await storeVaultCredential(
        access.workspaceId,
        access.whopUserId,
        provider,
        label,
        `secrets://vault/${access.workspaceId}/${provider}/${Date.now()}`,
        value
      );
    }
    if (mode !== "existing" && vaultId) {
      await linkEngagementToVault(id, provider, vaultId);
      await syncStackCredentialMarkers(id, provider, true);
    }

    if (provider === "activecampaign" && acBaseUrl) {
      await patchEngagementStack(id, { activecampaign_base_url: acBaseUrl });
    }

    if (ghl) {
      // One GoHighLevel token covers booking and email/CRM: link the other
      // side too, unless this client already has its own there.
      const other = otherGhlProvider(provider);
      if (other && vaultId && !(await hasCredential(id, other))) {
        await linkEngagementToVault(id, other, vaultId);
        await syncStackCredentialMarkers(id, other, true);
      }
      if (location) {
        const stack = await loadStack(id);
        const previous = ghlLocationIdOf(stack);
        const patch = ghlLocationPatch(stack, location.id);
        // A different sub-account: ids picked in the old one mean nothing here.
        if (previous && previous !== location.id) {
          if (stack.booking_platform === "ghl_calendar" && patch.booking_platform_meta) delete patch.booking_platform_meta.calendar_id;
          if (stack.email_platform === "ghl") Object.assign(patch, { target_workflow_id: undefined, recovery_workflow_id: undefined });
        }
        await patchEngagementStack(id, patch);
        await upsertClientFact(id, "ghlLocation", location, {
          source: "account",
          sourceDetail: provider,
          evidence: `GoHighLevel confirmed this key opens "${location.name}".`,
        });
      }
    }

    // The account pull writes what the account knows (timezone, name,
    // website, which platform). Waited on, within a bound, so the review
    // reflects it on the next read. GoHighLevel's needs the location.
    const harvest = (
      ghl
        ? location
          ? harvestGHLLocation(id, value, location.id)
          : Promise.resolve()
        : isHarvestableProvider(provider)
          ? harvestAccountMetadata(id, provider, value)
          : harvestPasteKeyMetadata(id, provider, value)
    ).catch((err) => console.error(`[setup/showtime/connect] harvest failed for ${provider}:`, err));
    await Promise.race([harvest, new Promise((resolve) => setTimeout(resolve, HARVEST_WAIT_MS))]);
    // A harvest still going when the wait ends keeps running after the
    // response instead of being frozen with the function.
    afterResponse(() => harvest);
    // Then the deep read of what the account has done (bookings, deals,
    // campaigns), after the answer is sent.
    afterResponse(() => deepPullAfterConnect(id, provider, value));

    const domain = await getPrimaryDomainForEngagement(id);
    const accountCheck = await checkAccountMatches(id, domain, provider, label || null);

    return NextResponse.json({ ok: true, vaultId, accountCheck, location, ...(ghl && !location ? { needs: "ghlLocationId" } : {}) });
  } catch (err) {
    console.error(`[setup/showtime/connect] ${id} ${provider}:`, err);
    return NextResponse.json({ error: `Couldn't connect ${tool.label}. Try again.` }, { status: 500 });
  }
}

function ghlLocationError(status: number): string {
  if (status === 401 || status === 403) {
    return "This key can't open that location. Make the Private Integration inside the same sub-account as the Location ID, then try again.";
  }
  if (status === 400 || status === 404 || status === 422) {
    return "GoHighLevel doesn't know that Location ID. Copy it from Settings → Business Profile in the sub-account.";
  }
  return "GoHighLevel didn't answer when we checked the Location ID. Try again in a moment.";
}
