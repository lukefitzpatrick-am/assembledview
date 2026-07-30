/**
 * Port of finance/match_mba (XanoScript) — tokenise + match against MBA numbers.
 * DB side-effects (edit AR + upsert exceptions) live in applyMatchMba.
 */

/** Separators: whitespace / , ; | -  — regex from finance/match_mba. */
const TOKEN_RE = /[^\s/,;|\-]+/g

export function tokenizeReference(referenceRaw: string): string[] {
  const clean = (referenceRaw ?? "").trim()
  if (!clean) return []
  return clean.match(TOKEN_RE) ?? []
}

export type MbaMaster = {
  id: number
  mba_number: string
}

export type MatchMbaResult =
  | { matched: true; mba_number: string; id: number }
  | { matched: false; reason: "blank" }
  | { matched: false; reason: "no_match"; tokens: string[] }
  | { matched: false; reason: "ambiguous"; matches: string[]; tokens: string[] }

/**
 * Pure matcher: case-insensitive token vs mba_number.
 * Distinct masters by id — 0 / 1 / 2+ outcomes.
 */
export function matchMbaAgainstMasters(
  referenceRaw: string,
  masters: MbaMaster[],
): MatchMbaResult {
  const refClean = (referenceRaw ?? "").trim()
  if (refClean === "") {
    return { matched: false, reason: "blank" }
  }

  const tokens = tokenizeReference(refClean)
  const matched: MbaMaster[] = []
  const byLower = new Map<string, MbaMaster[]>()
  for (const m of masters) {
    const key = (m.mba_number ?? "").trim().toLowerCase()
    if (!key) continue
    const list = byLower.get(key) ?? []
    list.push(m)
    byLower.set(key, list)
  }

  for (const t of tokens) {
    const cand = t.trim().toLowerCase()
    if (!cand) continue
    const found = byLower.get(cand)
    if (found) matched.push(...found)
  }

  const distinctIds = [...new Set(matched.map((m) => m.id))]
  const distinctNumbers = [
    ...new Set(matched.map((m) => m.mba_number).filter(Boolean)),
  ]

  if (distinctIds.length === 1) {
    return {
      matched: true,
      mba_number: distinctNumbers[0]!,
      id: distinctIds[0]!,
    }
  }
  if (distinctIds.length === 0) {
    return { matched: false, reason: "no_match", tokens }
  }
  return {
    matched: false,
    reason: "ambiguous",
    matches: distinctNumbers,
    tokens,
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
  return `Ambiguous — reference matched MBAs: ${result.matches.join(", ")}`
}
