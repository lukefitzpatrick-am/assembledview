/**
 * `clients.client_name_aliases`: other names a client goes by. Fireflies
 * matches meeting titles on them and the relabel Match tab joins warehouse
 * campaigns on them, so both read the column through `parseClientNameAliases`.
 */
import { normaliseAttributionText, titleContainsPhrase } from "@/lib/fireflies/titleClients"

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

/** S5b (C-388): the shortest supplier campaign name that may become a client alias. */
const CLIENT_ALIAS_MIN_LENGTH = 8

/**
 * S5b (C-388, Luke S5 Q2 option A): why a supplier campaign name may not
 * become this client's alias, or null when it may. It needs 8 or more
 * characters with a digit or a separator, so a short generic name
 * ("Prospecting") is refused. Fireflies matches titles after
 * `normaliseAttributionText` (case and punctuation gone), so the rest of the
 * rule compares that form: a name that holds, or sits inside, another
 * client's title phrase (name, name word, MBA identifier, alias or seed) is
 * refused, because meetings and delivery would file against both.
 */
export function clientAliasRefusal(
  name: string,
  ownAliases: readonly string[],
  otherClientPhrases: readonly string[],
): string | null {
  const alias = name.trim()
  if (!alias) return "This delivery has no campaign name to save."
  if (alias.length < CLIENT_ALIAS_MIN_LENGTH) {
    return `"${alias}" is shorter than ${CLIENT_ALIAS_MIN_LENGTH} characters, so it could match other clients.`
  }
  if (!/[0-9_\-|/.:+#]/.test(alias)) {
    return `"${alias}" has no digit or separator (such as _ - | / .), so it could be a generic name.`
  }
  const key = normaliseAttributionText(alias)
  if (ownAliases.some((a) => normaliseAttributionText(a) === key)) return `"${alias}" is already this client's alias.`
  const clash = otherClientPhrases.find((p) => p && (titleContainsPhrase(key, p) || titleContainsPhrase(p, key)))
  if (clash) {
    return `"${alias}" clashes with "${clash}", another client's name or alias (meeting titles ignore case and punctuation).`
  }
  return null
}
