import type { LineChannel } from "@/db/schema"
import { CHANNEL_ENDPOINT_TO_CHANNEL } from "@/lib/data/planShapes"
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

export type PgLineRowMapped = {
  id: number
  createdAt: string | null
  lineItemId: string
  channel: LineChannel
  platform: string | null
  buyType: string | null
  bidStrategy: string | null
  fixedCostMedia: boolean | null
  bursts: unknown
  mbaNumber: string
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

  return {
    line_item_id,
    mba_number: String(row.mbaNumber ?? "").trim(),
    line_item_name: deriveLineItemName({
      lineItemId: line_item_id,
      platform: row.platform,
      bidStrategy: row.bidStrategy,
      buyType: row.buyType,
    }),
    platform:
      row.platform === null || row.platform === undefined
        ? null
        : String(row.platform),
    buy_type:
      row.buyType === null || row.buyType === undefined
        ? null
        : String(row.buyType),
    fixed_cost_media: Boolean(row.fixedCostMedia),
    bursts_json: parseBurstsJson(row.bursts),
    source_table,
    xano_row_id,
    xano_created_at: coerceCreatedAtMs(row.createdAt),
  }
}
