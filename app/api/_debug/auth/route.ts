import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

const ROLE_CLAIMS = ['https://assembledview.com/roles', 'https://assembledview.com.au/roles'];
const CLIENT_CLAIMS = ['https://assembledview.com/client', 'https://assembledview.com.au/client'];

export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request);
  const user = session?.user;

  let accessTokenPresent = false;
  try {
    const tokenResult = await auth0.getAccessToken();
    accessTokenPresent = Boolean(
      (tokenResult as Record<string, unknown>)?.accessToken ??
        (tokenResult as Record<string, unknown>)?.token
    );
  } catch (err) {
    accessTokenPresent = false;
  }

  const rolesClaim =
    user &&
    (ROLE_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);
  const clientClaim =
    user &&
    (CLIENT_CLAIMS.map((claim) => (user as Record<string, unknown>)[claim]).find((val) => val !== undefined) ??
      null);

  return NextResponse.json({
    hasSession: Boolean(session),
    accessTokenPresent,
    userKeys: user ? Object.keys(user) : [],
    rolesClaim: rolesClaim ?? null,
    clientClaim: clientClaim ?? null,
  });
}

