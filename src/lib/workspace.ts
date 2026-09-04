import crypto from "crypto";
import { cache } from "react";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { engagements, workspacePackages, workspaces } from "@/models/schema";
import { WORKSPACE_PRODUCTS } from "@/lib/copy";
import { isValidTimezone, isValidLocale, DEFAULT_TIMEZONE, DEFAULT_LOCALE } from "@/lib/timezones";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export type Workspace = {
  workspaceId: string;
  name: string;
  isLegacy: boolean;
  timezone: string;
  locale: string;
  createdAt: Date;
};

const WORKSPACE_SELECT = {
  workspaceId: workspaces.workspaceId,
  name: workspaces.name,
  isLegacy: workspaces.isLegacy,
  timezone: workspaces.timezone,
  locale: workspaces.locale,
  createdAt: workspaces.createdAt,
} as const;

const INSTALLABLE_PACKAGE_IDS = new Set(
  WORKSPACE_PRODUCTS.filter((p) => p.status === "available").map((p) => p.id)
);

function defaultWorkspaceId(whopUserId: string): string {
  return `ws_legacy_${whopUserId}`;
}

function newWorkspaceId(): string {
  return `ws_${crypto.randomBytes(9).toString("hex")}`;
}

/**
 * Get-or-create the one auto-generated workspace every account gets by
 * default, and backfill any of that account's engagements that predate
 * workspaces onto it — named "My workspace" rather than anything calling
 * out that it's a migration artifact, since a brand-new account gets one
 * exactly the same way and there's nothing "legacy" about that case.
 * `isLegacy` still marks it internally so backfill/ordering logic can find
 * it without guessing.
 *
 * Idempotent and safe under concurrent callers (two tabs loading the
 * dashboard for the same never-visited-before account at once, etc.):
 * - The insert targets a *deterministic* workspaceId
 *   (`ws_legacy_${whopUserId}`), so two racing requests collide on the same
 *   unique-constraint value at the database level and onConflictDoNothing
 *   makes the loser a no-op. There's no separate read-then-decide-then-
 *   insert step for a race to land inside.
 * - The engagements backfill is a plain `UPDATE ... WHERE workspace_id IS
 *   NULL`, a pure function of whopUserId with no read-modify-write step —
 *   two concurrent copies just perform the same write twice, harmlessly.
 * - The package-seed insert is the same onConflictDoNothing shape as the
 *   workspace insert, for the same reason.
 */
export async function ensureLegacyWorkspace(whopUserId: string): Promise<Workspace> {
  const id = defaultWorkspaceId(whopUserId);

  await db
    .insert(workspaces)
    .values({
      id: crypto.randomUUID(),
      workspaceId: id,
      whopUserId,
      name: "My workspace",
      isLegacy: true,
    })
    .onConflictDoNothing({ target: workspaces.workspaceId });

  await db
    .update(engagements)
    .set({ workspaceId: id })
    .where(and(eq(engagements.whopUserId, whopUserId), isNull(engagements.workspaceId)));

  // Showtime is the only real package a pre-workspace account could have
  // been using, so its default workspace starts with it installed — matches
  // the access every existing user already had.
  await db
    .insert(workspacePackages)
    .values({ id: crypto.randomUUID(), workspaceId: id, packageId: "showtime" })
    .onConflictDoNothing({ target: [workspacePackages.workspaceId, workspacePackages.packageId] });

  const [row] = await db.select(WORKSPACE_SELECT).from(workspaces).where(eq(workspaces.workspaceId, id)).limit(1);

  // Guaranteed to exist: either this call or a racing one just inserted it,
  // and nothing here ever deletes a workspace row.
  return row;
}

/** Every workspace an account has, default one first. Auto-creates the
 * default workspace (see ensureLegacyWorkspace) if the account has none
 * yet, so this never returns an empty list. */
export async function listWorkspaces(whopUserId: string): Promise<Workspace[]> {
  const rows = await db
    .select(WORKSPACE_SELECT)
    .from(workspaces)
    .where(and(eq(workspaces.whopUserId, whopUserId), isNull(workspaces.deletedAt)))
    .orderBy(asc(workspaces.createdAt));

  if (rows.length === 0) {
    return [await ensureLegacyWorkspace(whopUserId)];
  }

  return rows.sort((a, b) => (b.isLegacy ? 1 : 0) - (a.isLegacy ? 1 : 0));
}

/**
 * Read-only workspace resolution for Server Components (layout.tsx,
 * page.tsx) that render before any cookie can be written. Trusts the
 * `active_workspace_id` cookie only after confirming it names a workspace
 * this account actually owns — a stale cookie (account switched, workspace
 * deleted in the future, cookie edited by hand) can't leak into another
 * workspace's data, it just falls back instead.
 *
 * The fallback is read-only on purpose: it does NOT try to write the
 * cookie from here (Next.js Server Components can't set cookies mid-
 * render). Making a choice of workspace *stick* is the job of the explicit
 * "enter" / "switch" actions in api/workspaces/[id]/switch/route.ts, which
 * run as real request handlers and are allowed to.
 *
 * Wrapped in React's cache() — layout.tsx, WorkSidebar, EngagementsSidebar,
 * and whichever page.tsx is rendering all resolve this independently
 * within the same request (Next.js layouts don't propagate custom props to
 * pages), so without memoizing this would otherwise run the same cookie
 * validation query 5-10 times per request.
 */
export const getActiveWorkspace = cache(async (whopUserId: string): Promise<Workspace> => {
  const cookieStore = await cookies();
  const cookieId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  if (cookieId) {
    const [row] = await db
      .select(WORKSPACE_SELECT)
      .from(workspaces)
      .where(
        and(
          eq(workspaces.workspaceId, cookieId),
          eq(workspaces.whopUserId, whopUserId),
          isNull(workspaces.deletedAt)
        )
      )
      .limit(1);
    if (row) return row;
  }

  const all = await listWorkspaces(whopUserId);
  return all[0];
});

/** Confirms `workspaceId` belongs to `whopUserId`, returning the row or
 * null. Used by the switch route (and anywhere else that needs to trust a
 * client-supplied workspace id) instead of trusting the id on its own. */
export async function getOwnedWorkspace(whopUserId: string, workspaceId: string): Promise<Workspace | null> {
  const [row] = await db
    .select(WORKSPACE_SELECT)
    .from(workspaces)
    .where(
      and(
        eq(workspaces.workspaceId, workspaceId),
        eq(workspaces.whopUserId, whopUserId),
        isNull(workspaces.deletedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Creates a brand-new, independent workspace — its own client list from
 * zero, scoped by workspace_id on every engagement created inside it from
 * here on. `packageIds` comes straight off the creation form's checkboxes;
 * only ids that are actually installable today (see copy.ts's
 * WORKSPACE_PRODUCTS) are trusted, so a tampered or leftover "counter-claim"
 * value is silently dropped rather than installed as if it were real.
 */
export async function createWorkspace(
  whopUserId: string,
  name: string,
  packageIds: string[]
): Promise<{ workspace: Workspace; installedPackageIds: string[] } | { error: string }> {
  const trimmedName = name.trim().slice(0, 80);
  if (!trimmedName) {
    return { error: "Workspace name is required." };
  }

  const validPackageIds = [...new Set(packageIds)].filter((id) => INSTALLABLE_PACKAGE_IDS.has(id));
  if (validPackageIds.length === 0) {
    return { error: "Select at least one package to install." };
  }

  const id = newWorkspaceId();
  const createdAt = new Date();

  await db.insert(workspaces).values({
    id: crypto.randomUUID(),
    workspaceId: id,
    whopUserId,
    name: trimmedName,
    isLegacy: false,
    createdAt,
    updatedAt: createdAt,
  });

  await db.insert(workspacePackages).values(
    validPackageIds.map((packageId) => ({
      id: crypto.randomUUID(),
      workspaceId: id,
      packageId,
    }))
  );

  return {
    workspace: {
      workspaceId: id,
      name: trimmedName,
      isLegacy: false,
      timezone: DEFAULT_TIMEZONE,
      locale: DEFAULT_LOCALE,
      createdAt,
    },
    installedPackageIds: validPackageIds,
  };
}

/** Installed package ids for one or more workspaces, grouped by workspace
 * id — backs the /home workspace cards' "Showtime" / etc. subtitle. */
export async function getInstalledPackagesByWorkspace(
  workspaceIds: string[]
): Promise<Map<string, string[]>> {
  if (workspaceIds.length === 0) return new Map();

  const rows = await db
    .select({ workspaceId: workspacePackages.workspaceId, packageId: workspacePackages.packageId })
    .from(workspacePackages)
    .where(inArray(workspacePackages.workspaceId, workspaceIds));

  const byWorkspace = new Map<string, string[]>();
  for (const row of rows) {
    const list = byWorkspace.get(row.workspaceId) ?? [];
    list.push(row.packageId);
    byWorkspace.set(row.workspaceId, list);
  }
  return byWorkspace;
}

/** Installs one available product into a workspace the caller owns. Product
 * access is workspace-scoped, never inferred from a route or client input. */
export async function installPackageInWorkspace(
  whopUserId: string,
  workspaceId: string,
  packageId: string
): Promise<{ installed: true } | { error: string }> {
  if (!INSTALLABLE_PACKAGE_IDS.has(packageId)) {
    return { error: "That product is not available to install." };
  }

  const workspace = await getOwnedWorkspace(whopUserId, workspaceId);
  if (!workspace) return { error: "Workspace not found." };

  await db
    .insert(workspacePackages)
    .values({ id: crypto.randomUUID(), workspaceId, packageId })
    .onConflictDoNothing({ target: [workspacePackages.workspaceId, workspacePackages.packageId] });

  return { installed: true };
}

/** Explicit entitlement check for product routes and mutations. */
export async function isPackageInstalledInWorkspace(workspaceId: string, packageId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspacePackages.id })
    .from(workspacePackages)
    .where(and(eq(workspacePackages.workspaceId, workspaceId), eq(workspacePackages.packageId, packageId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Persists the workspace-level default timezone/locale — the write path
 * for Settings > Timezones & Region. Ownership is enforced the same way
 * as getOwnedWorkspace: the WHERE clause matches on whopUserId too, so a
 * tampered workspaceId can silently no-op rather than update someone
 * else's workspace.
 *
 * This is a *default*, not the value the crons read: new engagements are
 * seeded from it (see engagements/new/submit-payload.ts) but each
 * engagement's own stack.timezone is what
 * matchesDailyLocalHour/matchesWeeklyLocalHour actually consult, and that
 * can be changed per-client afterward without touching this.
 */
export async function updateWorkspaceRegionSettings(
  whopUserId: string,
  workspaceId: string,
  input: { timezone: string; locale: string }
): Promise<Workspace | { error: string }> {
  if (!isValidTimezone(input.timezone)) {
    return { error: "Unrecognized timezone." };
  }
  if (!isValidLocale(input.locale)) {
    return { error: "Unsupported locale." };
  }

  const [updated] = await db
    .update(workspaces)
    .set({ timezone: input.timezone, locale: input.locale, updatedAt: new Date() })
    .where(and(eq(workspaces.workspaceId, workspaceId), eq(workspaces.whopUserId, whopUserId)))
    .returning(WORKSPACE_SELECT);

  if (!updated) {
    return { error: "Workspace not found." };
  }
  return updated;
}

/**
 * Renames a workspace — backs "Edit workspace name" in the /home workspace
 * card's menu (see workspace-card-menu.tsx). Same trim/length rule as
 * createWorkspace so a card's title can never overflow what creation
 * itself would have allowed. Ownership enforced the same way as
 * updateWorkspaceRegionSettings: the WHERE clause matches on whopUserId
 * too, so a tampered workspaceId silently no-ops instead of renaming
 * someone else's workspace.
 */
export async function renameWorkspace(
  whopUserId: string,
  workspaceId: string,
  name: string
): Promise<Workspace | { error: string }> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return { error: "Workspace name is required." };
  }

  const [updated] = await db
    .update(workspaces)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(workspaces.workspaceId, workspaceId), eq(workspaces.whopUserId, whopUserId)))
    .returning(WORKSPACE_SELECT);

  if (!updated) {
    return { error: "Workspace not found." };
  }
  return updated;
}

/**
 * Soft-deletes a workspace — backs "Delete workspace" in the /home
 * workspace card's menu. Soft only, for the same foreign-key reason as
 * engagements' DELETE handler (workspace_packages, engagements, and
 * credential_vault all reference workspaces.workspaceId with ON DELETE NO
 * ACTION — a hard delete would throw the instant this workspace owned so
 * much as one of any of those). Nothing under it is touched here: its
 * engagements simply stop being reachable through listWorkspaces /
 * getOwnedWorkspace, same as a deleted engagement stops being reachable
 * through the roster.
 *
 * Two guardrails on top of the soft-delete itself, since unlike an
 * engagement, deleting a workspace can leave an account with *nowhere to
 * land*:
 *  - The auto-created default workspace (isLegacy) can't be deleted. It's
 *    the one ensureLegacyWorkspace get-or-creates by a deterministic id;
 *    soft-deleting it wouldn't cause that function to mint a replacement
 *    (onConflictDoNothing matches on workspaceId, not deletedAt), so it
 *    would just disappear for good — no PATCH { restore: true } analog
 *    exists on this menu.
 *  - The account's last remaining (non-deleted) workspace can't be
 *    deleted, so /home is never left with zero cards and getActiveWorkspace
 *    always has something to resolve to.
 *
 * Requires the workspace's own name as a confirmation echo, same "type to
 * confirm" pattern as DeleteClientSection.
 */
export async function deleteWorkspace(
  whopUserId: string,
  workspaceId: string,
  confirmName: string
): Promise<{ ok: true } | { error: string }> {
  const [existing] = await db
    .select({ name: workspaces.name, isLegacy: workspaces.isLegacy, deletedAt: workspaces.deletedAt })
    .from(workspaces)
    .where(and(eq(workspaces.workspaceId, workspaceId), eq(workspaces.whopUserId, whopUserId)))
    .limit(1);

  if (!existing) {
    return { error: "Workspace not found." };
  }
  if (existing.deletedAt) {
    return { error: "Already deleted." };
  }
  if (existing.isLegacy) {
    return { error: "Your default workspace can't be deleted." };
  }
  if (confirmName.trim() !== existing.name) {
    return { error: "Confirmation text didn't match the workspace name." };
  }

  const [{ count: remaining }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.whopUserId, whopUserId),
        isNull(workspaces.deletedAt),
        ne(workspaces.workspaceId, workspaceId)
      )
    );
  if (remaining === 0) {
    return { error: "You need at least one workspace — create another before deleting this one." };
  }

  await db
    .update(workspaces)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(workspaces.workspaceId, workspaceId), eq(workspaces.whopUserId, whopUserId)));

  return { ok: true };
}
