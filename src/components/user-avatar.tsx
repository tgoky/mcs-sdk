"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { generateAvatarDataUri } from "@/lib/avatar";
import type { UserAvatarPrefs } from "@/lib/user-avatar";

/**
 * Renders a user's real chosen avatar (an uploaded photo, or a
 * regenerated DiceBear image) when they have one, or `fallback` — each
 * caller's own existing initials markup — when they don't. That keeps
 * every surface's look exactly as it was for the (initially: everyone)
 * users who haven't picked an avatar yet, instead of unifying three
 * different existing initials color schemes into a guess at one.
 *
 * DiceBear's own default background reads as a near-black square; on a
 * light-theme page that's a dark hole next to everything else, so the
 * background is regenerated per theme (see avatarBackgroundColor in
 * lib/avatar.ts) — this is the one reason this has to be a client
 * component with next-themes, not a plain server-rendered <img>.
 */
export function UserAvatar({
  avatar,
  size,
  radiusClassName = "rounded-full",
  className = "",
  fallback,
}: {
  avatar: UserAvatarPrefs;
  size: number;
  radiusClassName?: string;
  className?: string;
  fallback: React.ReactNode;
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
    if (avatar.avatarType !== "dicebear" || !avatar.avatarStyle || !avatar.avatarSeed) return null;
    return generateAvatarDataUri(avatar.avatarStyle, avatar.avatarSeed, { isDark });
  }, [avatar.avatarType, avatar.avatarStyle, avatar.avatarSeed, isDark]);

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
