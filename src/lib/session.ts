import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  whopUserId: string;
  email: string;
  subscriptionStatus: string;
  // Epoch ms of the last time subscriptionStatus was actually re-verified
  // against Whop's Memberships API (see src/lib/whop-access.ts). The
  // callback route sets this on login; middleware re-checks and refreshes
  // it once MEMBERSHIP_REVALIDATE_MS has elapsed, so a cancellation or
  // payment failure gets picked up within one revalidation window instead
  // of only at the next full login.
  subscriptionVerifiedAt: number;
};

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "mudd_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  return session;
}