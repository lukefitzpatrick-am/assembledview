import type { LineChannel } from "@/db/schema"
import { CHANNEL_ENDPOINT_TO_CHANNEL } from "@/lib/data/planShapes"
import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
} from "@/lib/delivery/deliverySourceMap"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { parseMoney } from "@/lib/money/parse"
import { toCents } from "@/lib/money/cents"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { assumedSpendForBurst } from "@/lib/spend/assumedSpend"
import type { XanoLineItem } from "@/lib/xano/fetchAllLineItems"

/**
 * Map Postgres line_items (+ mba) into the Snowflake snapshot row shape
 * shared with `fetchAllXanoLineItems`.
 */

export const CHANNEL_TO_SOURCE_TABLE = Object.fromEntries(
  Object.entries(CHANNEL_ENDPOINT_TO_CHANNEL).map(([table, channel]) => [
    channel,
    table,
  ])
) as Record<LineChannel, string>

function parseBurstsJson(raw: unknown): unknown[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function coerceCreatedAtMs(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1e12) return Math.floor(raw)
    if (raw > 1e9) return Math.floor(raw * 1000)
    return Math.floor(raw)
  }
  if (raw instanceof Date) return raw.getTime()
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return coerceCreatedAtMs(Number(raw))
  }
  const d = new Date(String(raw))
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function deriveLineItemName(row: {
  lineItemId: string
  platform: string | null
  bidStrategy: string | null
  buyType: string | null
}): string {
  const parts = [row.platform, row.bidStrategy, row.buyType].filter(
    (x) => x !== null && x !== undefined && String(x).trim() !== ""
  )
  return parts.length > 0 ? parts.map(String).join(" - ") : row.lineItemId
}

const OFFLINE_SOURCE_TABLES = new Set([
  "media_plan_television",
  "media_plan_radio",
  "media_plan_newspaper",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
])

const DIGITAL_SOURCE_TABLES = new Set([
  "media_plan_digi_display",
  "media_plan_digi_video",
  "media_plan_digi_audio",
  "media_plan_digi_bvod",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_audio",
  "media_plan_prog_bvod",
  "media_plan_prog_ooh",
])

export type PgLineRowMapped = {
  id: number
  createdAt: string | null
  lineItemId: string
  channel: LineChannel
  platform: string | null
  publisher?: string | null
  buyType: string | null
  bidStrategy: string | null
  fixedCostMedia: boolean | null
  noAdserving?: boolean | null
  clientPaysForMedia?: boolean | null
  budgetIncludesFees?: boolean | null
  feePct?: number
  asOfDate?: string
  bursts: unknown
  mbaNumber: string
}

function isValueAddBuyType(buyType: string | null | undefined): boolean {
  const bt = String(buyType ?? "").trim().toLowerCase()
  return bt === "bonus" || bt === "package_inclusions"
}

function burstRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function burstBuyType(burst: Record<string, unknown>, lineBuyType: string | null): string | undefined {
  const raw = burst.buyType ?? burst.buy_type
  if (typeof raw === "string" && raw.trim()) return raw
  return lineBuyType ?? undefined
}

function dateField(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.slice(0, 10)
}

function lineDeliveryMediaCents(args: {
  bursts: unknown[]
  buyType: string | null
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  feePct: number
}): number {
  let sum = 0
  for (const raw of args.bursts) {
    const burst = burstRecord(raw)
    if (!burst) continue
    const { deliveryMediaAmount } = computeBurstAmounts({
      rawBudget: parseMoney(burst.budget) ?? 0,
      budgetIncludesFees: args.budgetIncludesFees,
      clientPaysForMedia: args.clientPaysForMedia,
      feePct: args.feePct,
      buyType: burstBuyType(burst, args.buyType),
    })
    if (deliveryMediaAmount > 0) sum += toCents(deliveryMediaAmount)
  }
  return sum
}

function burstsWithAssumedDailyCents(args: {
  bursts: unknown[]
  buyType: string | null
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  feePct: number
  asOfDate: string
}): unknown[] {
  return args.bursts.map((raw) => {
    const burst = burstRecord(raw)
    if (!burst) return raw
    const startDate = dateField(burst.startDate ?? burst.start_date)
    const endDate = dateField(burst.endDate ?? burst.end_date)
    const assumedDailyCents = assumedSpendForBurst({
      rawBudget: parseMoney(burst.budget) ?? 0,
      budgetIncludesFees: args.budgetIncludesFees,
      clientPaysForMedia: args.clientPaysForMedia,
      feePct: args.feePct,
      buyType: burstBuyType(burst, args.buyType),
      startDate,
      endDate,
      asOfDate: args.asOfDate,
    })
    return { ...burst, assumedDailyCents }
  })
}

/**
 * True when the line should be paced as assumed spend.
 * Snowflake fact rows are not visible here. A later procedure deletes
 * assumed_spend rows when a digital line gains facts.
 */
export function assumeSpendForSnapshotLine(args: {
  buyType: string | null
  sourceTable: string
  noAdserving: boolean
  publisher: string | null
  platform: string | null
  deliveryMediaCents: number
}): boolean {
  if (isValueAddBuyType(args.buyType)) return false
  if (!(args.deliveryMediaCents > 0)) return false
  if (OFFLINE_SOURCE_TABLES.has(args.sourceTable)) return true
  if (!DIGITAL_SOURCE_TABLES.has(args.sourceTable)) return false
  if (!args.noAdserving) return false
  const key = deliverySourceLookupKey(args.publisher, args.platform)
  return lookupActiveDeliverySource(key) == null
}

export function mapPgLineItemToSnapshot(row: PgLineRowMapped): XanoLineItem | null {
  const line_item_id = String(row.lineItemId ?? "").trim()
  if (!line_item_id) return null

  const source_table = CHANNEL_TO_SOURCE_TABLE[row.channel]
  if (!source_table) {
    console.warn(
      `[fetchAllPgLineItems] unknown channel=${row.channel} id=${row.id}`
    )
    return null
  }

  const xano_row_id = Number(row.id)
  if (!Number.isFinite(xano_row_id)) return null

  const bursts = parseBurstsJson(row.bursts)
  const budgetIncludesFees = Boolean(row.budgetIncludesFees)
  const clientPaysForMedia = Boolean(row.clientPaysForMedia)
  const feePct = Number.isFinite(row.feePct) ? Number(row.feePct) : 0
  const noAdserving = Boolean(row.noAdserving)
  const asOfDate = row.asOfDate || getMelbourneTodayISO()
  const money = {
    bursts,
    buyType: row.buyType,
    budgetIncludesFees,
    clientPaysForMedia,
    feePct,
  }
  const publisher =
    row.publisher === null || row.publisher === undefined ? null : String(row.publisher)
  const platform =
    row.platform === null || row.platform === undefined ? null : String(row.platform)

  return {
    line_item_id,
    mba_number: String(row.mbaNumber ?? "").trim(),
    line_item_name: deriveLineItemName({
      lineItemId: line_item_id,
      platform: row.platform,
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
    }),
    platform,
    buy_type:
      row.buyType === null || row.buyType === undefined
        ? null
        : String(row.buyType),
    fixed_cost_media: Boolean(row.fixedCostMedia),
    bursts_json: burstsWithAssumedDailyCents({ ...money, asOfDate }),
    source_table,
    xano_row_id,
    xano_created_at: coerceCreatedAtMs(row.createdAt),
    no_adserving: noAdserving,
    assume_spend: assumeSpendForSnapshotLine({
      buyType: row.buyType,
      sourceTable: source_table,
      noAdserving,
      publisher,
      platform,
      deliveryMediaCents: lineDeliveryMediaCents(money),
    }),
  }
}
