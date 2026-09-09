import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth0 } from './lib/auth0';
import { FINANCE_TAB_TO_SECTION_PATH } from './lib/finance/sections/nav';
import { getUserClientSlugs, getUserRoles } from './lib/rbac';
import { resolveClientPageFence } from './lib/auth/clientPathFence';

const STATIC_PATHS = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];
const PUBLIC_PATHS = ['/', '/forbidden'];
const DEBUG_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true';

const normalizePath = (p: string) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);

function isFinanceSectionsApiPath(pathname: string): boolean {
  return pathname === '/api/finance/sections' || pathname.startsWith('/api/finance/sections/');
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
    pathname.startsWith('/api/cron') ||
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
    const slugs = getUserClientSlugs(session.user);

    if (isClient && slugs.length === 0) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }

    // Finance sections API namespace — admin-only, fail-closed (even before endpoints exist).
    if (isFinanceSectionsApiPath(pathname)) {
      if (!roles.includes('admin')) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
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
  const slugs = getUserClientSlugs(session.user);
  const clientSlug = slugs[0] ?? null;
  let redirectTarget: string | null = null;
  let reason: string | null = null;

  // Client users: redirect home + enforce tenant dashboard slug.
  // IMPORTANT: This must run BEFORE any unauthorized redirects so that
  // clients never get sent to /unauthorized for "/" or "/dashboard".
  if (isClient) {
    const fence = resolveClientPageFence(pathname, slugs);
    redirectTarget = fence.redirectTarget;
    reason = fence.reason;
  }

  if (DEBUG_AUTH_ENABLED) {
    console.log('[middleware auth debug]', {
      path: pathname,
      isClient,
      redirectTarget,
      reason,
      clientSlug,
      clientSlugs: slugs,
      roles,
      isAdmin,
    });
  }

  // Fail closed: removed/unknown roles (e.g. legacy "manager") resolve to no
  // recognised role — not admin. Block staff surfaces; allow escape hatches.
  if (!redirectTarget && !isClient && !isAdmin) {
    if (
      pathname !== '/unauthorized' &&
      pathname !== '/forbidden' &&
      pathname !== '/knowledge' &&
      !pathname.startsWith('/knowledge/')
    ) {
      redirectTarget = '/unauthorized';
      reason = 'unrecognised-role';
    }
  }

  if (redirectTarget) {
    return NextResponse.redirect(new URL(redirectTarget, request.url));
  }

  // Finance sections IA (FN7 / FIN-1). Tab deep-links → section paths;
  // bare /finance → Clients billing (/finance/invoicing). Overview home retired.
  if (isAdmin && pathname === '/finance') {
    const tab = request.nextUrl.searchParams.get('tab');
    if (tab) {
      const dest = FINANCE_TAB_TO_SECTION_PATH[tab];
      if (dest) {
        const url = new URL(dest, request.url);
        // Preserve non-tab query (e.g. fmode) when present.
        for (const [k, v] of request.nextUrl.searchParams.entries()) {
          if (k === 'tab') continue;
          url.searchParams.set(k, v);
        }
        return NextResponse.redirect(url);
      }
    }
    const url = new URL('/finance/invoicing', request.url);
    for (const [k, v] of request.nextUrl.searchParams.entries()) {
      if (k === 'tab') continue;
      url.searchParams.set(k, v);
    }
    return NextResponse.redirect(url);
  }

  // Recognised staff (admin) can proceed.
  return continueResponse;
}

export const config = {
  matcher: [
    '/((?!_next/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|static/|assets/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot)).*)',
  ],
};