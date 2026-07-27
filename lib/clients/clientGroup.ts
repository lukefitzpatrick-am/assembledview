import { slugifyClientName } from '@/lib/api/dashboard/shared'
import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'
import {
  dashboardSlugKeyFromSegment,
  findClientRawByDashboardSlug,
} from '@/lib/clients/xanoClientSlugMatch'

export type ClientGroup = {
  /** The requested row (branding source). */
  anchor: Record<string, unknown>
  /** Anchor + siblings sharing the exact mbaidentifier. */
  members: Record<string, unknown>[]
  mbaidentifier: string | null
  /** Union of name slugs, built with slugifyClientName (version-filter fn). */
  nameSlugs: Set<string>
}

function findClientRawByMbaidentifierSlug(
  rows: unknown[],
  targetKey: string
): Record<string, unknown> | null {
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const mba = String(r.mbaidentifier ?? '').trim()
    if (!mba) continue
    if (slugifyClientNameForUrl(mba) === targetKey) {
      return r
    }
  }
  return null
}

/**
 * Groups client rows that share an exact mbaidentifier with the row resolved
 * from `requestedSlug` (name/slug key or mbaidentifier-slug).
 *
 * mbaidentifier equality is trim + case-insensitive exact match only —
 * never startsWith / includes / prefix.
 */
export function resolveClientGroup(
  rows: unknown[],
  requestedSlug: string
): ClientGroup | null {
  if (!Array.isArray(rows)) return null

  const key = dashboardSlugKeyFromSegment(requestedSlug)
  if (!key) return null

  // Prefer name/slug match; fall back to mbaidentifier-slug match.
  const anchor =
    findClientRawByDashboardSlug(rows, key) ??
    findClientRawByMbaidentifierSlug(rows, key)
  if (!anchor) return null

  const id = String(anchor.mbaidentifier ?? '').trim()
  let members: Record<string, unknown>[]
  if (id) {
    const idLower = id.toLowerCase()
    members = rows.filter((raw) => {
      if (!raw || typeof raw !== 'object') return false
      const v = String((raw as Record<string, unknown>).mbaidentifier ?? '').trim()
      return v.length > 0 && v.toLowerCase() === idLower
    }) as Record<string, unknown>[]
  } else {
    members = [anchor]
  }

  // Ensure the anchor is always included.
  if (!members.includes(anchor)) {
    members = [anchor, ...members]
  }

  const nameSlugs = new Set(
    members
      .map((r) => slugifyClientName(getClientDisplayName(r)))
      .filter(Boolean)
  )
  // Belt & braces: always include the anchor's name slug.
  const anchorSlug = slugifyClientName(getClientDisplayName(anchor))
  if (anchorSlug) nameSlugs.add(anchorSlug)

  return {
    anchor,
    members,
    mbaidentifier: id.length > 0 ? id : null,
    nameSlugs,
  }
}
