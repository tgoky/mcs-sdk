"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Upload, Sparkles, Check, Loader2, ChevronLeft } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { DEFAULT_AVATAR_STYLE, seedsForStyle, defaultSeedForIdentifier, generateAvatarDataUri } from "@/lib/avatar";
import type { UserAvatarPrefs } from "@/lib/user-avatar";

const GRID_SEEDS = seedsForStyle(25);
const MAX_UPLOAD_DIMENSION = 256;

/**
 * Reads a File, center-crops it to a square (most phone photos aren't
 * square, and an avatar slot always is — cropping beats squashing into
 * the wrong aspect), downscales it, and returns a small JPEG data URI.
 * There's no blob/object storage wired into this app — see the
 * avatarImageUrl column's doc in schema.ts — so keeping this small
 * enough to live directly in a Postgres text column is the point, not
 * just a nice-to-have.
 */
async function resizeImageFile(file: File, maxDim = MAX_UPLOAD_DIMENSION, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read the image."));
    el.src = dataUrl;
  });

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, maxDim, maxDim);

  return canvas.toDataURL("image/jpeg", quality);
}

type Step = "collapsed" | "choice" | "avatar" | "upload";

/**
 * Inline expand/collapse, same idea as the dashboard's Needs Attention
 * panel — grows in place under the current avatar, never a modal or a
 * route change. Two real steps live inside it: upload-vs-avatar choice,
 * then either a file picker or a category + 5x5 seed grid, with a live
 * preview on the avatar itself the whole time.
 */
export function AvatarPicker({
  displayName,
  identityFallback,
  initialAvatar,
}: {
  displayName: string;
  /** Stable per-user string (email or whopUserId) — see UserAvatar's own doc. */
  identityFallback: string;
  initialAvatar: UserAvatarPrefs;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  // A user who's never explicitly chosen defaults to the same PixelBot
  // UserAvatar already shows them everywhere else (see its own doc) —
  // opening "Choose an avatar" for the first time shows that exact seed
  // pre-selected with a checkmark, not a blank grid that contradicts
  // what their avatar already looks like on every other page.
  const defaultSeed = initialAvatar.avatarType === "dicebear" ? initialAvatar.avatarSeed : defaultSeedForIdentifier(identityFallback);

  const [avatar, setAvatar] = useState(initialAvatar);
  const [step, setStep] = useState<Step>("collapsed");
  const [pendingSeed, setPendingSeed] = useState<string | null>(defaultSeed);
  const [pendingUpload, setPendingUpload] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = displayName.slice(0, 2).toUpperCase();

  const gridUris = useMemo(
    () => GRID_SEEDS.map((seed) => ({ seed, uri: generateAvatarDataUri(DEFAULT_AVATAR_STYLE, seed, { isDark, size: 40 }) })),
    [isDark]
  );

  const previewAvatar: UserAvatarPrefs = pendingUpload
    ? { avatarType: "upload", avatarImageUrl: pendingUpload, avatarStyle: null, avatarSeed: null }
    : pendingSeed
    ? { avatarType: "dicebear", avatarStyle: DEFAULT_AVATAR_STYLE, avatarSeed: pendingSeed, avatarImageUrl: null }
    : avatar;

  const dirty = step === "upload" ? Boolean(pendingUpload) : step === "avatar" ? Boolean(pendingSeed) : false;

  function close() {
    setStep("collapsed");
    setError(null);
    setPendingUpload(null);
    setPendingSeed(avatar.avatarType === "dicebear" ? avatar.avatarSeed : defaultSeedForIdentifier(identityFallback));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is too large — try one under 8MB.");
      return;
    }
    setError(null);
    try {
      setPendingUpload(await resizeImageFile(file));
    } catch {
      setError("Couldn't read that image — try a different file.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = pendingUpload
        ? { type: "upload", dataUri: pendingUpload }
        : { type: "dicebear", style: DEFAULT_AVATAR_STYLE, seed: pendingSeed };
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save your avatar — try again.");
        return;
      }
      setAvatar(previewAvatar);
      setStep("collapsed");
      setPendingUpload(null);
      router.refresh();
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/avatar", { method: "DELETE" });
      if (!res.ok) {
        setError("Couldn't remove your avatar — try again.");
        return;
      }
      setAvatar({ avatarType: null, avatarStyle: null, avatarSeed: null, avatarImageUrl: null });
      setPendingSeed(defaultSeedForIdentifier(identityFallback));
      setPendingUpload(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const fallbackInitials = (
    <div className="h-14 w-14 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-500 dark:text-zinc-400 font-mono">
      {initials}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <UserAvatar
          avatar={avatar}
          identityFallback={identityFallback}
          size={56}
          className="border border-zinc-300 dark:border-zinc-700"
          fallback={fallbackInitials}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (step === "collapsed" ? setStep("choice") : close())}
            className="px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-md text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            {step === "collapsed" ? "Change avatar" : "Close"}
          </button>
          {avatar.avatarType && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="px-2.5 py-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {step !== "collapsed" && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {step === "choice" && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="flex flex-col items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer"
              >
                <Upload size={18} className="text-zinc-500 dark:text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Upload a photo</span>
              </button>
              <button
                type="button"
                onClick={() => setStep("avatar")}
                className="flex flex-col items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer"
              >
                <Sparkles size={18} className="text-zinc-500 dark:text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Choose an avatar</span>
              </button>
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-2.5">
              <BackRow onBack={() => setStep("choice")} />
              <div className="flex items-center gap-3">
                <UserAvatar
                  avatar={
                    pendingUpload
                      ? { avatarType: "upload", avatarImageUrl: pendingUpload, avatarStyle: null, avatarSeed: null }
                      : avatar
                  }
                  identityFallback={identityFallback}
                  size={48}
                  className="border border-zinc-300 dark:border-zinc-700"
                  fallback={fallbackInitials}
                />
                <label className="cursor-pointer px-2.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-950 rounded-md text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors">
                  <span>Choose a file</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                PNG, JPEG, WebP or GIF, under 8MB — cropped to a square automatically.
              </p>
            </div>
          )}

          {step === "avatar" && (
            <div className="space-y-2.5">
              <BackRow onBack={() => setStep("choice")} />

              {/* Fixed-size swatches, not grid columns stretched to fill
                  whatever width the panel happens to have — that's what
                  made these render nearly full-card-sized. 36px is a real
                  "pick one from a grid" thumbnail, matching e.g. Slack's
                  own emoji/avatar pickers. */}
              <div className="grid grid-cols-[repeat(5,36px)] gap-1.5">
                {gridUris.map(({ seed, uri }) => {
                  const selected = pendingSeed === seed;
                  return (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setPendingSeed(seed)}
                      aria-label={`Select avatar ${seed}`}
                      aria-pressed={selected}
                      className={`relative w-9 h-9 rounded-md overflow-hidden border-2 transition-all cursor-pointer ${
                        selected
                          ? "border-amber-500 dark:border-amber-400 scale-95"
                          : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uri} alt="" className="w-full h-full object-cover" />
                      {selected && (
                        <span className="absolute -top-1 -right-1 flex items-center justify-center w-3 h-3 rounded-full bg-amber-500 text-white ring-1 ring-white dark:ring-zinc-950">
                          <Check size={7} strokeWidth={3.5} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(step === "upload" || step === "avatar") && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-md text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1.5"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                <span>Save avatar</span>
              </button>
              <button
                type="button"
                onClick={close}
                className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
        </div>
      )}
    </div>
  );
}

function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
    >
      <ChevronLeft size={12} /> Back
    </button>
  );
}
