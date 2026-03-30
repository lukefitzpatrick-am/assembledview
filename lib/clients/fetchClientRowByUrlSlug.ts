import axios from 'axios'
import { xanoUrl } from '@/lib/api/xano'
import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'

const apiClient = axios.create({
  timeout: Number(process.env.XANO_TIMEOUT_MS ?? 10000),
  headers: { 'Content-Type': 'application/json' },
})

/** Matches `slugifyClientName` in `lib/api/dashboard.ts` for URL segments and client names. */
function normalizeClientName(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dashboardSlugKey(segment: string): string {
  return slugifyClientNameForUrl(normalizeClientName(segment))
}

/**
 * Full Xano client row for admin client hub detail (EditClientForm).
 */
export async function fetchXanoClientRowByUrlSlug(urlSlug: string): Promise<Record<string, unknown> | null> {
  const trimmed = String(urlSlug ?? '').trim()
  if (!trimmed) return null
  const target = dashboardSlugKey(trimmed)
  if (!target) return null

  try {
    const response = await apiClient.get(xanoUrl('clients', 'XANO_CLIENTS_BASE_URL'))
    const clients = Array.isArray(response.data) ? response.data : []
    for (const raw of clients) {
      const name = getClientDisplayName(raw)
      const slugUrl = String(raw.slug || slugifyClientNameForUrl(name) || '').trim()
      if (!slugUrl && !name) continue
      const key = dashboardSlugKey(slugUrl || name)
      if (key === target) {
        return raw as Record<string, unknown>
      }
    }
    return null
  } catch (e) {
    console.error('fetchXanoClientRowByUrlSlug', e)
    return null
  }
}
