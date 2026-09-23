"use client";

// src/components/platform-logo.tsx
//
// A platform's brand mark, shared by Settings → Apps and the product setup
// screens so a tool looks the same everywhere it appears. Moved here from
// apps-page-client.tsx unchanged apart from a few more hosting platforms.

import { useState } from "react";
import { Globe, Mail } from "lucide-react";

// Real vector brand marks from Simple Icons (MIT-licensed, cdn.jsdelivr.net)
// — true alpha transparency, no baked-in white sticker square around the
// mark the way several of the local PNGs had, and crisp at any size. Only
// listed where the slug is confirmed to exist AND is actually the right
// brand (simple-icons' "apollo" slug is Apollo GraphQL, not Apollo.io the
// prospecting tool — deliberately left off rather than show the wrong
// logo). Everything else falls back to the local PNG, then the plain Mail
// glyph — both already-established, honest fallbacks, never a guess.
const SIMPLE_ICON_SLUGS: Record<string, string> = {
  calendly: "calendly",
  ghl_calendar: "gohighlevel",
  ghl: "gohighlevel",
  klaviyo: "klaviyo",
  hubspot: "hubspot",
  activecampaign: "activecampaign",
  mailchimp: "mailchimp",
  convertkit: "kit",
  cold_open_apify: "apify",
  wistia: "wistia",
  youtube_analytics: "youtube",
  webflow: "webflow",
  wordpress: "wordpress",
  nextjs_vercel: "vercel",
  twilio: "twilio",
  google_sheets: "googlesheets",
};

// Fixes the real bug: the connections page's <img src={`/logos/${provider}.png`}>
// silently fell back to a generic mail icon for cal_com and convertkit because
// the actual files on disk are cal.png and kit.png. ghl_calendar and smtp have
// no logo asset at all yet — those two still fall back, which is honest rather
// than guessing at a filename that doesn't exist.
const LOGO_FILENAME_OVERRIDES: Record<string, string> = {
  cal_com: "cal",
  convertkit: "kit",
};

// Every provider, not only the ones Simple Icons skips — unavatar is the
// universal safety net now, tried for anyone whose SIMPLE_ICON_SLUGS entry
// is missing OR whose verified one fails to load (a jsdelivr hiccup, say),
// before ever dropping to a local PNG. Matched to its real company domain
// instead of a guessed icon-set slug. Resolved via
// unavatar.io rather than hitting Clearbit's logo API directly — unavatar
// is an aggregator, not a single source: for a given domain it tries
// several logo sources itself (Clearbit among them, plus Google favicons,
// DuckDuckGo, etc.) server-side and returns whichever one actually hits,
// so this one lookup already carries its own fallback chain instead of
// betting everything on Clearbit alone staying up. `fallback=false` asks
// it to fail properly (no image) rather than its own default generated
// placeholder avatar — a placeholder would silently short-circuit the
// onError chain below and show a generic gray glyph instead of correctly
// falling through to the local PNG / plain Mail icon. Loads in the
// VIEWER's browser, not this sandbox, so there was never a reason this
// sandbox's own blocked network access should have stopped it from being
// wired up — only from being verified ahead of time. If a given domain
// isn't found (or unavatar itself is ever unreachable), the existing
// onError chain falls through to the local PNG / plain icon exactly as it
// already did — nothing regresses either way.
const LOGO_DOMAINS: Record<string, string> = {
  calendly: "calendly.com",
  cal_com: "cal.com",
  ghl_calendar: "gohighlevel.com",
  ghl: "gohighlevel.com",
  oncehub: "oncehub.com",
  klaviyo: "klaviyo.com",
  hubspot: "hubspot.com",
  activecampaign: "activecampaign.com",
  mailchimp: "mailchimp.com",
  convertkit: "convertkit.com",
  cold_open_instantly: "instantly.ai",
  cold_open_smartlead: "smartlead.ai",
  cold_open_lemlist: "lemlist.com",
  cold_open_reply_io: "reply.io",
  cold_open_apify: "apify.com",
  recall_ai: "recall.ai",
  apollo: "apollo.io",
  pdl: "peopledatalabs.com",
  vidalytics: "vidalytics.com",
  wistia: "wistia.com",
  youtube_analytics: "youtube.com",
  webflow: "webflow.com",
  wordpress: "wordpress.org",
  nextjs_vercel: "vercel.com",
  lovable: "lovable.dev",
  // smtp has no company/domain of its own — stays on the local PNG / plain
  // icon fallback, which is the honest outcome for a protocol, not a brand.
};

// No boxed/tinted background behind the mark — a marketplace listing's
// logo sits directly on the card, not inside its own little tile, and
// wrapping it in a `--surface-2` square is what was shrinking every logo
// down to fit a fixed box. Rendered at its natural size with just
// object-contain so non-square marks (wordmarks like Klaviyo/Mailchimp)
// don't get squashed. Four honest fallback tiers in order — verified
// vector mark, then domain-resolved logo, then the local PNG, then the
// plain icon — never a 404 glyph or a fabricated logo.
// Choices that are a brand's own channel, drawn with that brand's mark.
const LOGO_ALIASES: Record<string, string> = {
  ghl_sms: "ghl",
  hubspot_sms: "hubspot",
  cold_open_instantly: "instantly",
  cold_open_smartlead: "smartlead",
  cold_open_lemlist: "lemlist",
  cold_open_reply_io: "reply_io",
};

export function PlatformLogo({
  provider: rawProvider,
  size = 20,
  monogram,
}: {
  provider: string;
  size?: number;
  /** When every logo source fails, show this name's first letter instead of
   * the generic mail glyph (round avatars read better with a letter). */
  monogram?: string;
}) {
  const provider = LOGO_ALIASES[rawProvider] ?? rawProvider;
  const simpleIconSlug = SIMPLE_ICON_SLUGS[provider];
  const logoDomain = LOGO_DOMAINS[provider];
  const [tier, setTier] = useState<"svg" | "domain" | "png" | "fallback">(
    simpleIconSlug ? "svg" : logoDomain ? "domain" : "png"
  );
  // "Any website" is a choice, not a brand: a plain globe, never a guess.
  if (provider === "plain_html") return <Globe className="shrink-0 text-zinc-500" style={{ width: size * 0.6, height: size * 0.6 }} />;
  if (tier === "fallback") {
    return monogram ? (
      <span className="shrink-0 font-semibold leading-none text-zinc-500" style={{ fontSize: size * 0.72 }} aria-hidden="true">
        {monogram.charAt(0).toUpperCase()}
      </span>
    ) : (
      <Mail className="shrink-0 text-zinc-400" style={{ width: size * 0.55, height: size * 0.55 }} />
    );
  }
  if (tier === "svg" && simpleIconSlug) {
    return (
      <img
        src={`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${simpleIconSlug}.svg`}
        alt={`${provider} logo`}
        className="shrink-0 object-contain"
        style={{ maxWidth: size, maxHeight: size }}
        onError={() => setTier(logoDomain ? "domain" : "png")}
      />
    );
  }
  if (tier === "domain" && logoDomain) {
    return (
      <img
        src={`https://unavatar.io/${logoDomain}?fallback=false`}
        alt={`${provider} logo`}
        className="shrink-0 object-contain"
        style={{ maxWidth: size, maxHeight: size }}
        onError={() => setTier("png")}
      />
    );
  }
  const filename = LOGO_FILENAME_OVERRIDES[provider] ?? provider;
  return (
    <img
      src={`/logos/${filename}.png`}
      alt={`${provider} logo`}
      className="shrink-0 object-contain"
      style={{ maxWidth: size, maxHeight: size }}
      onError={() => setTier("fallback")}
    />
  );
}


// Local PNGs in public/logos, keyed by provider.
const LOCAL_LOGOS: Record<string, true> = {
  activecampaign: true,
  cal_com: true,
  calendly: true,
  hubspot: true,
  convertkit: true,
  klaviyo: true,
  mailchimp: true,
  oncehub: true,
  whop: true,
};

/** Whether a value is a real brand this component can draw, rather than a
 * choice like "none", "slack_webhook" or "time_slots" that would only ever
 * get the generic fallback glyph. */
export function hasPlatformLogo(rawProvider: string): boolean {
  const provider = LOGO_ALIASES[rawProvider] ?? rawProvider;
  return provider in SIMPLE_ICON_SLUGS || provider in LOGO_DOMAINS || provider in LOCAL_LOGOS;
}
