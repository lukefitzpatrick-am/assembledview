/**
 * Admin invite/update: ordered tenant slugs for a client user.
 * First entry is primary (`app_metadata.client_slug`).
 */

export type ResolveInviteClientSlugsInput = {
  clientSlugs?: unknown
  clientSlug?: unknown
}

export type ResolveInviteClientSlugsResult =
  | { ok: true; slugs: string[] }
  | { ok: false; reason: "missing" | "numeric" }

function normalizeInviteSlug(value: unknown): { slug: string } | { numeric: true } | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return { numeric: true }
  return { slug: trimmed }
}

/**
 * Prefer `clientSlugs` (primary first). Legacy `clientSlug` maps to `[clientSlug]`
 * when the array is absent or empty. Does not merge the two fields.
 */
export function resolveInviteClientSlugs(
  input: ResolveInviteClientSlugsInput,
): ResolveInviteClientSlugsResult {
  const fromArray = Array.isArray(input.clientSlugs) ? input.clientSlugs : []
  const source =
    fromArray.length > 0
      ? fromArray
      : input.clientSlug !== undefined && input.clientSlug !== null
        ? [input.clientSlug]
        : []

  const slugs: string[] = []
  const seen = new Set<string>()
  for (const raw of source) {
    const parsed = normalizeInviteSlug(raw)
    if (!parsed) continue
    if ("numeric" in parsed) return { ok: false, reason: "numeric" }
    if (seen.has(parsed.slug)) continue
    seen.add(parsed.slug)
    slugs.push(parsed.slug)
  }
  if (slugs.length === 0) return { ok: false, reason: "missing" }
  return { ok: true, slugs }
}

function coerceSlugList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const slugs: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const parsed = normalizeInviteSlug(item)
    if (!parsed || "numeric" in parsed) continue
    if (seen.has(parsed.slug)) continue
    seen.add(parsed.slug)
    slugs.push(parsed.slug)
  }
  return slugs
}

/** GET list shape: `client_slugs` ordered with `client_slug` as element zero. */
export function listedUserClientSlugs(
  appMetadata: Record<string, unknown> | undefined,
): string[] {
  if (!appMetadata) return []
  const extras = coerceSlugList(appMetadata.client_slugs)
  const primaryParsed = normalizeInviteSlug(appMetadata.client_slug)
  const primary =
    primaryParsed && !("numeric" in primaryParsed) ? primaryParsed.slug : null
  if (primary) {
    return [primary, ...extras.filter((slug) => slug !== primary)]
  }
  return extras
}

export function buildClientRoleAppMetadata(params: {
  slugs: string[]
  mbaNumbers?: string[]
  primaryMbaNumber?: string
}): Record<string, unknown> {
  const slugs = params.slugs
  const mbaNumbers = (params.mbaNumbers ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const primaryMba = params.primaryMbaNumber?.trim().toLowerCase() || undefined
  return {
    role: "client",
    client_slug: slugs[0],
    client_slugs: slugs,
    mba_numbers: mbaNumbers,
    primary_mba_number: primaryMba ?? null,
  }
}
