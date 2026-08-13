/**
 * Explicit 1:1 join from ingest profile names → publishers.id.
 * Never derived from publishers.publisher_name (SCA/SEN are near-misses).
 */

/** Short profile name → catalogue numeric PK. Live recon, not a fuzzy match. */
export const EXPLICIT_PROFILE_CATALOGUE_JOIN: ReadonlyMap<string, number> =
  new Map([
    ["QMS", 30],
    ["JCDecaux", 35],
    ["SCA", 12],
    ["SEN", 19],
  ])

function keyOf(name: string): string {
  return name.trim().toLowerCase()
}

export function resolveCatalogueIdForProfileName(
  publisherName: string,
): number | null {
  const exact = EXPLICIT_PROFILE_CATALOGUE_JOIN.get(publisherName.trim())
  if (exact != null) return exact
  for (const [name, id] of EXPLICIT_PROFILE_CATALOGUE_JOIN) {
    if (keyOf(name) === keyOf(publisherName)) return id
  }
  return null
}

export function profileNameForCatalogueId(catalogueId: number): string | null {
  for (const [name, id] of EXPLICIT_PROFILE_CATALOGUE_JOIN) {
    if (id === catalogueId) return name
  }
  return null
}

export function findProfileForCataloguePublisher(
  profiles: Array<{
    publisher_name: string
    publisher_id: number | null
  }>,
  catalogue: { id: number; publisher_name: string },
): (typeof profiles)[number] | null {
  const byFk = profiles.find((p) => p.publisher_id === catalogue.id)
  if (byFk) return byFk
  const short = profileNameForCatalogueId(catalogue.id)
  if (short) {
    const byShort = profiles.find(
      (p) => keyOf(p.publisher_name) === keyOf(short),
    )
    if (byShort) return byShort
  }
  const byName = profiles.find(
    (p) => keyOf(p.publisher_name) === keyOf(catalogue.publisher_name),
  )
  return byName ?? null
}
