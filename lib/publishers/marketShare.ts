/**
 * Publisher FY market share from published plan lines.
 *
 * Version rule matches dashboard spend: `published_version_id` and
 * `published_at` (`PUBLISHED_VERSION_JOIN_SQL`). Commercial rule matches
 * dashboard inclusion: booked, approved, or completed on that tip.
 * Spend is persisted burst `mediaAmount` (delivery media), else `budget`.
 * Fee math is not recomputed here.
 */

import { sql } from "drizzle-orm"
import { roundMoney2 } from "@/lib/format/money"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"
import { resolveCatalogueIdForProfileName } from "@/lib/mediaplans/ingest/publisherCatalogueJoin"
import type { PublisherMediaTypeShare } from "@/lib/types/publisher"

const COMMERCIAL_STATUSES = ["booked", "approved", "completed"] as const

export type MarketSharePublisher = {
  id: number
  publisherName: string | null
  publisherid: string | null
}

export type MarketShareLine = {
  mediaType: string
  publisher: string | null
  bursts: unknown
}

export type AustralianFyWindow = {
  start: string
  end: string
}

export function currentAustralianFyWindow(now = new Date()): AustralianFyWindow {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === "year")?.value)
  const month = Number(parts.find((part) => part.type === "month")?.value)
  const startYear = month >= 7 ? year : year - 1
  return { start: `${startYear}-07-01`, end: `${startYear + 1}-06-30` }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null
  return trimmed.slice(0, 10)
}

function burstOverlapsFy(burst: Record<string, unknown>, fy: AustralianFyWindow): boolean {
  const start = isoDate(burst.startDate ?? burst.start_date)
  const end = isoDate(burst.endDate ?? burst.end_date)
  if (!start && !end) return true
  const from = start ?? "0001-01-01"
  const to = end ?? "9999-12-31"
  return from <= fy.end && to >= fy.start
}

function burstBookedSpend(burst: Record<string, unknown>): number {
  const media = burst.mediaAmount ?? burst.media_amount
  if (media != null && String(media).trim() !== "") return parseBurstMoney(media)
  return parseBurstMoney(burst.budget)
}

export function lineBookedSpendInFy(bursts: unknown, fy: AustralianFyWindow): number {
  const list = Array.isArray(bursts) ? bursts : []
  let total = 0
  for (const burst of list) {
    if (!burst || typeof burst !== "object") continue
    const row = burst as Record<string, unknown>
    if (!burstOverlapsFy(row, fy)) continue
    total += burstBookedSpend(row)
  }
  return total
}

export function lineMatchesMarketSharePublisher(
  linePublisher: string | null | undefined,
  publisher: MarketSharePublisher,
): boolean {
  const stamp = String(linePublisher ?? "").trim()
  if (!stamp) return false
  const name = String(publisher.publisherName ?? "").trim()
  if (name && stamp.toLowerCase() === name.toLowerCase()) return true
  const businessId = String(publisher.publisherid ?? "").trim()
  if (businessId && stamp.toLowerCase() === businessId.toLowerCase()) return true
  const joined = resolveCatalogueIdForProfileName(stamp)
  return joined != null && joined === publisher.id
}

/**
 * Share rows for media types this publisher has FY lines on.
 * Empty when none of the lines match the publisher inside the FY.
 */
export function marketShareFromLines(
  lines: MarketShareLine[],
  publisher: MarketSharePublisher,
  fy: AustralianFyWindow,
): PublisherMediaTypeShare[] {
  const thisSpend = new Map<string, number>()
  const totalSpend = new Map<string, number>()
  const thisHasLine = new Set<string>()

  for (const line of lines) {
    const mediaType = String(line.mediaType ?? "").trim()
    if (!mediaType) continue
    const spend = lineBookedSpendInFy(line.bursts, fy)
    const matched = lineMatchesMarketSharePublisher(line.publisher, publisher)
    const overlaps = spend > 0 || lineHasFyBurst(line.bursts, fy)
    if (!overlaps) continue
    totalSpend.set(mediaType, (totalSpend.get(mediaType) ?? 0) + spend)
    if (!matched) continue
    thisHasLine.add(mediaType)
    thisSpend.set(mediaType, (thisSpend.get(mediaType) ?? 0) + spend)
  }

  if (thisHasLine.size === 0) return []

  return [...thisHasLine]
    .sort((a, b) => a.localeCompare(b))
    .map((mediaType) => {
      const thisPublisherSpend = roundMoney2(thisSpend.get(mediaType) ?? 0)
      const totalMarketSpend = roundMoney2(totalSpend.get(mediaType) ?? 0)
      const sharePercent =
        totalMarketSpend > 0
          ? roundMoney2((thisPublisherSpend / totalMarketSpend) * 100)
          : 0
      return { mediaType, thisPublisherSpend, totalMarketSpend, sharePercent }
    })
}

function lineHasFyBurst(bursts: unknown, fy: AustralianFyWindow): boolean {
  const list = Array.isArray(bursts) ? bursts : []
  return list.some((burst) => {
    if (!burst || typeof burst !== "object") return false
    return burstOverlapsFy(burst as Record<string, unknown>, fy)
  })
}

function executeRows(result: unknown): Record<string, unknown>[] {
  const withRows = result as { rows?: Record<string, unknown>[] }
  if (Array.isArray(withRows?.rows)) return withRows.rows
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  return []
}

export async function fetchPublisherMarketShareFromPostgres(
  publishersId: number,
  now = new Date(),
): Promise<PublisherMediaTypeShare[]> {
  if (!Number.isFinite(publishersId) || publishersId <= 0) return []

  const { getDb, schema } = await import("@/db")
  const { eq } = await import("drizzle-orm")
  const db = getDb()
  const publisherRows = await db
    .select({
      id: schema.publishers.id,
      publisherName: schema.publishers.publisherName,
      publisherid: schema.publishers.publisherid,
    })
    .from(schema.publishers)
    .where(eq(schema.publishers.id, publishersId))
    .limit(1)
  const publisher = publisherRows[0]
  if (!publisher) return []

  const fy = currentAustralianFyWindow(now)
  const result = await db.execute(sql`
    SELECT
      li.channel::text AS media_type,
      li.publisher AS publisher,
      li.bursts AS bursts
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
    INNER JOIN line_items li
      ON li.version_id = v.id
    WHERE lower(btrim(coalesce(v.campaign_status, ''))) IN ('booked', 'approved', 'completed')
      AND v.campaign_start_date IS NOT NULL
      AND v.campaign_end_date IS NOT NULL
      AND v.campaign_start_date <= ${fy.end}::date
      AND v.campaign_end_date >= ${fy.start}::date
  `)

  const lines: MarketShareLine[] = executeRows(result).map((row) => ({
    mediaType: String(row.media_type ?? row.channel ?? ""),
    publisher: row.publisher == null ? null : String(row.publisher),
    bursts: row.bursts,
  }))

  return marketShareFromLines(
    lines,
    {
      id: publisher.id,
      publisherName: publisher.publisherName,
      publisherid: publisher.publisherid,
    },
    fy,
  )
}

export const MARKET_SHARE_COMMERCIAL_STATUSES = COMMERCIAL_STATUSES
