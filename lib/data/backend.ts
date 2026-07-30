/**
 * Phase 2 data-backend switch for shadow-read cutover.
 * Default remains Xano until a domain is flipped to `postgres`.
 */
export type DataBackend = "xano" | "shadow" | "postgres"

export function getDataBackend(): DataBackend {
  const raw = (process.env.DATA_BACKEND ?? "xano").trim().toLowerCase()
  if (raw === "shadow" || raw === "postgres") return raw
  return "xano"
}
