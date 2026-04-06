import { getClientDisplayName, slugifyClientNameForUrl } from '@/lib/clients/slug'

/**
 * Canonical tenant id for Auth0 `app_metadata.client_slug` (and related claims).
 * Never use the numeric Xano `id`. Prefers `mbaidentifier`, then Xano URL slug, then name-based slug.
 */
export function resolveAuth0ClientIdentifier(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw || typeof raw !== 'object') return null

  const mbaRaw = String(
    (raw as { mbaidentifier?: unknown }).mbaidentifier ??
      (raw as { mba_identifier?: unknown }).mba_identifier ??
      '',
  ).trim()
  if (mbaRaw) {
    const fromMba = slugifyClientNameForUrl(mbaRaw)
    if (fromMba && !/^\d+$/.test(fromMba)) return fromMba
  }

  const xanoUrl = String((raw as { xano_url_slug?: unknown }).xano_url_slug ?? '').trim()
  if (xanoUrl) {
    const fromXano = slugifyClientNameForUrl(xanoUrl)
    if (fromXano && !/^\d+$/.test(fromXano)) return fromXano
  }

  const name = getClientDisplayName(raw)
  const fromName = slugifyClientNameForUrl(name)
  if (!fromName || /^\d+$/.test(fromName)) return null
  return fromName
}
