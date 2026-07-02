import { getSession } from "@/lib/session";
import { revokeToken } from "@/lib/whop";
import { redirect } from "next/navigation";

export async function GET() {
  const session = await getSession();

  // Revoke the refresh token server-side so it can't be replayed even if
  // it were somehow extracted from the (encrypted, httpOnly) session
  // cookie. Best-effort — revokeToken() swallows its own errors so a Whop
  // API hiccup never blocks logout.
  if (session.refreshToken) {
    await revokeToken(session.refreshToken);
  }

  session.destroy();
  redirect("/");
}