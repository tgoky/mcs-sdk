import { SKILL_MANIFEST, isSkillId } from "@/lib/skill-manifest";

/**
 * Friendly labels for every static top-level dashboard route. Shared by
 * <Breadcrumbs/> (labels the whole trail) and <BackLink/> (labels just the
 * previous page) so the two never describe the same route two different
 * ways.
 */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  engagements: "Engagements",
  new: "New Client",
  queue: "Queue",
  analytics: "Analytics",
  library: "Library",
  modules: "Library",
  settings: "Settings",
  runs: "Runs",
  credentials: "Credentials",
  skills: "Skills",
  bridges: "Setup",
};

/** Segments that look like a UUID/CUID/nanoid — a dynamic record id, not a
 * real page name — and therefore need either a registered label (via
 * SetBreadcrumbLabel) or a generic fallback rather than being shown raw.
 * Engagement ids in this app (e.g. "eng_mudd_ventures_msg8wc5y") use
 * underscores rather than hyphens, so both separators are accepted. */
export function looksLikeId(segment: string): boolean {
  return /^[a-z0-9]{6,}([_-][a-z0-9]{2,}){0,6}$/i.test(segment) && /[0-9]/.test(segment);
}

function fallbackSegmentLabel(segment: string, parentSegment: string | undefined): string {
  if (parentSegment === "engagements") return "Client";
  if (parentSegment === "runs") return "Run";
  return segment;
}

/** "pre-call-read" -> "Pre Call Read", for any slug that isn't a known
 * skill id and isn't a plain static route (e.g. a future route segment
 * nobody's taught this map about yet). Keeps BackLink from ever rendering
 * a raw, unreadable slug even for segments added after this file was
 * last updated. */
function titleCaseSlug(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Resolves one URL segment to its human label, given what (if anything)
 * the owning page has registered for the FULL pathname it belongs to, and
 * what the previous segment was (needed to tell a bare client id from a
 * bare run id).
 */
export function labelForSegment(
  segment: string,
  parentSegment: string | undefined,
  registeredForFullPath: string | undefined,
): string {
  if (registeredForFullPath) return registeredForFullPath;
  if (parentSegment === "modules" && isSkillId(segment)) return SKILL_MANIFEST[segment].name;
  if (parentSegment === "skills" && isSkillId(segment)) return SKILL_MANIFEST[segment].name;
  if (ROUTE_LABELS[segment]) return ROUTE_LABELS[segment];
  if (looksLikeId(segment)) return fallbackSegmentLabel(segment, parentSegment);
  return titleCaseSlug(segment) || segment;
}

/**
 * Resolves a full pathname (e.g. "/dashboard/modules/pre-call-read") down
 * to one human label, using its last segment. `registered` is the
 * pathname -> label map a dynamic page has explicitly set via
 * SetBreadcrumbLabel (e.g. a client's buyer name); everything else falls
 * back to route/skill-manifest naming so it's still readable.
 */
export function labelForPath(pathname: string, registered: Record<string, string>): string {
  if (registered[pathname]) return registered[pathname];
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return "Dashboard";
  return labelForSegment(last, segments[segments.length - 2], undefined);
}
