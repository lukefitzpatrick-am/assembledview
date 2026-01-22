import { NextRequest, NextResponse } from 'next/server';
import { getUserClientIdentifier, getUserRoles, UserRole } from './rbac';
import { auth0 } from './auth0';

type RequireRoleOptions = {
  allowEmails?: string[];
};

type RequireRoleSuccess = {
  session: Awaited<ReturnType<typeof auth0.getSession>>;
  roles: UserRole[];
  clientSlug: string | null;
  grantedByAllowlist: boolean;
};

type RequireRoleFailure = {
  response: NextResponse;
};

function normalizeEmail(email?: string | null): string | null {
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

function isAllowlisted(email: string | null, allowEmails: string[] = []): boolean {
  if (!email || allowEmails.length === 0) return false;
  const normalized = email.toLowerCase();
  return allowEmails.some((entry) => entry.toLowerCase() === normalized);
}

export async function requireRole(
  req: NextRequest,
  requiredRole: UserRole | UserRole[] = 'admin',
  options: RequireRoleOptions = {}
): Promise<RequireRoleSuccess | RequireRoleFailure> {
  const session = await auth0.getSession(req);

  if (!session || !session.user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const roles = getUserRoles(session.user);
  const clientSlug = getUserClientIdentifier(session.user);
  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  const hasRequiredRole = required.some((role) => roles.includes(role));
  const grantedByAllowlist = isAllowlisted(
    normalizeEmail(session.user.email),
    options.allowEmails || []
  );

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true') {
    console.log('[requireRole auth debug]', {
      required,
      roles,
      clientSlug,
      grantedByAllowlist,
      email: session.user.email,
    });
  }

  if (!hasRequiredRole && !grantedByAllowlist) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { session, roles, clientSlug, grantedByAllowlist };
}

export async function requireAdmin(
  req: NextRequest,
  options: RequireRoleOptions = {}
): Promise<RequireRoleSuccess | RequireRoleFailure> {
  return requireRole(req, 'admin', options);
}








