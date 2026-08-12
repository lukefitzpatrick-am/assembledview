/**
 * Prior-insight restatement guard — same rejection *shape* as invented_money_figure.
 * Retrieved campaign_insights are context, not current findings. Near-verbatim
 * reuse without attribution → reject so AVA regenerates.
 *
 * Attribution must appear in the same narrative field as the restatement and
 * acknowledge prior belief / what changed (not a silent copy).
 */
export type PriorInsightRef = {
  id: number
  body: string
}

export type PriorRestatementHit = {
  field: string
  match: string
  insightId: number
}

/** Markers that the field is building on a prior insight, not presenting it as new. */
export const PRIOR_ATTRIBUTION_RE =
  /\b(previously|prior insight|earlier(?:\s+we)?|last\s+(?:month|period|review|cycle)|we\s+(?:had\s+)?believed|what\s+(?:has\s+)?changed|as\s+(?:we\s+)?noted\s+before|previously\s+believed|building\s+on|since\s+then|we\s+used\s+to\s+think)\b/i

const MIN_PRIOR_CHARS = 24
const MIN_PRIOR_WORDS = 6
const OVERLAP_RATIO = 0.9

export function normalizeInsightText(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function hasPriorAttribution(text: string): boolean {
  return PRIOR_ATTRIBUTION_RE.test(text)
}

function significantWords(text: string): string[] {
  return normalizeInsightText(text)
    .split(" ")
    .filter((w) => w.length > 2)
}

/**
 * True when `narrative` reproduces `prior` near-verbatim (substring after
 * normalisation, or ≥90% significant-word overlap for longer priors).
 */
export function isNearVerbatimRestatement(narrative: string, prior: string): boolean {
  const n = normalizeInsightText(narrative)
  const p = normalizeInsightText(prior)
  if (p.length < MIN_PRIOR_CHARS) return false
  if (n.includes(p)) return true

  const priorWords = significantWords(prior)
  if (priorWords.length < MIN_PRIOR_WORDS) return false
  const narrativeWords = new Set(significantWords(narrative))
  let hit = 0
  for (const w of priorWords) {
    if (narrativeWords.has(w)) hit += 1
  }
  return hit / priorWords.length >= OVERLAP_RATIO
}

function flattenNarrativeFields(
  fields: Record<string, string | string[] | { when: string; what: string }[]>,
): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = []
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      out.push({ field, text: value })
      continue
    }
    if (!Array.isArray(value)) continue
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (typeof item === "string") {
        out.push({ field: `${field}[${i}]`, text: item })
      } else if (item && typeof item === "object") {
        const when = String((item as { when?: string }).when ?? "")
        const what = String((item as { what?: string }).what ?? "")
        out.push({ field: `${field}[${i}]`, text: `${when} ${what}`.trim() })
      }
    }
  }
  return out
}

/**
 * Scan narrative fields against live prior insight bodies.
 * Empty `priors` → null (generate exactly as today).
 * Attributed restatement (PRIOR_ATTRIBUTION_RE in the same field) → allowed.
 */
export function findUnattributedPriorRestatement(
  fields: Record<string, string | string[] | { when: string; what: string }[]>,
  priors: PriorInsightRef[],
): PriorRestatementHit | null {
  if (!priors.length) return null

  const chunks = flattenNarrativeFields(fields)
  for (const prior of priors) {
    const body = String(prior.body ?? "").trim()
    if (!body) continue
    for (const chunk of chunks) {
      if (!isNearVerbatimRestatement(chunk.text, body)) continue
      if (hasPriorAttribution(chunk.text)) continue
      return {
        field: chunk.field,
        match: body.length > 80 ? `${body.slice(0, 77).trimEnd()}…` : body,
        insightId: prior.id,
      }
    }
  }
  return null
}
