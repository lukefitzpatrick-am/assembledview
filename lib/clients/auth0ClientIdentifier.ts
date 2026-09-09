import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'

/**
 * Canonical tenant id for Auth0 `app_metadata.client_slug` (and related claims).
 * Never use the numeric Xano `id`. Prefers `clients.slug`, then the name-based slug.
 * Does not use `mbaidentifier`.
 */
export function resolveAuth0ClientIdentifier(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null

  const storedSlug = String((raw as { slug?: unknown }).slug ?? '').trim().toLowerCase()
  if (storedSlug && !/^\d+$/.test(storedSlug)) return storedSlug

  const name = getClientDisplayName(raw)
  const fromName = slugifyClientNameForUrl(name)
  if (!fromName || /^\d+$/.test(fromName)) return null
  return fromName
}
