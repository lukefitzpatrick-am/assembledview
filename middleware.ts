import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

const STATIC_PATHS = ["/favicon.ico", "/robots.txt", "/sitemap.xml"];

const normalizePath = (p: string) => (p !== "/" && p.endsWith("/") ? p.slice(0, -1) : p);

export async function middleware(request: NextRequest) {
  const response = await auth0.middleware(request);

  const pathname = normalizePath(request.nextUrl.pathname);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    STATIC_PATHS.includes(pathname)
  ) {
    return response;
  }

  const session = await auth0.getSession(request);
  if (!session) return response;

  const user = session.user as Record<string, any>;
  const roles: string[] = user["https://assembledview.com/roles"] || [];
  const clientSlug: string | undefined = user["https://assembledview.com/client"];

  const isClient = roles.includes("client");

  if (!isClient) return response;

  if (!clientSlug) {
    if (pathname === "/forbidden") return response;
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  const allowed =
    pathname === "/learning" ||
    pathname === "/dashboard" ||
    pathname === `/dashboard/${clientSlug}`;

  if (allowed) return response;

  return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, request.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};