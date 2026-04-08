import "server-only"

import type { User } from "@auth0/nextjs-auth0/types"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/cache/clientsCache"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

/**
 * Numeric Xano client ids the user may see, or `null` = unrestricted (admin / no slug claims).
 */
export async function getPacingClientScopeIds(user: User | undefined): Promise<number[] | null> {
  if (!user) return []
  const roles = getUserRoles(user)
  if (roles.includes("admin")) return null

  const tenantSlugs = getUserClientSlugs(user)
  if (tenantSlugs.length === 0) return null

  const want = new Set(tenantSlugs.map((s) => slugifyClientNameForUrl(s)).filter(Boolean))
  const rows = await loadClientsRows()
  const ids: number[] = []
  for (const raw of rows) {
    const urlSlug = slugifyClientNameForUrl(getClientDisplayName(raw))
    if (!urlSlug || !want.has(urlSlug)) continue
    const id = Number((raw as Record<string, unknown>).id)
    if (Number.isFinite(id)) ids.push(id)
  }
  return ids
}

async function loadClientsRows(): Promise<Record<string, unknown>[]> {
  const cached = getCachedClients()
  if (cached?.length) return cached as Record<string, unknown>[]
  try {
    const response = await axios.get(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL"))
    const data = response.data
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: Record<string, unknown>[] }).data
    }
  } catch {
    // fall through
  }
  return []
}
