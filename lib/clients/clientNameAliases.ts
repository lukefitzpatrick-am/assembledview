/**
 * `clients.client_name_aliases`: other names a client goes by. Fireflies
 * matches meeting titles on them and the relabel Match tab joins warehouse
 * campaigns on them, so both read the column through `parseClientNameAliases`.
 */

/** The stored aliases: trimmed non-blank strings, first spelling kept for each (case-insensitive). */
export function parseClientNameAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== "string") continue
    const alias = raw.trim()
    const key = alias.toLowerCase()
    if (!alias || seen.has(key)) continue
    seen.add(key)
    out.push(alias)
  }
  return out
}
