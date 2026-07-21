// src/lib/session.ts
import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  whopUserId: string;
  email: string;
  subscriptionStatus: string;
  subscriptionVerifiedAt: number;
  refreshToken?: string;
};

// For iframe embedding, SameSite=None is REQUIRED in all environments.
// Browsers treat localhost as a secure context, so Secure:true works locally.
const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "mudd_session",
  cookieOptions: {
    secure: true,           // Required for SameSite=None
    httpOnly: true,
    path: "/",
    sameSite: "none",       // Required for iframe
    partitioned: true,       // CHIPS - extra safety for third-party context
    maxAge: 60 * 60 * 24 * 14,
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  return session;
}