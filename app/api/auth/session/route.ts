import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

// TEMP: Dev-only session inspection. Do NOT ship to production.
const ROLE_CLAIMS = ['https://assembledview.com/roles', 'https://assembledview.com.au/roles'];
const CLIENT_CLAIMS = ['https://assembledview.com/client', 'https://assembledview.com.au/client'];
const CLIENT_SLUG_CLAIMS = ['https://assembledview.com/client_slug', 'https://assembledview.com.au/client_slug'];
const CLIENT_SLUGS_CLAIMS = ['https://assembledview.com/client_slugs', 'https://assembledview.com.au/client_slugs'];

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request);

  const user = session?.user ?? null;
  const rolesClaim =
    user &&
    (ROLE_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);
  const clientClaim =
    user &&
    (CLIENT_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);
  const clientSlugClaim =
    user &&
    (CLIENT_SLUG_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);
  const clientSlugsClaim =
    user &&
    (CLIENT_SLUGS_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);

  let accessTokenPresent = false;
  try {
    const tokenResponse = await auth0.getAccessToken();
    accessTokenPresent = Boolean(
      (tokenResponse as Record<string, unknown>)?.accessToken ??
        (tokenResponse as Record<string, unknown>)?.token
    );
  } catch (err) {
    accessTokenPresent = false;
  }

  return NextResponse.json({
    hasSession: Boolean(session),
    accessTokenPresent,
    user,
    rolesClaimPresent: Boolean(rolesClaim),
    clientClaimPresent: Boolean(clientClaim),
    clientSlugClaimPresent: Boolean(clientSlugClaim),
    clientSlugsClaimPresent: Boolean(clientSlugsClaim),
  });
}
