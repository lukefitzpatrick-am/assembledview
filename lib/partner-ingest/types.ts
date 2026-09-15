export type PartnerSourceMapRow = {
  senderDomain: string
  subjectPattern: string | null
  sourceSlug: string
  sourceLabel: string
  isActive: boolean
  expectedHeader: string | null
  headerRowHint: number | null
  maxStaleDays: number | null
  loadMode: string | null
}

export type PartnerDeliveryRow = {
  reportDate: string
  partnerAdvertiserId: string | null
  partnerCampaignName: string | null
  partnerLineItemName: string | null
  avLineItemId: string | null
  impressions: number
  clicks: number
  videoViews: number
  videoQ25: number
  videoQ50: number
  videoQ75: number
  completedViews: number
  rateQ25: number
  rateQ50: number
  rateQ75: number
  rateFullyPlayed: number
}

export type PartnerRawLine = {
  fileRow: number
  rawLine: string
}

export type ParsedPartnerFile = {
  headerRow: number
  preambleRowCount: number
  detectedHeader: string
  rawLines: PartnerRawLine[]
  rows: PartnerDeliveryRow[]
}

export type ParseTestResult = {
  name: "T1" | "T4" | "T5"
  ok: boolean
  detail: string
  value?: number
}

export type PartnerFileParseTests = {
  t1: ParseTestResult
  t4: ParseTestResult
  t5: ParseTestResult
  failed: boolean
}

export type ChannelFactorySeedRow = {
  REPORT_DATE: string
  PARTNER_ADVERTISER_ID: string | null
  PARTNER_CAMPAIGN_NAME: string | null
  PARTNER_LINE_ITEM_NAME: string | null
  IMPRESSIONS: number
  CLICKS: number
  VIDEO_VIEWS: number
  RATE_Q25: number
  RATE_Q50: number
  RATE_Q75: number
  RATE_FULLY_PLAYED: number
}

export type PartnerIngestFileSummary = {
  attachmentName: string
  sourceFile: string
  status:
    | "loaded"
    | "parse_failed"
    | "unrecognised"
    | "skipped_duplicate"
  rowsParsed: number
  nullCodeRows: number
  t5Drift?: number | null
  tests?: PartnerFileParseTests
  errorText?: string
}

export type PartnerIngestRunSummary = {
  filesSeen: number
  loaded: number
  skipped: number
  failed: number
  unrecognised: number
  rowsParsed: number
  rowsWithNullCode: number
  t5Drift: number | null
  files: PartnerIngestFileSummary[]
  tests: Array<{
    attachmentName: string
    tests: PartnerFileParseTests
  }>
}
