type EnvKey = string | string[]

const DEFAULT_ENV_KEYS: string[] = ["XANO_PACING_BASE_URL", "XANO_SAVED_VIEWS_BASE_URL"]

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

export function getXanoPacingBaseUrl(keys: EnvKey = DEFAULT_ENV_KEYS): string {
  return getRequiredEnv(keys).replace(/\/$/, "")
}

export function xanoPacingUrl(path: string, keys: EnvKey = DEFAULT_ENV_KEYS): string {
  const base = getXanoPacingBaseUrl(keys)
  const trimmedPath = path.replace(/^\//, "")
  return `${base}/${trimmedPath}`
}

