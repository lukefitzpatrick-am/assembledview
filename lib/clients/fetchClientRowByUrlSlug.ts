import axios from 'axios'
import { parseXanoListPayload } from '@/lib/api/xano'
import { getXanoClientsCollectionUrl } from '@/lib/api/xanoClients'
import { dashboardSlugKeyFromSegment, findClientRawByDashboardSlug } from '@/lib/clients/xanoClientSlugMatch'

const apiClient = axios.create({
  timeout: Number(process.env.XANO_TIMEOUT_MS ?? 10000),
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Full Xano client row for admin client hub detail (EditClientForm).
 */
export async function fetchXanoClientRowByUrlSlug(urlSlug: string): Promise<Record<string, unknown> | null> {
  const trimmed = String(urlSlug ?? '').trim()
  if (!trimmed) return null
  const target = dashboardSlugKeyFromSegment(trimmed)
  if (!target) return null

  try {
    const response = await apiClient.get(getXanoClientsCollectionUrl())
    const clients = parseXanoListPayload(response.data)
    return findClientRawByDashboardSlug(clients, target)
  } catch (e) {
    console.error('fetchXanoClientRowByUrlSlug', e)
    return null
  }
}
