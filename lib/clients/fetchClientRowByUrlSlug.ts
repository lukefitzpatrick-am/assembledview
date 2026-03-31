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
  console.log('[dashboard] fetchXanoClientRowByUrlSlug called with urlSlug:', urlSlug, 'ENV check:', {
    XANO_BASE_URL: !!process.env.XANO_BASE_URL,
    XANO_MEDIA_PLANS_BASE_URL: !!process.env.XANO_MEDIA_PLANS_BASE_URL,
    XANO_CLIENTS_COLLECTION_URL: !!process.env.XANO_CLIENTS_COLLECTION_URL,
  })
  const trimmed = String(urlSlug ?? '').trim()
  if (!trimmed) return null
  const target = dashboardSlugKeyFromSegment(trimmed)
  if (!target) return null

  const url = getXanoClientsCollectionUrl()
  console.error('[dashboard] fetchXanoClientRowByUrlSlug: constructed Xano URL:', url)
  try {
    console.error('[dashboard] Attempting fetch to:', url)
    const response = await apiClient.get(url)
    console.error('[dashboard] fetchXanoClientRowByUrlSlug response:', {
      url,
      status: response.status,
      bodyPreview: xanoResponseBodyPreview(response.data),
    })
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
