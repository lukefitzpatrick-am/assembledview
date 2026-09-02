export type RmMetric = "wc" | "v%" | "ix"

export type RmDataRow = {
  section: string | null
  label: string
  rowIndex: number
  wc: number | null
  reachPct: number | null
  index: number | null
  suppressed: boolean
}

export type RmBlock = {
  blockId: string
  columnName: string
  isBase: boolean
  labelCol: number
  metrics: RmMetric[]
  unweightedN: number | null
  popn000: number | null
  rows: RmDataRow[]
}

export type RmSheet = {
  sheetName: string
  waveCode: string | null
  surveyPeriod: string | null
  filter: string | null
  weights: string | null
  blocks: RmBlock[]
  skipped: { reason: string; atRow: number; atCol: number }[]
}

export type RmWorkbookParse = {
  fileName: string
  sheets: RmSheet[]
  warnings: string[]
}
