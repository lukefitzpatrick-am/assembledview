import { parseXanoListPayload } from '@/lib/api/xano'
import { omitClientBrain } from '@/lib/clients/omitClientBrain'
import { dashboardSlugKeyFromSegment, findClientRawByDashboardSlug } from '@/lib/clients/xanoClientSlugMatch'
import { readClientsList } from '@/lib/data/readClients'

/**
 * List-safe client row for slug resolution (brain blob stripped).
 * Reads via `readClientsList` (DATA_BACKEND_CLIENTS / Postgres when cut over).
 * For full profile including `client_brain`, follow with `fetchClientById`.
 */
export async function fetchXanoClientRowByUrlSlug(urlSlug: string): Promise<Record<string, unknown> | null> {
  const trimmed = String(urlSlug ?? '').trim()
  if (!trimmed) return null
  const target = dashboardSlugKeyFromSegment(trimmed)
  if (!target) return null

  try {
    const result = await readClientsList()
    if (result.status < 200 || result.status >= 300) {
      console.error('[dashboard] fetchXanoClientRowByUrlSlug upstream status', {
        status: result.status,
      })
      return null
    }
    const clients = parseXanoListPayload(result.body)
    const match = findClientRawByDashboardSlug(clients, target)
    if (!match || typeof match !== 'object') return null
    return omitClientBrain(match as Record<string, unknown>)
  } catch (e: any) {
    const msg = e?.message != null ? String(e.message) : String(e)
    console.error('[dashboard] fetchXanoClientRowByUrlSlug catch:', {
      message: msg,
      err: e,
    })
    return null
  }
}
