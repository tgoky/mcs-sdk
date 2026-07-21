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

// ← Added "export" here
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "mudd_session",
  cookieOptions: {
    secure: true,
    httpOnly: true,
    path: "/",
    sameSite: "lax", // was "none"
    // partitioned: true,  ← remove this line
    maxAge: 60 * 60 * 24 * 14,
  },
};

// Keep using this for Server Components (page.tsx, layout.tsx)
export async function getSession() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  return session;
}