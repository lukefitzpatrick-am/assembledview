// src/lib/auth0.ts (or /lib/auth0.ts)
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { CLIENT_CLAIMS, CLIENT_SLUGS_CLAIMS, CLIENT_SLUG_CLAIMS, ROLE_CLAIMS } from './auth0-claims';

// Fail fast if required environment variables are missing
['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL'].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing env: ${key}`);
  }
});

const missingAudience = !process.env.AUTH0_AUDIENCE;
if (missingAudience) {
  console.warn(
    'AUTH0_AUDIENCE is not set; audience affects the access token. Custom claims need an Auth0 Action to add roles/client claims to the ID token/session.'
  );
}

export const baseAuthParams = {
  scope: process.env.AUTH0_SCOPE || 'openid profile email',
  audience: process.env.AUTH0_AUDIENCE,
};

export const auth0 = new Auth0Client({
  authorizationParameters: baseAuthParams,
  // Persist custom claims from the ID token/Action onto the session.user object
  async beforeSessionSaved(session) {
    const user = session.user || {};

    for (const claim of ROLE_CLAIMS) {
      const value = (user as Record<string, unknown>)[claim];
      if (value !== undefined) {
        (session.user as Record<string, unknown>)[claim] = value;
        break;
      }
    }

    for (const claim of CLIENT_SLUG_CLAIMS) {
      const value = (user as Record<string, unknown>)[claim];
      if (value !== undefined) {
        (session.user as Record<string, unknown>)[claim] = value;
        break;
      }
    }

    for (const claim of CLIENT_SLUGS_CLAIMS) {
      const value = (user as Record<string, unknown>)[claim];
      if (value !== undefined) {
        (session.user as Record<string, unknown>)[claim] = value;
        break;
      }
    }

    for (const claim of CLIENT_CLAIMS) {
      const value = (user as Record<string, unknown>)[claim];
      if (value !== undefined) {
        (session.user as Record<string, unknown>)[claim] = value;
        break;
      }
    }

    // Custom role/client claims must be added by an Auth0 Post-Login Action
    // with namespaced keys (https://assembledview.com/...); they appear on
    // session.user only if present on the ID token or persisted here.
    return session;
  },
});
