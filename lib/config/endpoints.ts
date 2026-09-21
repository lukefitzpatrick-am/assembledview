/**
 * Single source for external service base URLs and the public app origin.
 * Defaults match the previous hard-coded literals; override via env.
 */

function readEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim()
  return raw || undefined
}

function withDefault(envName: string, fallback: string): string {
  return readEnv(envName) ?? fallback
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "")
}

/** ScreenshotOne take endpoint. */
export const SCREENSHOTONE_API_URL = withDefault(
  "SCREENSHOTONE_API_URL",
  "https://api.screenshotone.com/take",
)

/** Fireflies GraphQL API. */
export const FIREFLIES_GRAPHQL_URL = withDefault(
  "FIREFLIES_GRAPHQL_URL",
  "https://api.fireflies.ai/graphql",
)

/** MyHours REST API root (includes /api). */
export const MYHOURS_API_BASE = withDefault(
  "MYHOURS_API_BASE",
  "https://api2.myhours.com/api",
)

/** Microsoft Graph REST root (v1.0). */
export const MS_GRAPH_BASE_URL = withDefault(
  "MS_GRAPH_BASE_URL",
  "https://graph.microsoft.com/v1.0",
)

/**
 * Entra ID login host root (no tenant). Callers append `/{tenant}/oauth2/v2.0/token`.
 */
export const MS_LOGIN_BASE_URL = withDefault(
  "MS_LOGIN_BASE_URL",
  "https://login.microsoftonline.com",
)

/** Default client-credentials scope for Graph. */
export const MS_GRAPH_SCOPE = withDefault(
  "MS_GRAPH_SCOPE",
  "https://graph.microsoft.com/.default",
)

/** Xero OAuth token endpoint. */
export const XERO_IDENTITY_URL = withDefault(
  "XERO_IDENTITY_URL",
  "https://identity.xero.com/connect/token",
)

/** Xero Accounting API root. */
export const XERO_API_BASE = withDefault(
  "XERO_API_BASE",
  "https://api.xero.com/api.xro/2.0",
)

/** Xero classic UI host (go.xero.com). */
export const XERO_APP_BASE = withDefault("XERO_APP_BASE", "https://go.xero.com")

/**
 * Xano instance root for Metadata API export scripts.
 * Prefer `XANO_EXPORT_INSTANCE_URL`; `XANO_INSTANCE_BASE` is the legacy alias.
 */
export const XANO_EXPORT_INSTANCE_URL =
  readEnv("XANO_EXPORT_INSTANCE_URL") ??
  readEnv("XANO_INSTANCE_BASE") ??
  "https://xg4h-uyzs-dtex.a2.xano.io"

/** Facebook Graph CDN (page avatars). */
export const FACEBOOK_GRAPH_URL = withDefault(
  "FACEBOOK_GRAPH_URL",
  "https://graph.facebook.com",
)

/** Public asset host for the saving-modal GIF. */
export const APP_ASSET_BASE_URL = withDefault(
  "APP_ASSET_BASE_URL",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com",
)

/** In-memory blob store URL prefix (ingest tests / memory mode). */
export const MEMORY_BLOB_BASE_URL = withDefault(
  "MEMORY_BLOB_BASE_URL",
  "https://blob.test",
)

/**
 * Public origin for redirects, self-fetch, and signed frame URLs.
 * Order: NEXT_PUBLIC_APP_URL → AUTH0_BASE_URL → VERCEL_URL → localhost:3000 (dev only).
 */
export function resolvePublicOrigin(): string {
  const appUrl = readEnv("NEXT_PUBLIC_APP_URL")
  if (appUrl) return stripTrailingSlash(appUrl)

  const auth0 = readEnv("AUTH0_BASE_URL")
  if (auth0) return stripTrailingSlash(auth0)

  const vercel = readEnv("VERCEL_URL")
  if (vercel) {
    const withProtocol = /^https?:\/\//i.test(vercel) ? vercel : `https://${vercel}`
    return stripTrailingSlash(withProtocol)
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000"
  }

  throw new Error(
    "resolvePublicOrigin: set NEXT_PUBLIC_APP_URL, AUTH0_BASE_URL, or VERCEL_URL",
  )
}
