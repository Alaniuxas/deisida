import { NextResponse } from "next/server";
import { getIronSession, type SessionOptions } from "iron-session";
import type { SessionData } from "@/lib/auth";
import { localUrl } from "@/lib/request-url";

const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "deisida-dev-session-secret-change-in-production-32chars",
  cookieName: "deisida_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function POST(request: Request) {
  const response = NextResponse.redirect(localUrl(request.url, "/prisijungti"));
  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.destroy();
  return response;
}
