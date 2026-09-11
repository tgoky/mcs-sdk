// src/lib/avatar.ts
//
// Generates a DiceBear avatar's SVG as a data URI, given only a style id
// and a seed — nothing about the picture itself is ever stored (see
// users.avatarSeed's doc in schema.ts), it's regenerated deterministically
// on every render instead.

import { createAvatar } from "@dicebear/core";
import { pixelArt, initials } from "@dicebear/collection";
import type { Style } from "@dicebear/core";

// Just PixelBot, by design — Micah and Open Peeps were dropped per direct
// request rather than left as unused options. Kept as a one-entry record
// (not a single hardcoded style everywhere) so the stored avatarStyle
// column and isAvatarStyleId still mean something and a style could be
// added back without a schema change.
export const AVATAR_STYLES = {
  "pixel-art": { label: "PixelBot", style: pixelArt as Style<Record<string, unknown>> },
} as const;

export type AvatarStyleId = keyof typeof AVATAR_STYLES;

export function isAvatarStyleId(value: string | null | undefined): value is AvatarStyleId {
  return Boolean(value && value in AVATAR_STYLES);
}

export const AVATAR_STYLE_IDS = Object.keys(AVATAR_STYLES) as AvatarStyleId[];

/**
 * A fixed, curated set of seeds per style — not "type anything, get a
 * random face." A picker grid needs the same 25 options to show up in the
 * same order every time a user opens it, so seeds are plain labeled
 * strings ("bot-01".."bot-25") rather than random ids generated at
 * render time.
 */
export function seedsForStyle(count = 25): string[] {
  return Array.from({ length: count }, (_, i) => `avatar-${i + 1}`);
}

/**
 * Every user gets a real PixelBot by default — not a blank slot that
 * falls back to initials until they visit the picker. Hashes a stable
 * per-user identifier (email, or whopUserId if no email) onto one of the
 * same curated seeds seedsForStyle() generates, so the default is both
 * distinct per user (unlike a single hardcoded seed everyone would
 * share) and a real option already sitting in the picker grid — opening
 * "Choose an avatar" for the first time shows this exact seed selected,
 * not an empty grid.
 */
export function defaultSeedForIdentifier(identifier: string, count = 25): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) hash = (hash * 31 + identifier.charCodeAt(i)) | 0;
  const index = Math.abs(hash) % count;
  return `avatar-${index + 1}`;
}

export const DEFAULT_AVATAR_STYLE: AvatarStyleId = "pixel-art";

/**
 * Fixed seed for "the worker" (the AI side of a Teammates conversation),
 * not tied to any real person — deliberately distinct from any seed
 * defaultSeedForIdentifier could ever produce for a real user account,
 * since it's the same style/seed pair every workspace sees, unlike a
 * user's own per-person default.
 */
export const WORKER_AVATAR_SEED = "mcs-worker";

/**
 * Dark theme keeps DiceBear's own default (a near-black fill); light
 * theme swaps to white so the square doesn't read as a dark hole on a
 * light page. Hex without "#", matching DiceBear's own backgroundColor
 * format.
 */
export function avatarBackgroundColor(isDark: boolean): string {
  return isDark ? "0a0a0a" : "ffffff";
}

export function generateAvatarDataUri(
  styleId: AvatarStyleId,
  seed: string,
  opts?: { isDark?: boolean; size?: number; transparentBackground?: boolean }
): string {
  const { style } = AVATAR_STYLES[styleId];
  const avatar = createAvatar(style, {
    seed,
    size: opts?.size ?? 128,
    // Omitting backgroundColor/backgroundType entirely renders with no
    // background rect at all — real transparency, not a color chosen to
    // *look* transparent. Used where the avatar sits on a surface that
    // already has its own background (a chat bubble row), not the
    // filled-square look everywhere else.
    ...(opts?.transparentBackground
      ? {}
      : { backgroundColor: [avatarBackgroundColor(opts?.isDark ?? true)], backgroundType: ["solid" as const] }),
    radius: 0,
  });
  return avatar.toDataUri();
}

// DiceBear's `initials` style needs an explicit multi-color list to
// actually vary background color by seed — called with no palette at all,
// every seed falls back to the same single default color, which is
// exactly the bug this list fixes (every client avatar rendering
// identically orange regardless of name). Hex without "#", matching
// DiceBear's own backgroundColor format.
const CLIENT_AVATAR_COLORS = [
  "7c3aed", // violet
  "0284c7", // sky
  "059669", // emerald
  "d97706", // amber
  "e11d48", // rose
  "4f46e5", // indigo
  "0d9488", // teal
  "c026d3", // fuchsia
];

/**
 * DiceBear's `initials` style, for entities that aren't a user (a client
 * / workspace) and so were never going to have a PixelBot — this style
 * derives the letters itself from the seed text (the client's name) and,
 * given CLIENT_AVATAR_COLORS, picks one deterministically by hashing the
 * seed, so two different client names reliably land on two different
 * colors. Deliberately NOT added to AVATAR_STYLES above: that record is
 * specifically the curated set exposed in a *user's* own avatar picker
 * (tied to users.avatarStyle), not a general "every DiceBear style this
 * app can render" list.
 */
export function generateInitialsAvatarDataUri(name: string, opts?: { size?: number }): string {
  const avatar = createAvatar(initials as Style<Record<string, unknown>>, {
    seed: name.trim() || "?",
    size: opts?.size ?? 64,
    radius: 20,
    backgroundColor: CLIENT_AVATAR_COLORS,
  });
  return avatar.toDataUri();
}
