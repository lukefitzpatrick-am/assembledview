import { apiClient } from "@/lib/api"
import { getXanoClientsCollectionUrl, parseXanoListPayload } from "@/lib/api/xano"
import { resolveClientGroup } from "@/lib/clients/clientGroup"
import { omitClientBrain } from "@/lib/clients/omitClientBrain"

/**
 * Fetch a single clients-collection row by dashboard URL slug.
 * Resolves via `resolveClientGroup` so mbaidentifier-slugs (e.g. "penfold") and
 * name-slugs (e.g. "penfolds") both return the group **anchor** — same branding
 * source as `getClientDashboardData` (`clientName` / `brandColour`).
 *
 * Returns null when the slug does not match any client (exact, then fuzzy).
 * Strips `client_brain` / `clientBrain` before returning.
 */
export async function fetchXanoClientRowByUrlSlug(
  slug: string
): Promise<Record<string, unknown> | null> {
  const trimmed = typeof slug === "string" ? slug.trim() : ""
  if (!trimmed) return null

  try {
    const clientsUrl = getXanoClientsCollectionUrl()
    const clientsResponse = await apiClient.get(clientsUrl)
    const clients = parseXanoListPayload(clientsResponse.data)
    const group = resolveClientGroup(clients, trimmed)
    if (!group) return null
    return omitClientBrain(group.anchor as Record<string, unknown>)
  } catch {
    return null
  }
}
