import { getSession, withApiAuthRequired, withPageAuthRequired } from '@auth0/nextjs-auth0';
import { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@auth0/nextjs-auth0';
import { hasRole, canAccessPage, UserRole } from '@/lib/rbac';

// Server-side session helper
export async function getServerSession() {
  try {
    const session = await getSession();
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

// API route protection wrapper
export function withAuth(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return withApiAuthRequired(async (req: NextApiRequest, res: NextApiResponse) => {
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
  return withApiAuthRequired(async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      const session = await getSession(req, res);
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
export const withPageAuth = withPageAuthRequired;

// API route protection for App Router (Next.js 13+)
export async function withApiRouteAuth(
  request: NextRequest,
  requiredRoles?: UserRole | UserRole[]
): Promise<{ user: User } | NextResponse> {
  try {
    const session = await getSession();
    
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
    const session = await getSession();
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
export async function getUserWithRoles(): Promise<{ user: User; roles: string[] } | null> {
  try {
    const session = await getSession();
    if (!session || !session.user) {
      return null;
    }

    const roles = session.user['https://assembledmedia.com/roles'] as string[] || [];
    return { user: session.user, roles };
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
    const session = await getSession();
    if (!session || !session.user) {
      return redirectToLogin();
    }
    return { user: session.user };
  } catch (error) {
    console.error('Session validation error:', error);
    return redirectToLogin();
  }
}

