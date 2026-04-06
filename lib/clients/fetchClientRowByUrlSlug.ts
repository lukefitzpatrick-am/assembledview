import axios from 'axios'
import { parseXanoListPayload } from '@/lib/api/xano'
import { getXanoClientsCollectionUrl } from '@/lib/api/xanoClients'
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
 * Full Xano client row for admin client hub detail (EditClientForm).
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
    return findClientRawByDashboardSlug(clients, target)
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
