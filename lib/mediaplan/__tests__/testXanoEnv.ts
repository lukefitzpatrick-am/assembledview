/**
 * Stub Xano env vars so `lib/api.ts` can load in Node test runs without `.env.local`.
 * Must be imported before any `@/lib/api` import.
 */
process.env.XANO_PUBLISHERS_BASE_URL ??= "http://localhost/test"
process.env.XANO_CLIENTS_BASE_URL ??= "http://localhost/test"
process.env.XANO_MEDIA_DETAILS_BASE_URL ??= "http://localhost/test"
process.env.XANO_MEDIA_PLANS_BASE_URL ??= "http://localhost/test"
