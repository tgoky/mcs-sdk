import { getSession } from "@/lib/session";
import { revokeToken } from "@/lib/whop";
import { redirect } from "next/navigation";

export async function POST() {
  const session = await getSession();
  if (session.refreshToken) {
    await revokeToken(session.refreshToken);
  }
  session.destroy();
  redirect("/");
}