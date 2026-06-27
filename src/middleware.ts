import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/session";

const PUBLIC_PATHS = ["/", "/api/auth/login", "/api/auth/callback"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, {
    password: process.env.SESSION_SECRET!,
    cookieName: "mudd_session",
  });

  if (!session.whopUserId) {
    return NextResponse.redirect(new URL("/api/auth/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/webhooks/:path*", "/api/crons/:path*"],
};