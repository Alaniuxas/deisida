import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/auth";

const sessionOptions = {
  password:
    process.env.SESSION_SECRET ??
    "deisida-dev-session-secret-change-in-production-32chars",
  cookieName: "deisida_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
  },
};

const publicPaths = ["/prisijungti", "/api/auth/login", "/api/cron/queue-plan"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.some((path) => pathname === path) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Reikalingas prisijungimas." }, { status: 401 });
    }
    const loginUrl = new URL("/prisijungti", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    session.role === "cechas" &&
    !pathname.startsWith("/cechas") &&
    !pathname.startsWith("/api/jobs")
  ) {
    return NextResponse.redirect(new URL("/cechas", request.url));
  }

  if (session.role === "pardavimai" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/pasiulymai", request.url));
  }

  if (session.role === "pardavimai" && pathname.startsWith("/cechas")) {
    return NextResponse.redirect(new URL("/pasiulymai", request.url));
  }

  if (
    session.role === "pardavimai" &&
    !pathname.startsWith("/pasiulymai") &&
    !pathname.startsWith("/plyteliu-baras") &&
    !pathname.startsWith("/eile") &&
    !pathname.startsWith("/api/")
  ) {
    return NextResponse.redirect(new URL("/pasiulymai", request.url));
  }

  if (pathname === "/") {
    if (session.role === "cechas") {
      return NextResponse.redirect(new URL("/cechas", request.url));
    }
    return NextResponse.redirect(new URL("/pasiulymai", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
