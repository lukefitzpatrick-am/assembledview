import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"

type AvaSnowflakeParams = {
  mbaNumber?: string
  mediaType?: string
  dateFrom?: string
  dateTo?: string
}

type AvaSnowflakeFacts = {
  latestDeliveryDate: string | null
  spendToDate: number | null
  impressions: number | null
  clicks: number | null
  conversions: number | null
}

const DEFAULT_TTL_MS = 10 * 60 * 1000
const MAX_RANGE_DAYS = 180

const cache = new Map<string, { expiresAt: number; value: string }>()

function toISODate(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const dt = new Date(trimmed)
    if (Number.isNaN(dt.getTime())) return null
    return dt.toISOString().slice(0, 10)
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  const dt = new Date(String(value))
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

function addDaysISO(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function clampStartToMaxRange(startISO: string, endISO: string): string {
  const earliest = addDaysISO(endISO, -MAX_RANGE_DAYS)
  return startISO < earliest ? earliest : startISO
}

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function makeCacheKey(params: AvaSnowflakeParams): string {
  return [
    normalizeKeyPart(params.mbaNumber),
    normalizeKeyPart(params.mediaType),
    normalizeKeyPart(params.dateFrom),
    normalizeKeyPart(params.dateTo),
  ].join("|")
}

function formatMoneyAUD(value: number | null): string | null {
  if (value === null) return null
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(
      value
    )
  } catch {
    return String(value)
  }
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  const parsed = Number(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

async function queryFacts({
  mbaNumber,
  mediaType,
  dateFrom,
  dateTo,
}: Required<Pick<AvaSnowflakeParams, "mbaNumber">> & Pick<AvaSnowflakeParams, "mediaType" | "dateFrom" | "dateTo">) {
  const mba = String(mbaNumber).trim()
  const mbaLike = `%${mba.toLowerCase()}%`

  const endISO = toISODate(dateTo) ?? new Date().toISOString().slice(0, 10)
  const startISO = clampStartToMaxRange(toISODate(dateFrom) ?? addDaysISO(endISO, -30), endISO)

  const filters: string[] = []
  const binds: any[] = []

  // Match mbaNumber in common text/id fields.
  filters.push(
    `(LOWER(CAMPAIGN_NAME) LIKE ? OR LOWER(ENTITY_NAME) LIKE ? OR LOWER(LINE_ITEM_ID) LIKE ?)`
  )
  binds.push(mbaLike, mbaLike, mbaLike)

  // Optional mediaType filter (kept permissive but still parameterized).
  if (mediaType && typeof mediaType === "string" && mediaType.trim() !== "") {
    const mt = mediaType.trim().toLowerCase()
    // Guard against pathological binds while still allowing useful values.
    const cleaned = mt.replace(/[^a-z0-9 _-]/g, "").slice(0, 40)
    if (cleaned) {
      filters.push(`LOWER(CHANNEL) LIKE ?`)
      binds.push(`%${cleaned}%`)
    }
  }

  filters.push(`CAST(DATE_DAY AS DATE) BETWEEN TO_DATE(?) AND TO_DATE(?)`)
  binds.push(startISO, endISO)

  const whereClause = `WHERE ${filters.join(" AND ")}`

  // Use aggregation only (no large row pulls).
  const sql = `
    SELECT
      MAX(CAST(DATE_DAY AS DATE)) AS LATEST_DELIVERY_DATE,
      SUM(AMOUNT_SPENT) AS SPEND_TO_DATE,
      SUM(IMPRESSIONS) AS IMPRESSIONS,
      SUM(CLICKS) AS CLICKS,
      SUM(RESULTS) AS CONVERSIONS
    FROM ASSEMBLEDVIEW.MART.PACING_FACT
    ${whereClause}
  `

  const rows = await querySnowflake<any>(sql, binds, { label: "ava_snowflake_summary" })
  const row = rows?.[0] ?? null
  const facts: AvaSnowflakeFacts = {
    latestDeliveryDate: row?.LATEST_DELIVERY_DATE ? String(row.LATEST_DELIVERY_DATE).slice(0, 10) : null,
    spendToDate: safeNumber(row?.SPEND_TO_DATE),
    impressions: safeNumber(row?.IMPRESSIONS),
    clicks: safeNumber(row?.CLICKS),
    conversions: safeNumber(row?.CONVERSIONS),
  }

  return { facts, window: { startISO, endISO } }
}

export async function getAvaSnowflakeSummary(params: AvaSnowflakeParams): Promise<string> {
  const mbaNumber = String(params.mbaNumber ?? "").trim()
  if (!mbaNumber) return ""

  const cacheKey = makeCacheKey(params)
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.value

  const { facts, window } = await queryFacts({
    mbaNumber,
    mediaType: params.mediaType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  })

  const lines: string[] = []
  lines.push(`MBA: ${mbaNumber}`)
  if (params.mediaType) lines.push(`Media type filter: ${String(params.mediaType)}`)
  lines.push(`Query window: ${window.startISO} → ${window.endISO} (max ${MAX_RANGE_DAYS}d)`)
  if (facts.latestDeliveryDate) lines.push(`Latest delivery date: ${facts.latestDeliveryDate}`)
  if (facts.spendToDate !== null) lines.push(`Spend to date: ${formatMoneyAUD(facts.spendToDate) ?? facts.spendToDate}`)
  if (facts.impressions !== null) lines.push(`Impressions: ${Math.round(facts.impressions)}`)
  if (facts.clicks !== null) lines.push(`Clicks: ${Math.round(facts.clicks)}`)
  if (facts.conversions !== null) lines.push(`Conversions: ${Math.round(facts.conversions)}`)

  let summary = lines.join("\n")
  if (summary.length > 2000) summary = `${summary.slice(0, 1997)}...`

  cache.set(cacheKey, { value: summary, expiresAt: now + DEFAULT_TTL_MS })
  return summary
}

