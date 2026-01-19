import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from './auth0';
import { getAllowedClientSlugs, getRoles } from './auth0-claims';

type RequireTenantAccessResult =
  | { ok: true; session: Awaited<ReturnType<typeof auth0.getSession>>; allowedSlugs?: string[] }
  | { ok: false; status: number };

/**
 * Enforces tenant isolation for API route handlers.
 */
export async function requireTenantAccess(
  request: NextRequest,
  response?: NextResponse,
  routeSlug?: string
): Promise<RequireTenantAccessResult> {
  const session = await auth0.getSession(request, response ?? NextResponse.next());

  if (!session) {
    return { ok: false, status: 401 };
  }

  const roles = getRoles(session.user);

  // Non-client users bypass tenant restrictions
  if (!roles.includes('client')) {
    return { ok: true, session };
  }

  const allowedSlugs = getAllowedClientSlugs(session.user);

  if (!allowedSlugs.length) {
    return { ok: false, status: 403 };
  }

  if (routeSlug && !allowedSlugs.includes(routeSlug)) {
    return { ok: false, status: 403 };
  }

  return { ok: true, session, allowedSlugs };
}

/**
 * Example usage (Route Handler):
 *
 * // app/api/client/[slug]/route.ts
 * import { NextResponse } from 'next/server';
 * import { requireTenantAccess } from '@/lib/tenant-guard';
 *
 * export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
 *   const guard = await requireTenantAccess(request, undefined, params.slug);
 *   if (!guard.ok) return NextResponse.json({ error: 'forbidden' }, { status: guard.status });
 *
 *   // ... proceed knowing params.slug is permitted for this user
 * }
 */
