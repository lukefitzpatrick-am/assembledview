import { auth0 } from '@/lib/auth0';

// Catch-all Auth0 routes (login/logout/callback/profile/access-token)
const handler = auth0.middleware.bind(auth0);

export { handler as GET, handler as POST };


