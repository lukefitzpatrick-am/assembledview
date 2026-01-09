export type PageDataSummaryInput =
  | string
  | {
      tables?: Array<Record<string, unknown>>
      charts?: Record<string, unknown>
      stats?: Record<string, unknown>
      notes?: string
    }
  | Record<string, unknown>
  | undefined

// Converts page-level data into a compact string so it can be injected into the chat system prompt.
export function getPageDataSummary(input: PageDataSummaryInput): string | undefined {
  if (!input) return undefined
  if (typeof input === "string") return input

  try {
    return JSON.stringify(input, null, 2)
  } catch (error) {
    console.error("Unable to stringify page data", error)
    return undefined
  }
}

































