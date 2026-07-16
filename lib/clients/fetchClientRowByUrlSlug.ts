import axios from 'axios'
import { parseXanoListPayload } from '@/lib/api/xano'
import { getXanoClientsCollectionUrl } from '@/lib/api/xanoClients'
import { omitClientBrain } from '@/lib/clients/omitClientBrain'
import { dashboardSlugKeyFromSegment, findClientRawByDashboardSlug } from '@/lib/clients/xanoClientSlugMatch'

const apiClient = axios.create({
  timeout: Number(process.env.XANO_TIMEOUT_MS ?? 10000),
  headers: { 'Content-Type': 'application/json' },
})

function xanoResponseBodyPreview(data: unknown): string {
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data)
    return s.length > 200 ? `${s.slice(0, 200)}...` : s
  } catch {
    return '[unserializable]'
  }
}

/**
 * List-safe Xano client row for slug resolution (brain blob stripped).
 * For full profile including `client_brain`, follow with `fetchClientById`.
 */
export async function fetchXanoClientRowByUrlSlug(urlSlug: string): Promise<Record<string, unknown> | null> {
  const trimmed = String(urlSlug ?? '').trim()
  if (!trimmed) return null
  const target = dashboardSlugKeyFromSegment(trimmed)
  if (!target) return null

  const url = getXanoClientsCollectionUrl()
  try {
    const response = await apiClient.get(url)
    const clients = parseXanoListPayload(response.data)
    const match = findClientRawByDashboardSlug(clients, target)
    if (!match || typeof match !== 'object') return null
    return omitClientBrain(match as Record<string, unknown>)
  } catch (e: any) {
    const msg = e?.message != null ? String(e.message) : String(e)
    console.error('[dashboard] fetchXanoClientRowByUrlSlug catch:', {
      message: msg,
      failedUrl: url,
      responseStatus: e?.response?.status,
      responseBodyPreview:
        e?.response?.data != null ? xanoResponseBodyPreview(e.response.data) : undefined,
      err: e,
    })
    return null
  }
}
