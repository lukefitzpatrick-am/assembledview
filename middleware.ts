import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Auth0's server SDK pulls in Node-only modules that are incompatible with the Edge
// runtime used by Next.js middleware. To keep deployments working, we bypass the
// middleware integration here and let route-level guards enforce access control.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
};