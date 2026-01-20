import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';
import { getAllowedClientSlugs, getClientSlug, getRoles } from './lib/auth0-claims';

const STATIC_PATHS = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];
const PUBLIC_PATHS = ['/', '/forbidden', '/learning'];

const normalizePath = (p: string) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);
const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function middleware(request: NextRequest) {
  // Run Auth0 middleware first so sessions/cookies continue to roll
  const authResponse = await auth0.middleware(request);
  const continueResponse = authResponse ?? NextResponse.next();

  const pathname = normalizePath(request.nextUrl.pathname);
  const isApiRoute = pathname.startsWith('/api');
  const isAuthApi = pathname.startsWith('/api/auth');

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/auth') ||
    isAuthApi ||
    STATIC_PATHS.includes(pathname)
  ) {
    return continueResponse;
  }

  if (pathname !== '/' && PUBLIC_PATHS.includes(pathname)) {
    return continueResponse;
  }

  const session = await auth0.getSession(request);

  // API routes (except /api/auth) return JSON on missing auth
  if (isApiRoute) {
    // NOTE: Middleware only enforces authentication for /api routes.
    // Tenant isolation must be enforced in API handlers (recommended),
    // or by introducing a scoped API route structure (e.g. /api/client/*).
    if (!session) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    const roles = getRoles(session.user);
    const allowedSlugs = getAllowedClientSlugs(session.user);
    const isClient = roles.includes('client');

    if (isClient && allowedSlugs.length === 0) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    return continueResponse;
  }

  // Allow unauthenticated access to root (landing), but redirect client users later
  if (pathname === '/' && !session) {
    return continueResponse;
  }

  // Non-API routes must have a session from here down
  if (!session) {
    const returnTo = request.nextUrl.pathname + request.nextUrl.search;
    const loginUrl = new URL(
      `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
      request.url
    );
    return NextResponse.redirect(loginUrl);
  }

  const roles = getRoles(session.user);
  const allowedSlugs = getAllowedClientSlugs(session.user);
  const primarySlug = allowedSlugs[0];
  const clientRoot = primarySlug ? `/${primarySlug}` : undefined;
  const isClient = roles.includes('client');

  if (!isClient) {
    return continueResponse;
  }

  if (!clientRoot) {
    return pathname === '/forbidden'
      ? continueResponse
      : NextResponse.redirect(new URL('/forbidden', request.url));
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(clientRoot, request.url));
  }

  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    return NextResponse.redirect(new URL(clientRoot, request.url));
  }

  const routeSlugRaw = pathname.split('/').filter(Boolean)[0] ?? '';
  const routeSlug = slugify(routeSlugRaw);
  const isAllowed =
    pathname === '/learning' ||
    pathname === '/forbidden' ||
    (routeSlug && allowedSlugs.includes(routeSlug));

  if (isAllowed) {
    return continueResponse;
  }

  return NextResponse.redirect(new URL(clientRoot, request.url));
}

export const config = {
  matcher: [
    '/((?!api/|_next/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|static/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot)).*)',
  ],
};