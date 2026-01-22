import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';
import { getRoles } from './lib/auth0-claims';
import { getUserClientIdentifier, getUserPrimaryMbaNumber, getUserMbaNumbers } from './lib/rbac';

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
  const isClient = roles.includes('client');
  const isAdmin = roles.includes('admin');

  // Client users accessing /dashboard must be redirected to their client dashboard
  if (isClient && pathname === '/dashboard') {
    const clientSlug = getUserClientIdentifier(session.user);
    if (!clientSlug) {
      console.warn('[middleware] Client user missing client_slug, redirecting to unauthorized', {
        email: session.user?.email,
      });
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Check for primary MBA or single MBA assignment
    const primaryMba = getUserPrimaryMbaNumber(session.user);
    const mbaNumbers = getUserMbaNumbers(session.user);

    if (primaryMba) {
      return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${primaryMba}`, request.url));
    }

    if (mbaNumbers.length === 1) {
      return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${mbaNumbers[0]}`, request.url));
    }

    return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, request.url));
  }

  // Non-client users (admins) can proceed
  if (!isClient) {
    return continueResponse;
  }

  // Client users: enforce tenant isolation
  const clientSlug = getUserClientIdentifier(session.user);
  if (!clientSlug) {
    return pathname === '/forbidden' || pathname === '/unauthorized'
      ? continueResponse
      : NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  // Redirect root to client dashboard
  if (pathname === '/') {
    const primaryMba = getUserPrimaryMbaNumber(session.user);
    const mbaNumbers = getUserMbaNumbers(session.user);

    if (primaryMba) {
      return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${primaryMba}`, request.url));
    }

    if (mbaNumbers.length === 1) {
      return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${mbaNumbers[0]}`, request.url));
    }

    return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, request.url));
  }

  // Allow access to learning, forbidden, unauthorized pages
  if (pathname === '/learning' || pathname === '/forbidden' || pathname === '/unauthorized') {
    return continueResponse;
  }

  // For dashboard routes, let the page components handle tenant checks
  // (they will use notFound() if there's a mismatch)
  if (pathname.startsWith('/dashboard/')) {
    return continueResponse;
  }

  // For other routes, redirect to client dashboard
  const primaryMba = getUserPrimaryMbaNumber(session.user);
  const mbaNumbers = getUserMbaNumbers(session.user);

  if (primaryMba) {
    return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${primaryMba}`, request.url));
  }

  if (mbaNumbers.length === 1) {
    return NextResponse.redirect(new URL(`/dashboard/${clientSlug}/${mbaNumbers[0]}`, request.url));
  }

  return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, request.url));
}

export const config = {
  matcher: [
    '/((?!api/|_next/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|static/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot)).*)',
  ],
};