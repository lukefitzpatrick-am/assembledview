/**
 * Auth0 app_metadata rewrite when a `clients.slug` row is renamed.
 * Replaces `oldSlug` on the singular key and inside `client_slugs`.
 */

function normalizeSlug(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function rewriteClientSlugFields(
  appMetadata: Record<string, unknown>,
  oldSlug: string,
  newSlug: string,
): Record<string, unknown> {
  const oldN = oldSlug.trim().toLowerCase()
  const newN = newSlug.trim().toLowerCase()
  const next: Record<string, unknown> = { ...appMetadata }

  const currentPrimary = normalizeSlug(next.client_slug)
  if (currentPrimary && currentPrimary === oldN) {
    next.client_slug = newN
  }

  if (!Array.isArray(next.client_slugs)) return next

  const rewritten: string[] = []
  const seen = new Set<string>()
  for (const item of next.client_slugs) {
    const current = normalizeSlug(item)
    if (!current) continue
    const mapped = current === oldN ? newN : current
    if (!mapped || seen.has(mapped)) continue
    seen.add(mapped)
    rewritten.push(mapped)
  }
  next.client_slugs = rewritten
  return next
}
