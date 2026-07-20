import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  whopUserId: string;
  email: string;
  subscriptionStatus: string;
  subscriptionVerifiedAt: number;
  refreshToken?: string;
};

const isProd = process.env.NODE_ENV === "production";

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "mudd_session",
  cookieOptions: {
    secure: isProd,
    httpOnly: true,
    path: "/",
    sameSite: isProd ? "none" : "lax",
    ...(isProd ? { partitioned: true } : {}),
    maxAge: 60 * 60 * 24 * 14, // 14 days
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  return session;
}