import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';
import { getUserClientIdentifier, getUserRoles } from './lib/rbac';

const STATIC_PATHS = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];
const PUBLIC_PATHS = ['/', '/forbidden', '/learning'];
const DEBUG_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true';

const normalizePath = (p: string) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);

function isAllowedClientDashboardPath(pathname: string, clientSlug: string) {
  const base = `/dashboard/${clientSlug}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

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

    const roles = getUserRoles(session.user);
    const isClient = roles.includes('client');
    const clientSlug = getUserClientIdentifier(session.user);

    if (isClient && !clientSlug) {
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

  const roles = getUserRoles(session.user);
  const isClient = roles.includes('client');
  const isAdmin = roles.includes('admin');
  const clientSlug = getUserClientIdentifier(session.user);
  let redirectTarget: string | null = null;

  // Client users: redirect home + enforce tenant dashboard slug.
  if (isClient) {
    if (!clientSlug) {
      redirectTarget = '/unauthorized';
    } else if (pathname === '/' || pathname === '/dashboard') {
      redirectTarget = `/dashboard/${clientSlug}`;
    } else if (pathname.startsWith('/dashboard') && !isAllowedClientDashboardPath(pathname, clientSlug)) {
      redirectTarget = `/dashboard/${clientSlug}`;
    }
  }

  if (DEBUG_AUTH_ENABLED) {
    console.log('[middleware auth debug]', {
      path: pathname,
      roles,
      clientSlug,
      isClient,
      isAdmin,
      redirectTarget,
    });
  }

  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  // Non-client users (admins/managers) can proceed.
  if (!isClient) return continueResponse;

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
  if (!clientSlug) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }
  return NextResponse.redirect(new URL(`/dashboard/${clientSlug}`, request.url));
}

export const config = {
  matcher: [
    '/((?!api/|_next/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|static/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot)).*)',
  ],
};