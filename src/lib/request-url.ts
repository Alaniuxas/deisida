import { NextResponse } from "next/server";

const LOOPBACK_HOSTS = new Set(["0.0.0.0", "[::]", "::", "[::1]"]);

/** Normalize dev bind addresses so redirects open in the browser (not 0.0.0.0). */
export function normalizeRequestOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    url.hostname = "127.0.0.1";
  }
  return url.origin;
}

export function localUrl(requestUrl: string, path: string): URL {
  return new URL(path, normalizeRequestOrigin(requestUrl));
}

/** Relative Location — avoids leaking 0.0.0.0 or production host in dev redirects. */
export function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export function redirectFromRequest(requestUrl: string, path: string): NextResponse {
  return NextResponse.redirect(localUrl(requestUrl, path));
}
