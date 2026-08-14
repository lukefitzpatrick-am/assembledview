export const FIREFLIES_NOTES_FILTERS = [
  "all",
  "client",
  "publisher",
  "internal",
  "new_business",
  "unattributed",
] as const

export type FirefliesNotesFilter = (typeof FIREFLIES_NOTES_FILTERS)[number]

export function parseFirefliesNotesFilter(
  raw: string | null | undefined,
): FirefliesNotesFilter {
  if (raw && (FIREFLIES_NOTES_FILTERS as readonly string[]).includes(raw)) {
    return raw as FirefliesNotesFilter
  }
  return "unattributed"
}
