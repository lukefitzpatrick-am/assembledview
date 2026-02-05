export type SortLocale = string

const DEFAULT_LOCALE: SortLocale = "en"

function getCollator(locale: SortLocale = DEFAULT_LOCALE) {
  return new Intl.Collator(locale, {
    sensitivity: "base",
    numeric: true,
    usage: "sort",
  })
}

export function compareAZ(a: string, b: string, locale: SortLocale = DEFAULT_LOCALE) {
  return getCollator(locale).compare(a ?? "", b ?? "")
}

export function sortByLabel<T>(
  items: readonly T[],
  getLabel: (item: T) => string,
  locale: SortLocale = DEFAULT_LOCALE
): T[] {
  const collator = getCollator(locale)
  return [...items].sort((a, b) => collator.compare(getLabel(a) ?? "", getLabel(b) ?? ""))
}

