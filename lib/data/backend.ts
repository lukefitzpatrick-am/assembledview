/**
 * Phase 2 data-backend switch for shadow-read cutover.
 * Default remains Xano until a domain is flipped to `postgres`.
 *
 * Per-domain override: `DATA_BACKEND_<DOMAIN>` (e.g. `DATA_BACKEND_PUBLISHERS`)
 * falls back to global `DATA_BACKEND`, then `xano`.
 */
export type DataBackend = "xano" | "shadow" | "postgres"

export type DataBackendDomain =
  | "reference"
  | "publishers"
  | "clients"
  | "kpi"
  | "finance"
  | "pacing"
  | "pacing"

function parseDataBackend(raw: string | undefined): DataBackend {
  const v = (raw ?? "xano").trim().toLowerCase()
  if (v === "shadow" || v === "postgres") return v
  return "xano"
}

/** Global `DATA_BACKEND` (default `xano`). */
export function getDataBackend(): DataBackend {
  return parseDataBackend(process.env.DATA_BACKEND)
}

/**
 * Domain-scoped backend. Env `DATA_BACKEND_<DOMAIN>` (uppercased) overrides
 * global `DATA_BACKEND` when set to a non-empty value.
 */
export function getDataBackendFor(domain: DataBackendDomain | string): DataBackend {
  const key = `DATA_BACKEND_${String(domain).trim().toUpperCase()}`
  const specific = process.env[key]
  if (specific != null && specific.trim() !== "") {
    return parseDataBackend(specific)
  }
  return getDataBackend()
}
