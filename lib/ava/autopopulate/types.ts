/** Shared types for AVA media-plan auto-populate (Stage 1 detector + Stage 2 mapper). */

export type DetectedColumn = {
  index: number
  letter: string
  header: string
}

export type FlightGranularity =
  | "weekly"
  | "fourWeekly"
  | "monthly"
  | "textMonthWeekly"
  | "unknown"

export type DetectedFlightColumn = {
  index: number
  letter: string
  /** ISO yyyy-MM-dd (synthesised for text-month / week-number bands). */
  date: string
  /** Optional header label (e.g. "JULY / 7") for text-month flight. */
  label?: string
}

export type DetectedSheet = {
  sheetName: string
  meta: Record<string, string>
  headerRow: number | null
  lineItemColumns: DetectedColumn[]
  flight: {
    dateRow: number | null
    columns: DetectedFlightColumn[]
    granularity: FlightGranularity
  }
  costColumns: DetectedColumn[]
  junkColumns: string[]
  dataRowRange: { firstDataRow: number; lastDataRow: number }
  grid: (string | number | null)[][]
  /** True when this sheet was detected as a Bonus / added-value sibling. */
  isBonusSheet?: boolean
  /** Secondary Bonus sheet detections (primary sheet only). */
  bonusSheets?: DetectedSheet[]
}

export type AutopopulateChannel = "radio" | "ooh"

export type MappedBurst = {
  startDate: string
  endDate: string
  budget?: string
  buyAmount?: string
  quantity?: number
  calculatedValue?: number
  sourceCell?: string
}

export type MappedLineItem = {
  channel: AutopopulateChannel
  fields: Record<string, string>
  bursts: MappedBurst[]
  is_bonus?: boolean
  confidence: number
  needs_review?: string
}

export type MapperResult = {
  plan_meta: {
    client?: string
    campaign?: string
    demo?: string
    startDate?: string
    endDate?: string
  }
  line_items: MappedLineItem[]
  needs_review: { row: number; reason: string }[]
  warnings: string[]
}

/** Captured by apply_parsed_plan for the ChatWidget → bridge setLineItems path. */
export type CapturedLineItemsLoad = {
  channel: AutopopulateChannel
  items: Record<string, unknown>[]
  replace: boolean
}
