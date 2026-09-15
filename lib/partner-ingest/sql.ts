export const RAW = {
  ingestLog: "ASSEMBLEDVIEW.RAW.PARTNER_FILE_INGEST_LOG",
  fileLines: "ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES",
  sourceMap: "ASSEMBLEDVIEW.RAW.PARTNER_SOURCE_MAP",
  deliveryDaily: "ASSEMBLEDVIEW.RAW.PARTNER_DELIVERY_DAILY",
} as const

export const SELECT_SOURCE_MAP_SQL = `
SELECT
  SENDER_DOMAIN,
  SUBJECT_PATTERN,
  SOURCE_SLUG,
  SOURCE_LABEL,
  IS_ACTIVE,
  EXPECTED_HEADER,
  HEADER_ROW_HINT,
  MAX_STALE_DAYS,
  LOAD_MODE
FROM ${RAW.sourceMap}
WHERE IS_ACTIVE = TRUE
`

export const SELECT_LOADED_DUPLICATE_SQL = `
SELECT 1 AS HIT
FROM ${RAW.ingestLog}
WHERE INTERNET_MESSAGE_ID = ?
  AND ATTACHMENT_NAME = ?
  AND ATTACHMENT_SHA256 = ?
  AND STATUS = 'loaded'
LIMIT 1
`

export const INSERT_FILE_LINE_SQL = (n: number): string => {
  const row = "(?, ?, ?)"
  return `INSERT INTO ${RAW.fileLines} (SOURCE_FILE, FILE_ROW, RAW_LINE) VALUES ${Array.from({ length: n }, () => row).join(", ")}`
}

export const INSERT_INGEST_LOG_SQL = `
INSERT INTO ${RAW.ingestLog} (
  SOURCE_SLUG,
  INTERNET_MESSAGE_ID,
  ATTACHMENT_NAME,
  ATTACHMENT_SHA256,
  SOURCE_FILE,
  SENDER_ADDRESS,
  RECEIVED_AT,
  BYTES,
  LINE_COUNT,
  PARSED_ROW_COUNT,
  STATUS,
  ERROR_TEXT
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

export const SELECT_MAX_REPORT_DATE_SQL = (n: number): string => `
SELECT SOURCE, MAX(REPORT_DATE) AS MAX_REPORT_DATE
FROM ${RAW.deliveryDaily}
WHERE SOURCE IN (${Array.from({ length: n }, () => "?").join(", ")})
GROUP BY SOURCE
`

export const DELETE_DELIVERY_RANGE_SQL = `
DELETE FROM ${RAW.deliveryDaily}
WHERE SOURCE = ?
  AND REPORT_DATE BETWEEN ? AND ?
`

export const DELETE_DELIVERY_DAYS_SQL = (n: number): string => `
DELETE FROM ${RAW.deliveryDaily}
WHERE SOURCE = ?
  AND REPORT_DATE IN (${Array.from({ length: n }, () => "?").join(", ")})
`

export type PartnerLoadMode = "range_replace" | "day_replace" | "append"

const LOAD_MODES: PartnerLoadMode[] = ["range_replace", "day_replace", "append"]

/** PARTNER_SOURCE_MAP.LOAD_MODE. Null or blank means the historic range replace. */
export function resolveLoadMode(value: string | null | undefined): PartnerLoadMode | null {
  const text = (value ?? "").trim().toLowerCase()
  if (text === "") return "range_replace"
  return LOAD_MODES.find((mode) => mode === text) ?? null
}

export const DELIVERY_COLUMNS = [
  "SOURCE",
  "REPORT_DATE",
  "PARTNER_ADVERTISER_ID",
  "PARTNER_CAMPAIGN_NAME",
  "PARTNER_LINE_ITEM_NAME",
  "AV_LINE_ITEM_ID",
  "IMPRESSIONS",
  "CLICKS",
  "VIDEO_VIEWS",
  "VIDEO_Q25",
  "VIDEO_Q50",
  "VIDEO_Q75",
  "COMPLETED_VIEWS",
  "RATE_Q25",
  "RATE_Q50",
  "RATE_Q75",
  "RATE_FULLY_PLAYED",
  "SOURCE_FILE",
  "AMOUNT_SPENT",
  "PLAYS",
  "VENUE_TYPE",
  "METRO_AREA",
  "STATE",
  "PARTNER_CAMPAIGN_ID",
  "PARTNER_CREATIVE_ID",
] as const

export const INSERT_DELIVERY_SQL = (n: number): string => {
  const placeholders = `(${DELIVERY_COLUMNS.map(() => "?").join(", ")})`
  return `INSERT INTO ${RAW.deliveryDaily} (${DELIVERY_COLUMNS.join(", ")}) VALUES ${Array.from({ length: n }, () => placeholders).join(", ")}`
}

export const LINE_INSERT_BATCH = 80
export const DELIVERY_INSERT_BATCH = 40

export function lineInsertBinds(
  sourceFile: string,
  lines: { fileRow: number; rawLine: string }[]
): unknown[] {
  return lines.flatMap((line) => [sourceFile, line.fileRow, line.rawLine])
}

export function deliveryInsertBinds(
  source: string,
  sourceFile: string,
  rows: import("./types").PartnerDeliveryRow[]
): unknown[] {
  return rows.flatMap((row) => [
    source,
    row.reportDate,
    row.partnerAdvertiserId,
    row.partnerCampaignName,
    row.partnerLineItemName,
    row.avLineItemId,
    // IMPRESSIONS is NUMBER(38,0); exchange reports send fractions.
    Math.round(row.impressions),
    row.clicks,
    row.videoViews,
    row.videoQ25,
    row.videoQ50,
    row.videoQ75,
    row.completedViews,
    row.rateQ25,
    row.rateQ50,
    row.rateQ75,
    row.rateFullyPlayed,
    sourceFile,
    row.amountSpent ?? null,
    row.plays ?? null,
    row.venueType ?? null,
    row.metroArea ?? null,
    row.state ?? null,
    row.partnerCampaignId ?? null,
    row.partnerCreativeId ?? null,
  ])
}

export const DELIVERY_PARAMS_PER_ROW = DELIVERY_COLUMNS.length

export function ingestLogBinds(log: {
  sourceSlug: string
  internetMessageId: string
  attachmentName: string
  attachmentSha256: string
  sourceFile: string
  senderAddress: string | null
  receivedAt: string | null
  bytes: number | null
  lineCount: number | null
  parsedRowCount: number | null
  status: string
  errorText: string | null
}): unknown[] {
  return [
    log.sourceSlug,
    log.internetMessageId,
    log.attachmentName,
    log.attachmentSha256,
    log.sourceFile,
    log.senderAddress,
    log.receivedAt,
    log.bytes,
    log.lineCount,
    log.parsedRowCount,
    log.status,
    log.errorText,
  ]
}

export function assertNoRawUpdate(sql: string): void {
  if (/\bUPDATE\b/i.test(sql)) {
    throw new Error("AV_APP_WRITE_ROLE has no UPDATE on ASSEMBLEDVIEW.RAW")
  }
}
