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
  // Whop's refresh token, needed to revoke on logout (see /oauth/revoke in
  // src/lib/whop.ts). Stored only inside the encrypted, httpOnly
  // iron-session cookie — never sent to the client in plaintext.
  refreshToken?: string;
};

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "mudd_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    // Explicit rather than relying on defaults: without a Path attribute,
    // RFC 6265's default-path algorithm scopes a cookie to the directory
    // of whichever URL first set it (e.g. "/api/auth/" if that's where
    // session.save() first ran) rather than the whole site — which would
    // make the cookie invisible to /dashboard/* requests even though it
    // looked fine immediately after login. Matches the explicit path: "/"
    // already used by the temp oauth_state/oauth_nonce cookies in
    // src/app/api/auth/login/route.ts.
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 14, // ✅ Converts to a persistent cookie that lasts exactly 14 days
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  return session;
}