/**
 * Port of finance/match_mba (XanoScript) — tokenise + match against MBA numbers
 * and scope_of_work.scope_id. DB side-effects live in applyMatchMba.
 *
 * Convention (finance): put the MBA number or scope id in round brackets in the
 * Xero reference. Brackets are separators, not part of the token.
 */

/** Separators: whitespace / , ; | - ( ) [ ] { } */
const TOKEN_RE = /[^\s/,;|\-()[\]{}]+/g

export function tokenizeReference(referenceRaw: string): string[] {
  const clean = (referenceRaw ?? "").trim()
  if (!clean) return []
  return clean.match(TOKEN_RE) ?? []
}

export type MbaMaster = {
  id: number
  mba_number: string
}

export type ScopeOfWorkRef = {
  id: number
  scope_id: string
}

/**
 * One result type (not a sibling) so applyMatchMba and ingest keep a single
 * `matched` gate. `kind` discriminates MBA vs scope; MBA wins when both hit.
 */
export type MatchMbaResult =
  | {
      matched: true
      kind: "mba"
      mba_number: string
      id: number
      /** Dual-hit diagnostic; applyMatchMba does not persist this. */
      alsoScope?: { scope_id: string; id: number }
    }
  | { matched: true; kind: "sow"; scope_id: string; id: number }
  | { matched: false; reason: "blank" }
  | { matched: false; reason: "no_match"; tokens: string[] }
  | {
      matched: false
      reason: "ambiguous"
      matches: string[]
      tokens: string[]
      matchKind: "mba" | "sow"
    }

function uniqueHits<T extends { id: number }>(
  tokens: string[],
  byLower: Map<string, T[]>,
): T[] {
  const matched: T[] = []
  for (const t of tokens) {
    const cand = t.trim().toLowerCase()
    if (!cand) continue
    const found = byLower.get(cand)
    if (found) matched.push(...found)
  }
  return matched
}

function indexByLower<T>(
  rows: T[],
  keyOf: (row: T) => string,
): Map<string, T[]> {
  const byLower = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row).trim().toLowerCase()
    if (!key) continue
    const list = byLower.get(key) ?? []
    list.push(row)
    byLower.set(key, list)
  }
  return byLower
}

function uniqueSow(
  tokens: string[],
  scopes: ScopeOfWorkRef[],
): { scope_id: string; id: number } | undefined {
  const byLower = indexByLower(scopes, (s) => s.scope_id ?? "")
  const hits = uniqueHits(tokens, byLower)
  const distinctIds = [...new Set(hits.map((s) => s.id))]
  if (distinctIds.length !== 1) return undefined
  const hit = hits[0]!
  return { scope_id: hit.scope_id, id: hit.id }
}

/**
 * Pure matcher: case-insensitive token vs mba_number, then vs scope_id.
 * Distinct masters by id — 0 / 1 / 2+ outcomes. MBA first.
 */
export function matchMbaAgainstMasters(
  referenceRaw: string,
  masters: MbaMaster[],
  scopes: ScopeOfWorkRef[] = [],
): MatchMbaResult {
  const refClean = (referenceRaw ?? "").trim()
  if (refClean === "") {
    return { matched: false, reason: "blank" }
  }

  const tokens = tokenizeReference(refClean)
  const mbaByLower = indexByLower(masters, (m) => m.mba_number ?? "")
  const matched = uniqueHits(tokens, mbaByLower)

  const distinctIds = [...new Set(matched.map((m) => m.id))]
  const distinctNumbers = [
    ...new Set(matched.map((m) => m.mba_number).filter(Boolean)),
  ]

  if (distinctIds.length === 1) {
    const alsoScope = uniqueSow(tokens, scopes)
    return {
      matched: true,
      kind: "mba",
      mba_number: distinctNumbers[0]!,
      id: distinctIds[0]!,
      ...(alsoScope ? { alsoScope } : {}),
    }
  }
  if (distinctIds.length > 1) {
    return {
      matched: false,
      reason: "ambiguous",
      matches: distinctNumbers,
      tokens,
      matchKind: "mba",
    }
  }

  const sowByLower = indexByLower(scopes, (s) => s.scope_id ?? "")
  const sowHits = uniqueHits(tokens, sowByLower)
  const sowIds = [...new Set(sowHits.map((s) => s.id))]
  const sowNumbers = [...new Set(sowHits.map((s) => s.scope_id).filter(Boolean))]

  if (sowIds.length === 1) {
    return {
      matched: true,
      kind: "sow",
      scope_id: sowNumbers[0]!,
      id: sowIds[0]!,
    }
  }
  if (sowIds.length === 0) {
    return { matched: false, reason: "no_match", tokens }
  }
  return {
    matched: false,
    reason: "ambiguous",
    matches: sowNumbers,
    tokens,
    matchKind: "sow",
  }
}

export function exceptionReasonForMatch(
  referenceRaw: string,
  result: MatchMbaResult,
): string | null {
  if (result.matched) return null
  if (result.reason === "blank") {
    return "Blank Xero Reference — finance must add the MBA number"
  }
  if (result.reason === "no_match") {
    return `No MBA found in reference: '${referenceRaw}'`
  }
  if (result.matchKind === "sow") {
    return `Ambiguous — reference matched scopes: ${result.matches.join(", ")}`
  }
  return `Ambiguous — reference matched MBAs: ${result.matches.join(", ")}`
}
