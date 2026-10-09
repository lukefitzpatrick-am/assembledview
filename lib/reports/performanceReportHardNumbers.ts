/** Free-text dollar / AUD amounts the model must not invent in narrative fields. */
export const FREE_TEXT_MONEY_RE =
  /\$\s*\d[\d,]*(?:\.\d+)?(?:\s*[kKmMbB])?|\bAUD\s*\$?\s*\d[\d,]*(?:\.\d+)?/g

/** Percent figures. Used when an allow-list of input text is supplied. */
export const FREE_TEXT_PERCENT_RE = /(?<![\d.])\d[\d,]*(?:\.\d+)?\s*%/g

export type NarrativeMoneyScan = {
  field: string
  match: string
}

function narrativeChunks(
  value: string | string[] | { when: string; what: string }[],
): string[] {
  if (typeof value === "string") return [value]
  if (!Array.isArray(value)) return []
  const chunks: string[] = []
  for (const item of value) {
    if (typeof item === "string") chunks.push(item)
    else if (item && typeof item === "object") {
      chunks.push(String((item as { when?: string }).when ?? ""))
      chunks.push(String((item as { what?: string }).what ?? ""))
    }
  }
  return chunks
}

function figureCores(match: string): string[] {
  const cleaned = match
    .replace(/aud/gi, "")
    .replace(/[$%\s,]/g, "")
    .toLowerCase()
  const cores = new Set<string>()
  if (cleaned) cores.add(cleaned)
  const parsed = cleaned.match(/^(\d+(?:\.\d+)?)([kmb])?$/)
  if (!parsed) return [...cores]
  let n = Number(parsed[1])
  const suffix = parsed[2]
  if (suffix === "k") n *= 1000
  else if (suffix === "m") n *= 1_000_000
  else if (suffix === "b") n *= 1_000_000_000
  if (!Number.isFinite(n)) return [...cores]
  cores.add(String(n))
  if (Number.isInteger(n)) cores.add(String(n))
  cores.add(n.toFixed(2).replace(/\.00$/, ""))
  return [...cores]
}

function figureIsInInput(match: string, allowedText: string): boolean {
  const flat = allowedText.replace(/[$,]/g, "")
  return figureCores(match).some((core) => {
    if (!core) return false
    const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`).test(flat)
  })
}

function firstDisallowedFigure(
  chunk: string,
  pattern: RegExp,
  allowedText?: string,
): string | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags)
  for (const match of chunk.matchAll(re)) {
    const text = match[0]
    if (typeof allowedText === "string" && figureIsInInput(text, allowedText)) continue
    return text
  }
  return null
}

/**
 * Refuse narrative that contains free-text $ / AUD figures.
 * Pass `allowedText` when a figure is allowed only if that same number is already
 * in the input. Percentages are checked in that mode as well.
 */
export function findInventedMoneyInNarrative(
  fields: Record<string, string | string[] | { when: string; what: string }[]>,
  allowedText?: string,
): NarrativeMoneyScan | null {
  const patterns = [FREE_TEXT_MONEY_RE]
  if (typeof allowedText === "string") patterns.push(FREE_TEXT_PERCENT_RE)

  for (const [field, value] of Object.entries(fields)) {
    for (const chunk of narrativeChunks(value)) {
      for (const pattern of patterns) {
        const match = firstDisallowedFigure(chunk, pattern, allowedText)
        if (match) return { field, match }
      }
    }
  }
  return null
}
