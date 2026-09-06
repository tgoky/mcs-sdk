// A deterministic colored-initials avatar for a client — same idea Slack/
// Linear/Notion use for anything without a real photo: same name always
// gets the same color and initials, different clients read as visually
// distinct rows instead of a repeated generic icon (Building2) that told
// you nothing about which client a row was until you read the text next
// to it.

const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ClientAvatar({
  name,
  size = 22,
  ring = false,
}: {
  name: string;
  size?: number;
  /** Subtle ring for the currently-selected/active row in a list. */
  ring?: boolean;
}) {
  const color = PALETTE[hashString(name) % PALETTE.length];
  return (
    <div
      className={`flex items-center justify-center rounded-full shrink-0 font-bold text-white leading-none select-none ${color} ${
        ring ? "ring-2 ring-white dark:ring-zinc-700" : ""
      }`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </div>
  );
}
