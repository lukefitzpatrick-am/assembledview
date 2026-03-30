import { xanoUrl } from "@/lib/api/xano"

const CLIENTS_BASE_ENV_KEYS = ["XANO_CLIENTS_BASE_URL", "XANO_BASE_URL"] as const

/** Xano `clients` table base URL (no trailing slash). Requires env like other `xanoUrl` callers. */
export function getXanoClientsCollectionUrl(): string {
  return xanoUrl("clients", [...CLIENTS_BASE_ENV_KEYS])
}
