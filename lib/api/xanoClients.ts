import { xanoUrl } from "@/lib/api/xano"

const CLIENTS_BASE_ENV_KEYS = ["XANO_CLIENTS_BASE_URL", "XANO_BASE_URL"] as const

/** Xano `clients` table base URL (no trailing slash). Requires env like other `xanoUrl` callers. */
export function getXanoClientsCollectionUrl(): string {
  return xanoUrl("clients", [...CLIENTS_BASE_ENV_KEYS])
}

/**
 * Base URL for media plan stack endpoints (`media_plan_versions`, `media_plan_master`, …), no trailing slash.
 * Prefer `XANO_MEDIA_PLANS_BASE_URL`; otherwise use `XANO_BASE_URL` so paths resolve like `{XANO_BASE_URL}/media_plan_versions`.
 */
export function getXanoMediaPlansBaseUrl(): string {
  const explicit =
    process.env.XANO_MEDIA_PLANS_BASE_URL?.trim() ||
    process.env.XANO_MEDIAPLANS_BASE_URL?.trim()
  const fallbackBase = process.env.XANO_BASE_URL?.trim()
  const resolved = explicit || fallbackBase
  if (!resolved) {
    console.warn(
      "[xanoClients] getXanoMediaPlansBaseUrl: neither XANO_MEDIA_PLANS_BASE_URL (nor XANO_MEDIAPLANS_BASE_URL) nor XANO_BASE_URL is set; media plan API calls will fail.",
    )
    throw new Error("Missing XANO_MEDIA_PLANS_BASE_URL or XANO_BASE_URL for media plan Xano requests")
  }
  return resolved.replace(/\/$/, "")
}

/** Full URL for a media-plan API path segment (e.g. `media_plan_versions`). */
export function xanoMediaPlansUrl(path: string): string {
  const base = getXanoMediaPlansBaseUrl()
  const trimmed = path.replace(/^\//, "")
  return `${base}/${trimmed}`
}
