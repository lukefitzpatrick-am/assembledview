// src/lib/auth0.ts (or /lib/auth0.ts)
import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Fail fast if required environment variables are missing
['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL'].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing env: ${key}`);
  }
});

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  appBaseUrl: process.env.APP_BASE_URL!,
  secret: process.env.AUTH0_SECRET!,
  routes: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    callback: '/api/auth/callback',
    profile: '/api/auth/me',
    accessToken: '/api/auth/access-token',
    backChannelLogout: '/api/auth/backchannel-logout',
    connectAccount: '/api/auth/connect',
  },
  authorizationParameters: {
    scope: process.env.AUTH0_SCOPE || 'openid profile email',
    audience: process.env.AUTH0_AUDIENCE,
  },
});
