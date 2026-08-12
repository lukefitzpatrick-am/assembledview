/**
 * Deterministic SharePoint site path for a client mbaidentifier.
 * Same identifier (any case / surrounding whitespace) → same URL for every
 * row in a resolveClientGroup. Empty/whitespace → null.
 */
export function siteUrlForClient(
  mbaidentifier: string | null | undefined
): string | null {
  const id = String(mbaidentifier ?? "").trim()
  if (!id) return null
  return `/sites/cli-${id.toLowerCase()}`
}
