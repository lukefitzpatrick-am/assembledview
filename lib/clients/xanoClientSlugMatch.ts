import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'

/** Aligns with `normalizeClientName` in `lib/api/dashboard.ts`. */
export function normalizeClientNameForDashboardSlug(name: string): string {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Canonical dashboard URL key for a path segment or display name. */
export function dashboardSlugKeyFromSegment(segment: string): string {
  return slugifyClientNameForUrl(normalizeClientNameForDashboardSlug(segment))
}

/**
 * Finds a Xano client row whose slug key matches `targetKey` (from `slugifyClientName` / hub URLs).
 */
export function findClientRawByDashboardSlug(
  rows: unknown[],
  targetKey: string
): Record<string, unknown> | null {
  if (!targetKey || !Array.isArray(rows)) return null
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = getClientDisplayName(r)
    const slugUrl = String(r.slug || slugifyClientNameForUrl(name) || '').trim()
    if (!slugUrl && !name) continue
    const key = dashboardSlugKeyFromSegment(slugUrl || name)
    if (key === targetKey) {
      return r as Record<string, unknown>
    }
  }
  return null
}
