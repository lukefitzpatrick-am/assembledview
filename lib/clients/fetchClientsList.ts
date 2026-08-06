/**
 * Browser GET `/api/clients` with fail-soft header awareness.
 *
 * Own fetch path (not `coalescedGetJson`): coalesced caches parsed JSON only and
 * drops headers, so callers cannot see `x-warning`. Clients is the one endpoint
 * where empty-vs-broken is decided by that header — keep the signal on this path.
 *
 * Header contract (`app/api/clients/route.ts`):
 * - `clients-unavailable` + empty body → upstream threw; NOT a healthy empty list
 * - `served-stale-after-upstream-failure` + non-empty body → degraded but usable
 * - no warning + `[]` → genuine empty tenant; treat as success
 */

export const CLIENTS_UNAVAILABLE_WARNING = "clients-unavailable" as const
export const CLIENTS_SERVED_STALE_WARNING =
  "served-stale-after-upstream-failure" as const

export const CLIENTS_LIST_UNAVAILABLE_MESSAGE =
  "Client list unavailable — try again"

export type FetchClientsListOk<T> = {
  ok: true
  data: T[]
  /** Present when body is stale-but-usable after upstream failure. */
  warning: typeof CLIENTS_SERVED_STALE_WARNING | null
}

export type FetchClientsListErr = {
  ok: false
  data: []
  warning: typeof CLIENTS_UNAVAILABLE_WARNING | "http-error" | "network-error"
  message: string
}

export type FetchClientsListResult<T = Record<string, unknown>> =
  | FetchClientsListOk<T>
  | FetchClientsListErr

export type ClientsListUiState<T> = {
  clients: T[]
  clientsError: string | null
  /** True when save/create must not proceed (fail-soft or hard fetch failure). */
  saveBlocked: boolean
}

/** Map a fetch result into the UI/save-gate shape every converted consumer uses. */
export function applyClientsFetchResult<T>(
  result: FetchClientsListResult<T>
): ClientsListUiState<T> {
  if (!result.ok) {
    return {
      clients: [],
      clientsError: result.message,
      saveBlocked: true,
    }
  }
  return {
    clients: result.data,
    clientsError: null,
    saveBlocked: false,
  }
}

export async function fetchClientsList<T = Record<string, unknown>>(
  init?: RequestInit
): Promise<FetchClientsListResult<T>> {
  try {
    const res = await fetch("/api/clients", {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    })
    const warningRaw = res.headers.get("x-warning")
    const warning = warningRaw?.trim() || null

    if (!res.ok) {
      return {
        ok: false,
        data: [],
        warning: "http-error",
        message: CLIENTS_LIST_UNAVAILABLE_MESSAGE,
      }
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        data: [],
        warning: "http-error",
        message: CLIENTS_LIST_UNAVAILABLE_MESSAGE,
      }
    }

    const list = Array.isArray(data) ? (data as T[]) : null
    if (list == null) {
      return {
        ok: false,
        data: [],
        warning: "http-error",
        message: CLIENTS_LIST_UNAVAILABLE_MESSAGE,
      }
    }

    // Fail-soft empty: never treat as a healthy zero-client tenant.
    if (warning === CLIENTS_UNAVAILABLE_WARNING) {
      return {
        ok: false,
        data: [],
        warning: CLIENTS_UNAVAILABLE_WARNING,
        message: CLIENTS_LIST_UNAVAILABLE_MESSAGE,
      }
    }

    const staleWarning =
      warning === CLIENTS_SERVED_STALE_WARNING
        ? CLIENTS_SERVED_STALE_WARNING
        : null

    return {
      ok: true,
      data: list,
      warning: staleWarning,
    }
  } catch {
    return {
      ok: false,
      data: [],
      warning: "network-error",
      message: CLIENTS_LIST_UNAVAILABLE_MESSAGE,
    }
  }
}
