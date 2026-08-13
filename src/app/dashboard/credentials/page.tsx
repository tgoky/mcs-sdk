import { redirect } from "next/navigation";

/**
 * Credentials now live at /dashboard/settings/connections (see
 * settings-sidebar.tsx). This route stays alive as a redirect so old
 * links/bookmarks to /dashboard/credentials still land somewhere correct
 * instead of 404ing.
 *
 * This used to redirect through /dashboard/settings?tab=credentials, but
 * settings/page.tsx unconditionally redirects to /dashboard/settings/profile
 * with no route ever reading that query param — the tab was silently
 * dropped every time. Pointing straight at the real page fixes it.
 */
export default function CredentialsRedirect() {
  redirect("/dashboard/settings/connections");
}
