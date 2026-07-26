import { redirect } from "next/navigation";

/**
 * Credentials moved into Settings (see /dashboard/settings/credentials-panel.tsx)
 * as one of two tabs alongside Booking Sync. This route stays alive as a
 * redirect so old links/bookmarks to /dashboard/credentials still land
 * somewhere correct instead of 404ing.
 */
export default function CredentialsRedirect() {
  redirect("/dashboard/settings?tab=credentials");
}
