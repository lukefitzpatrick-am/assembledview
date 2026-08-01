export const KNOWN_SCOPE_STATUSES = [
  "Draft",
  "Submitted",
  "Approved",
  "In-Progress",
  "Completed",
  "Cancelled",
] as const

export type KnownScopeStatus = (typeof KNOWN_SCOPE_STATUSES)[number]

export const OTHER_SCOPE_STATUS_GROUP = "Other / unrecognised"

export type ScopeStatusGroupable = {
  id: number
  project_status?: string | null
}

export type ScopeStatusGroup<T extends ScopeStatusGroupable> = {
  status: string
  scopes: T[]
  isKnown: boolean
}

function normalizeStatusKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
}

const KNOWN_BY_KEY = new Map<string, KnownScopeStatus>(
  KNOWN_SCOPE_STATUSES.map((s) => [normalizeStatusKey(s), s]),
)

/** Map a stored status to a known canonical label, or null if unrecognised. */
export function resolveKnownScopeStatus(
  raw: string | null | undefined,
): KnownScopeStatus | null {
  const key = normalizeStatusKey(raw)
  if (!key) return null
  return KNOWN_BY_KEY.get(key) ?? null
}

/**
 * Group scopes for the workspace list. Known statuses keep their canonical
 * labels; everything else lands in "Other / unrecognised" — never dropped.
 */
export function groupScopesByStatus<T extends ScopeStatusGroupable>(
  scopes: T[],
): ScopeStatusGroup<T>[] {
  const knownBuckets = new Map<KnownScopeStatus, T[]>(
    KNOWN_SCOPE_STATUSES.map((s) => [s, []]),
  )
  const other: T[] = []

  for (const scope of scopes) {
    const known = resolveKnownScopeStatus(scope.project_status)
    if (known) knownBuckets.get(known)!.push(scope)
    else other.push(scope)
  }

  const groups: ScopeStatusGroup<T>[] = KNOWN_SCOPE_STATUSES.map((status) => ({
    status,
    scopes: knownBuckets.get(status)!,
    isKnown: true,
  }))

  if (other.length > 0) {
    groups.push({
      status: OTHER_SCOPE_STATUS_GROUP,
      scopes: other,
      isKnown: false,
    })
  }

  return groups
}
