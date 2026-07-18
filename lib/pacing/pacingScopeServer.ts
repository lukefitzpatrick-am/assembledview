import "server-only"

import type { User } from "@auth0/nextjs-auth0/types"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/cache/clientsCache"
import { getUserClientSlugs, getUserRoles } from "@/lib/rbac"
import axios from "axios"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

/**
 * Numeric Xano client ids the user may see, or `null` = unrestricted (admin only).
 * Non-admin with no slug claims → `[]` (fail closed / empty), not book-wide.
 */
export async function getPacingClientScopeIds(user: User | undefined): Promise<number[] | null> {
  if (!user) return []
  const roles = getUserRoles(user)
  if (roles.includes("admin")) return null

  const tenantSlugs = getUserClientSlugs(user)
  // AuthZ: no resolvable client slug → empty for non-admins (not unrestricted).
  if (tenantSlugs.length === 0) return []

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
    const response = await axios.get(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL"), {
      headers: xanoAuthHeaderRecord(),
    })
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
