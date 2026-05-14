import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { getCachedClients } from "@/lib/cache/clientsCache"

/**
 * Client slug used by {@link fetchPortfolioPlan} / {@link normalisePlan} (from Xano client display name).
 * Must stay aligned with `slugifyClientName` in `lib/pacing/plan/normalisePlan.ts` and `fetchPortfolioPlan`.
 */
export function slugifyPlanClientName(value: unknown): string {
  const s = String(value ?? "").trim().toLowerCase()
  if (!s) return ""
  return s
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

function clientNameFromGetClientsRow(raw: Record<string, unknown>): string {
  return String(
    raw?.mp_client_name ??
      raw?.client_name ??
      raw?.clientname_input ??
      raw?.name ??
      ""
  ).trim()
}

async function fetchGetClientsRows(): Promise<Record<string, unknown>[]> {
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

export type ResolveClientSlugsDeps = {
  fetchRows?: () => Promise<Record<string, unknown>[]>
}

/**
 * Maps `requirePacingAccess` numeric Xano client ids (or null for admin / unscoped) to plan client slugs
 * for {@link fetchPortfolioPlan}.
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

  const fetchRows = deps?.fetchRows ?? fetchGetClientsRows
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
