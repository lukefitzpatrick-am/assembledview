/**
 * Maps pacing AuthZ ids to plan client slugs. Catalog I/O lives here;
 * the slugifier is `slugifyPlanClientName.ts` so client cards never import this file.
 */
export {
  buildPlanSlugToClientIdMap,
  clientNameFromGetClientsRow,
  slugifyPlanClientName,
} from "./slugifyPlanClientName"

import {
  clientNameFromGetClientsRow,
  slugifyPlanClientName,
} from "./slugifyPlanClientName"

/** Client catalog rows (uses clients cache when warm; cold path → readClientsList / T2a). */
export async function fetchPacingClientCatalogRows(): Promise<Record<string, unknown>[]> {
  const { getCachedClients, getCachedClientsList } = await import("@/lib/cache/clientsCache")
  const cached = getCachedClients()
  if (cached?.length) return cached as Record<string, unknown>[]
  try {
    const { data } = await getCachedClientsList()
    return (data ?? []) as Record<string, unknown>[]
  } catch {
    return []
  }
}

export type ResolveClientSlugsDeps = {
  fetchRows?: () => Promise<Record<string, unknown>[]>
}

/**
 * Maps `requirePacingAccess` numeric Xano client ids (or null for admin / unscoped) to plan client slugs.
 *
 * - `null` → all clients from `get_clients`
 * - `[]` → `[]` (no Xano call)
 * - `[id, …]` → slugs for those ids only
 */
export async function resolveClientSlugs(
  allowedClientIds: number[] | null,
  deps?: ResolveClientSlugsDeps
): Promise<string[]> {
  if (allowedClientIds !== null && allowedClientIds.length === 0) {
    return []
  }

  const fetchRows = deps?.fetchRows ?? fetchPacingClientCatalogRows
  const rows = await fetchRows()
  const want = allowedClientIds === null ? null : new Set(allowedClientIds)

  const slugSet = new Set<string>()
  for (const raw of rows) {
    const id = Number(raw.id)
    if (!Number.isFinite(id)) continue
    if (want !== null && !want.has(id)) continue
    const slug = slugifyPlanClientName(clientNameFromGetClientsRow(raw))
    if (slug) slugSet.add(slug)
  }
  return [...slugSet].sort()
}
