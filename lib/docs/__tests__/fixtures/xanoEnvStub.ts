/**
 * containerChannelConfig → lib/api.ts reads Xano base URLs at module load.
 * Tests that hydrate via mapHydrationToForm need these present; they are never fetched.
 */
process.env.XANO_PUBLISHERS_BASE_URL ??= "https://xano.invalid"
process.env.XANO_CLIENTS_BASE_URL ??= "https://xano.invalid"
process.env.XANO_MEDIA_DETAILS_BASE_URL ??= "https://xano.invalid"
process.env.XANO_MEDIA_PLANS_BASE_URL ??= "https://xano.invalid"
process.env.XANO_MEDIAPLANS_BASE_URL ??= "https://xano.invalid"
