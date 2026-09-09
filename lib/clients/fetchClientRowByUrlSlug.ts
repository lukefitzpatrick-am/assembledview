import { parseXanoListPayload } from '@/lib/api/xano'
import type { ClientGroup } from '@/lib/clients/clientGroup'
import { resolveClientGroup } from '@/lib/clients/clientGroup'
import { omitClientBrain } from '@/lib/clients/omitClientBrain'
import { dashboardSlugKeyFromSegment } from '@/lib/clients/xanoClientSlugMatch'
import { readClientsList } from '@/lib/data/readClients'

function stripGroupBrain(group: ClientGroup): ClientGroup {
  return {
    ...group,
    anchor: omitClientBrain(group.anchor),
    members: group.members.map((member) => omitClientBrain(member)),
  }
}

async function loadClientGroupByUrlSlug(urlSlug: string): Promise<ClientGroup | null> {
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
    const rows = parseXanoListPayload(result.body)
    const group = resolveClientGroup(rows, trimmed)
    return group ? stripGroupBrain(group) : null
  } catch (e: any) {
    const msg = e?.message != null ? String(e.message) : String(e)
    console.error('[dashboard] fetchXanoClientRowByUrlSlug catch:', {
      message: msg,
      err: e,
    })
    return null
  }
}

/**
 * List-safe client row for slug resolution (brain blob stripped).
 * Reads via `readClientsList` (DATA_BACKEND_CLIENTS / Postgres when cut over).
 * Resolves through `resolveClientGroup` so `clients.slug`, the name slug and the
 * mbaidentifier slug all identify the same group; returns `group.anchor`.
 * For full profile including `client_brain`, follow with `fetchClientById`.
 */
export async function fetchXanoClientRowByUrlSlug(urlSlug: string): Promise<Record<string, unknown> | null> {
  const group = await loadClientGroupByUrlSlug(urlSlug)
  return group ? group.anchor : null
}

/**
 * Whole `ClientGroup` for a URL slug (brain stripped from every member).
 * Same resolution as `fetchXanoClientRowByUrlSlug`.
 */
export async function fetchClientGroupByUrlSlug(urlSlug: string): Promise<ClientGroup | null> {
  return loadClientGroupByUrlSlug(urlSlug)
}
