type EnvKey = string | string[]

const DEFAULT_ENV_KEYS: string[] = ["XANO_BASE_URL"]

function asArray(keys: EnvKey | undefined): string[] {
  if (!keys) return DEFAULT_ENV_KEYS
  return Array.isArray(keys) ? keys : [keys]
}

function getRequiredEnv(keys: EnvKey): string {
  const candidates = asArray(keys)
  const isServer = typeof window === "undefined"
  for (const key of candidates) {
    const value = process.env[key]
    if (value) return value
  }
  if (!isServer) {
    return ""
  }
  throw new Error(`Missing required environment variable: ${candidates.join(" or ")}`)
}

export function getXanoBaseUrl(keys: EnvKey = DEFAULT_ENV_KEYS): string {
  return getRequiredEnv(keys).replace(/\/$/, "")
}

export function xanoUrl(path: string, keys: EnvKey = DEFAULT_ENV_KEYS): string {
  const base = getXanoBaseUrl(keys)
  const trimmedPath = path.replace(/^\//, "")
  return `${base}/${trimmedPath}`
}

/**
 * Normalizes Xano list responses: bare array `[{...}]` or wrapped
 * `{ data: [...] }`, `{ items: [...] }`, `{ result: [...] }`.
 */
/** Returns a list; items are untyped (Xano row shapes vary by endpoint). */
export function parseXanoListPayload(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if (Array.isArray(p.data)) return p.data
    if (Array.isArray(p.items)) return p.items
    if (Array.isArray(p.result)) return p.result
    // Some stacks nest once, e.g. { data: { items: [...] } }
    const innerData = p.data
    if (innerData && typeof innerData === "object") {
      const d = innerData as Record<string, unknown>
      if (Array.isArray(d.items)) return d.items
      if (Array.isArray(d.result)) return d.result
      if (Array.isArray(d.data)) return d.data
    }
  }
  return []
}

export function xanoAuthHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}

export function xanoPostHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(process.env.XANO_API_KEY ? { Authorization: `Bearer ${process.env.XANO_API_KEY}` } : {}),
  }
}
