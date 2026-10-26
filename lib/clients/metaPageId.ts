/**
 * Client-safe Meta page id lookup for creative avatars and mockups.
 * Reads the client's platform accounts (admin route) and picks the meta_page
 * account. Falls back to the legacy clients.idmeta value when there is none,
 * the route is not ready, or the request fails.
 */
import { pickMetaPageId } from "@/lib/clients/platformAccounts"

type FetchLike = (input: string) => Promise<{
  ok: boolean
  json: () => Promise<unknown>
}>

export async function fetchMetaPageIdForClient(
  clientId: number | null | undefined,
  legacyIdmeta: unknown,
  fetchImpl: FetchLike = (input) => fetch(input),
): Promise<string> {
  const legacy = pickMetaPageId(null, legacyIdmeta)
  if (typeof clientId !== "number" || !Number.isInteger(clientId) || clientId <= 0) return legacy
  try {
    const res = await fetchImpl(`/api/clients/${clientId}/platform-accounts`)
    if (!res.ok) return legacy
    const body = (await res.json()) as { accounts?: unknown } | null
    const accounts = Array.isArray(body?.accounts)
      ? (body.accounts as Array<{ platform: string; accountRef: string; active?: boolean | null }>)
      : null
    return pickMetaPageId(accounts, legacyIdmeta)
  } catch {
    return legacy
  }
}
