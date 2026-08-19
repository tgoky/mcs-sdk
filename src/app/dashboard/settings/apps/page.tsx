import { getSession } from "@/lib/session";
import { getActiveWorkspace } from "@/lib/workspace";
import { listVaultCredentials } from "@/lib/credentials";
import { AppsPageClient } from "./apps-page-client";

/**
 * Was a 404 before this — the sidebar has always linked here
 * (settings-sidebar.tsx), but the route didn't exist. This is the
 * vault-backed inventory: connect the 5 Composio-managed platforms with
 * one click, paste a key for the rest, and rotate/delete anything saved
 * here — the credential-vault API already supported all of this, it just
 * had no frontend (see /api/credential-vault and its [id] route).
 */
export default async function AppsSettingsPage() {
  const session = await getSession();
  if (!session.whopUserId) return null;
  const activeWorkspace = await getActiveWorkspace(session.whopUserId);

  const items = await listVaultCredentials(activeWorkspace.workspaceId);
  const serializedItems = items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));

  return <AppsPageClient initialItems={serializedItems} />;
}
