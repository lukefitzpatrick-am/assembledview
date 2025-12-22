// src/lib/auth0.ts (or /lib/auth0.ts)
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';

// Fail fast if required environment variables are missing
['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL'].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing env: ${key}`);
  }
});

export const auth0 = new Auth0Client({
  // SDK will use APP_BASE_URL and AUTH0_DOMAIN from environment variables
  authorizationParameters: {
    scope: process.env.AUTH0_SCOPE || 'openid profile email',
    audience: process.env.AUTH0_AUDIENCE,
  },
  async onCallback(error) {
    if (error) {
      return NextResponse.redirect(new URL('/error', process.env.APP_BASE_URL));
    }
    return NextResponse.redirect(new URL('/dashboard', process.env.APP_BASE_URL));
  },
});
