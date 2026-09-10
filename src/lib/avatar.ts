// src/lib/avatar.ts
//
// Generates a DiceBear avatar's SVG as a data URI, given only a style id
// and a seed — nothing about the picture itself is ever stored (see
// users.avatarSeed's doc in schema.ts), it's regenerated deterministically
// on every render instead.

import { createAvatar } from "@dicebear/core";
import { pixelArt, micah, openPeeps } from "@dicebear/collection";
import type { Style } from "@dicebear/core";

export const AVATAR_STYLES = {
  "pixel-art": { label: "PixelBot", style: pixelArt as Style<Record<string, unknown>> },
  micah: { label: "Micah", style: micah as Style<Record<string, unknown>> },
  "open-peeps": { label: "Open Peeps", style: openPeeps as Style<Record<string, unknown>> },
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
  opts?: { isDark?: boolean; size?: number }
): string {
  const { style } = AVATAR_STYLES[styleId];
  const avatar = createAvatar(style, {
    seed,
    size: opts?.size ?? 128,
    backgroundColor: [avatarBackgroundColor(opts?.isDark ?? true)],
    backgroundType: ["solid"],
    radius: 0,
  });
  return avatar.toDataUri();
}
