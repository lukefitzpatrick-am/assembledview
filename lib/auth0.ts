// src/lib/auth0.ts (or /lib/auth0.ts)
import { Auth0Client } from '@auth0/nextjs-auth0/server';

// Create Auth0Client with fallback values for development
export const auth0 = new Auth0Client({
  // These can come from env automatically, but provide fallbacks for development
  domain: process.env.AUTH0_DOMAIN || 'dev-placeholder.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID || 'dev-client-id',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || 'dev-client-secret',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  secret: process.env.AUTH0_SECRET || 'dev-secret-key-32-chars-long',
  authorizationParameters: {
    scope: process.env.AUTH0_SCOPE || 'openid profile email',
    // audience: process.env.AUTH0_AUDIENCE,     // Only if you have an Auth0 API
  },
});


