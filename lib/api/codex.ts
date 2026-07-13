import { getXanoBaseUrl, xanoUrl } from "@/lib/api/xano"

const CODEX_ENV_KEYS = ["XANO_CODEX_BASE_URL"] as const

/** Base URL for the Xano "codex" API group (tasks + client notes), no trailing slash. */
export function getCodexBaseUrl(): string {
  return getXanoBaseUrl([...CODEX_ENV_KEYS])
}

/** Full URL for a codex API path segment (e.g. `tasks`, `client_notes`). */
export function codexUrl(path: string): string {
  return xanoUrl(path, [...CODEX_ENV_KEYS])
}
