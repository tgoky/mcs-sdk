import { getSession } from "@/lib/session";
import { getUserAvatar } from "@/lib/user-avatar";
import ProfileSettingsClient from "./profile-settings-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileSettingsPage() {
  const session = await getSession();
  const whopUserId = session.whopUserId!;
  const email = session.email ?? "";
  const displayName = email.split("@")[0] ?? "there";
  const avatar = await getUserAvatar(whopUserId);

  return <ProfileSettingsClient displayName={displayName} email={email} avatar={avatar} />;
}
