import type { LineChannel } from "@/db/schema"
import { CHANNEL_ENDPOINT_TO_CHANNEL } from "@/lib/data/planShapes"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { parseMoney } from "@/lib/money/parse"
import { toCents } from "@/lib/money/cents"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { assumeSpendForSnapshotLine } from "@/lib/spend/assumeSpendRule"
import { assumedSpendForBurst } from "@/lib/spend/assumedSpend"
import type { FixedCostSnapshotBurst, XanoLineItem } from "@/lib/xano/fetchAllLineItems"
import { normaliseFixedCostFrom } from "@/lib/mediaplan/fixedCostFrom"

/**
 * Map Postgres line_items (+ mba) into the Snowflake snapshot row shape
 * (`XanoLineItem`). The name is the warehouse row, not an HTTP client.
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
  /** B23: `line_items.fixed_cost_from`. */
  fixedCostFrom?: string | null
  noAdserving?: boolean | null
  clientPaysForMedia?: boolean | null
  budgetIncludesFees?: boolean | null
  feePct?: number
  asOfDate?: string
  bursts: unknown
  mbaNumber: string
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

/** Sydney civil day of a burst date. A stored instant is not sliced in UTC. */
function dateField(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return formatBurstDateLocal(raw)
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
 * Snapshot switches (B23). The sync is the single warehouse gate: off sends
 * null, so the procedure acts exactly as before.
 */
export type FixedCostSnapshotFlags = {
  /** `fixed_cost_report_net`: send per-burst net media and Melbourne days. */
  fixedCostReportNet: boolean
  /** `fixed_cost_from_date` and `fixed_cost_report_net`: send the date. */
  fixedCostFromDate: boolean
}

export const FIXED_COST_SNAPSHOT_FLAGS_OFF: FixedCostSnapshotFlags = Object.freeze({
  fixedCostReportNet: false,
  fixedCostFromDate: false,
})

/**
 * Per burst, index aligned to the stored bursts: Melbourne start and end days
 * and net media cents (`computeBurstAmounts` delivery media, the same net the
 * delivery schedule uses). FC4: the procedure reports net media.
 */
export function fixedCostSnapshotBursts(args: {
  bursts: unknown[]
  buyType: string | null
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  feePct: number
}): FixedCostSnapshotBurst[] {
  return args.bursts.map((raw, index) => {
    const burst = burstRecord(raw)
    if (!burst) return { index, startDay: null, endDay: null, netMediaCents: 0 }
    const { deliveryMediaAmount } = computeBurstAmounts({
      rawBudget: parseMoney(burst.budget) ?? 0,
      budgetIncludesFees: args.budgetIncludesFees,
      clientPaysForMedia: args.clientPaysForMedia,
      feePct: args.feePct,
      buyType: burstBuyType(burst, args.buyType),
    })
    const startDay = dateField(burst.startDate ?? burst.start_date) || null
    const endDay = dateField(burst.endDate ?? burst.end_date) || null
    return { index, startDay, endDay, netMediaCents: toCents(deliveryMediaAmount) }
  })
}

export function mapPgLineItemToSnapshot(
  row: PgLineRowMapped,
  flags: FixedCostSnapshotFlags = FIXED_COST_SNAPSHOT_FLAGS_OFF,
): XanoLineItem | null {
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

  const fixedCostMedia = Boolean(row.fixedCostMedia)
  const fixedCostBursts =
    flags.fixedCostReportNet && fixedCostMedia ? fixedCostSnapshotBursts(money) : null
  const fixedCostFrom =
    flags.fixedCostFromDate && flags.fixedCostReportNet && fixedCostMedia
      ? normaliseFixedCostFrom(row.fixedCostFrom)
      : null

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
    fixed_cost_media: fixedCostMedia,
    // B23: keys only when sent, so a switch-off row is the same object as before.
    ...(fixedCostFrom ? { fixed_cost_from: fixedCostFrom } : {}),
    ...(fixedCostBursts ? { fixed_cost_bursts_json: fixedCostBursts } : {}),
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
