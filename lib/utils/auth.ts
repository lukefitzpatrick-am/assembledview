import { Auth0Client } from '@auth0/nextjs-auth0/server';
import type { User } from '@auth0/nextjs-auth0/types';
import { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { hasRole, canAccessPage, UserRole, getUserRoles, getUserClientIdentifier } from '@/lib/rbac';

// Single Auth0 client instance configured via environment variables
const auth0 = new Auth0Client();

// Server-side session helper
export async function getServerSession() {
  try {
    const session = await auth0.getSession();
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

// API route protection wrapper
export function withAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return auth0.withApiAuthRequired(async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API route error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// API route protection with role checking
export function withRoleAuth(
  requiredRoles: UserRole | UserRole[],
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return auth0.withApiAuthRequired(async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const session = await auth0.getSession(req);
      if (!session || !session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!hasRole(session.user, requiredRoles)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await handler(req, res);
    } catch (error) {
      console.error('Role-protected API route error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

// Page protection wrapper
export const withPageAuth = auth0.withPageAuthRequired.bind(auth0);

// API route protection for App Router (Next.js 13+)
export async function withApiRouteAuth(
  request: NextRequest,
  requiredRoles?: UserRole | UserRole[]
): Promise<{ user: User } | NextResponse> {
  try {
    const session = await auth0.getSession(request);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requiredRoles && !hasRole(session.user, requiredRoles)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return { user: session.user };
  } catch (error) {
    console.error('API route auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Check if user can access a specific page
export async function checkPageAccess(page: string): Promise<boolean> {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return false;
    }
    return canAccessPage(session.user, page);
  } catch (error) {
    console.error('Page access check error:', error);
    return false;
  }
}

// Get user with role information
export async function getUserWithRoles(): Promise<{ user: User; roles: string[]; client?: string | null } | null> {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return null;
    }

    const roles = getUserRoles(session.user);
    const client = getUserClientIdentifier(session.user);
    return { user: session.user, roles, client };
  } catch (error) {
    console.error('Get user with roles error:', error);
    return null;
  }
}

// Redirect to login with return URL (defaults to dashboard)
export function redirectToLogin(returnTo: string = '/dashboard'): NextResponse {
  const loginUrl = new URL('/auth/login', process.env.AUTH0_BASE_URL || 'http://localhost:3000');
  if (returnTo) {
    loginUrl.searchParams.set('returnTo', returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

// Redirect to unauthorized page
export function redirectToUnauthorized(): NextResponse {
  return NextResponse.redirect(new URL('/unauthorized', process.env.AUTH0_BASE_URL || 'http://localhost:3000'));
}

// Create error response for API routes
export function createAuthErrorResponse(message: string, status: number = 401): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Validate session and return user or redirect
export async function validateSessionOrRedirect(): Promise<{ user: User } | NextResponse> {
  try {
    const session = await auth0.getSession();
    if (!session || !session.user) {
      return redirectToLogin();
    }
    return { user: session.user };
  } catch (error) {
    console.error('Session validation error:', error);
    return redirectToLogin();
  }
}

