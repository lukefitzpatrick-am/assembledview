/**
 * Client-name tokens for Fireflies title attribution.
 * Group members collapse onto the m365 / lowest-id anchor.
 */

const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "pty",
  "ltd",
  "limited",
  "inc",
  "co",
  "company",
  "holdings",
])

export const CLIENT_NAME_ALIAS_SEEDS: Array<{
  hints: string[]
  aliases: string[]
}> = [
  { hints: ["penfold"], aliases: ["Penfolds", "Penfold's"] },
  {
    hints: ["boss"],
    aliases: ["BOSS", "Boss Engineering", "Boss Automotive"],
  },
  { hints: ["golf"], aliases: ["Golf", "Golf Australia", "GA"] },
  { hints: ["pga"], aliases: ["PGA"] },
  { hints: ["hema"], aliases: ["Hema"] },
  { hints: ["hartmann"], aliases: ["Hartmann"] },
]

export type TitleClientSource = {
  clientId: number
  displayName: string
  mbaidentifier: string | null
  aliases: string[]
  isAnchor: boolean
}

export type TitleClientEntry = {
  clientId: number
  displayName: string
  phrases: string[]
}

/** Lowercase, strip apostrophes, fold punctuation to spaces. */
export function normaliseAttributionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function titleContainsPhrase(
  normalisedTitle: string,
  phrase: string
): boolean {
  const p = phrase.trim()
  if (!p) return false
  const re = new RegExp(`(?:^|\\s)${escapeRe(p)}(?:\\s|$)`)
  return re.test(normalisedTitle)
}

function uniquePhrases(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const n = normaliseAttributionText(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

function haystackForClient(
  displayName: string,
  mbaidentifier: string | null
): string {
  return normaliseAttributionText(
    `${displayName} ${mbaidentifier ?? ""}`
  )
}

export function aliasesForClient(
  displayName: string,
  mbaidentifier: string | null,
  stored: string[]
): string[] {
  const haystack = haystackForClient(displayName, mbaidentifier)
  const seeded = CLIENT_NAME_ALIAS_SEEDS.filter((seed) =>
    seed.hints.some((hint) => haystack.includes(hint))
  ).flatMap((seed) => seed.aliases)
  return uniquePhrases([...stored, ...seeded])
}

function phrasesFromName(displayName: string): string[] {
  const full = normaliseAttributionText(displayName)
  if (!full) return []
  const words = full
    .split(" ")
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w))
  return uniquePhrases([full, ...words])
}

export function phrasesForClient(source: TitleClientSource): string[] {
  const mba = (source.mbaidentifier ?? "").trim()
  const mbaPhrase = mba ? normaliseAttributionText(mba) : ""
  const aliases = aliasesForClient(
    source.displayName,
    source.mbaidentifier,
    source.aliases
  )
  const fromName = phrasesFromName(source.displayName)
  const mbaKeep =
    mbaPhrase && (mbaPhrase.length >= 2 || aliases.includes(mbaPhrase))
      ? [mbaPhrase]
      : []
  return uniquePhrases([...fromName, ...mbaKeep, ...aliases])
}

export function buildTitleClientIndex(
  sources: TitleClientSource[]
): TitleClientEntry[] {
  const groups = new Map<string, TitleClientSource[]>()
  for (const source of sources) {
    const mba = (source.mbaidentifier ?? "").trim().toLowerCase()
    const key = mba || `__solo:${source.clientId}`
    const list = groups.get(key) ?? []
    list.push(source)
    groups.set(key, list)
  }

  const entries: TitleClientEntry[] = []
  for (const members of groups.values()) {
    const anchor =
      members.find((m) => m.isAnchor) ??
      members.reduce((a, b) => (a.clientId <= b.clientId ? a : b))
    const phrases = uniquePhrases(members.flatMap(phrasesForClient))
    entries.push({
      clientId: anchor.clientId,
      displayName: anchor.displayName,
      phrases,
    })
  }
  return entries
}

export function matchTitleClients(
  title: string,
  index: TitleClientEntry[]
): TitleClientEntry[] {
  const normalised = normaliseAttributionText(title)
  if (!normalised) return []
  return index.filter((entry) =>
    entry.phrases.some((phrase) => titleContainsPhrase(normalised, phrase))
  )
}
