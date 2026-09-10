"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { generateAvatarDataUri, defaultSeedForIdentifier, DEFAULT_AVATAR_STYLE } from "@/lib/avatar";
import type { UserAvatarPrefs } from "@/lib/user-avatar";

/**
 * Renders a user's real avatar: an uploaded photo, a regenerated DiceBear
 * image for an explicit choice, or — for the (initially: everyone) users
 * who haven't picked one yet — a real PixelBot deterministically seeded
 * from `identityFallback` (their email, or whopUserId), so "no avatar
 * set" still looks like a real per-person avatar instead of a blank slot.
 * `fallback` (each caller's own existing initials markup) is a true last
 * resort, only used if identityFallback is somehow empty.
 *
 * DiceBear's own default background reads as a near-black square; on a
 * light-theme page that's a dark hole next to everything else, so the
 * background is regenerated per theme (see avatarBackgroundColor in
 * lib/avatar.ts) — this is the one reason this has to be a client
 * component with next-themes, not a plain server-rendered <img>.
 */
export function UserAvatar({
  avatar,
  identityFallback,
  size,
  radiusClassName = "rounded-full",
  className = "",
  fallback,
  transparentBackground = false,
}: {
  avatar: UserAvatarPrefs;
  /** Stable per-user string (email or whopUserId) that seeds the default PixelBot when no avatar has been explicitly chosen. */
  identityFallback: string;
  size: number;
  radiusClassName?: string;
  className?: string;
  fallback: React.ReactNode;
  /** For a generated DiceBear avatar only — renders with no background
   * rect at all instead of the usual filled square, for a surface that
   * already has its own background (a chat message row). Has no effect
   * on an uploaded photo, which is opaque either way. */
  transparentBackground?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Deferred to a macro-task, same pattern theme-toggle.tsx already uses,
  // to avoid the cascading-render lint error a same-tick setState in an
  // effect body triggers.
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Before mount, resolvedTheme is unknown — default to the dark
  // background DiceBear itself defaults to, then correct on mount if the
  // page is actually light. A one-frame flash on first paint beats
  // guessing wrong and flashing the other way for light-theme visitors.
  const isDark = mounted ? resolvedTheme !== "light" : true;

  const dicebearUri = useMemo(() => {
    if (avatar.avatarType === "dicebear" && avatar.avatarStyle && avatar.avatarSeed) {
      return generateAvatarDataUri(avatar.avatarStyle, avatar.avatarSeed, { isDark, transparentBackground });
    }
    if (avatar.avatarType === null && identityFallback) {
      return generateAvatarDataUri(DEFAULT_AVATAR_STYLE, defaultSeedForIdentifier(identityFallback), { isDark, transparentBackground });
    }
    return null;
  }, [avatar.avatarType, avatar.avatarStyle, avatar.avatarSeed, identityFallback, isDark, transparentBackground]);

  const imgClassName = `shrink-0 object-cover select-none ${radiusClassName} ${className}`;

  if (avatar.avatarType === "upload" && avatar.avatarImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar.avatarImageUrl} alt="" className={imgClassName} style={{ width: size, height: size }} />;
  }

  if (dicebearUri) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={dicebearUri} alt="" className={imgClassName} style={{ width: size, height: size }} />;
  }

  return <>{fallback}</>;
}
