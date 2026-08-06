/**
 * The 5-color palette offered from the client rail's "..." row menu →
 * "Add tag color" submenu (see client-sidebar-list.tsx). Recolors only the
 * squircle icon next to a client's name in the sidebar — never the row's
 * background or the name text itself.
 *
 * `id` is what's persisted on engagements.tagColor (never a raw hex), so
 * the actual colors can be retuned later without touching stored data.
 * "teal" is also the fallback rendered for tagColor === null, so its hex
 * must stay in sync with the historical hardcoded squircle color.
 */
export interface EngagementTagColor {
  id: string;
  label: string;
  /** Squircle background. */
  hex: string;
}

export const ENGAGEMENT_TAG_COLORS: EngagementTagColor[] = [
  { id: "teal", label: "Teal", hex: "#7fe3d4" },
  { id: "blue", label: "Blue", hex: "#7dd3fc" },
  { id: "violet", label: "Violet", hex: "#c4b5fd" },
  { id: "amber", label: "Amber", hex: "#fbbf24" },
  { id: "rose", label: "Rose", hex: "#fda4af" },
];

const TAG_COLOR_IDS = new Set(ENGAGEMENT_TAG_COLORS.map((c) => c.id));

export function isValidTagColorId(value: unknown): value is string {
  return typeof value === "string" && TAG_COLOR_IDS.has(value);
}

/** engagements.tagColor is nullable — this always resolves to a real hex for rendering. */
export function tagColorHex(id: string | null | undefined): string {
  return ENGAGEMENT_TAG_COLORS.find((c) => c.id === id)?.hex ?? ENGAGEMENT_TAG_COLORS[0].hex;
}
