import "server-only"

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { MEDIA_PLAN_TABLES, type XanoMediaPlanTable } from "@/lib/xano/mediaPlanTables"

const MEDIA_PLANS_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]
const PAGE_SIZE = 200
const MAX_PAGES = 500

export interface XanoLineItem {
  line_item_id: string
  mba_number: string
  line_item_name: string
  platform: string | null
  buy_type: string | null
  fixed_cost_media: boolean
  bursts_json: unknown[]
  source_table: string
  xano_row_id: number
  /** Unix milliseconds (normalized from Xano `created_at`). */
  xano_created_at: number
}

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
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    return coerceCreatedAtMs(Number(raw))
  }
  const d = new Date(String(raw))
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function deriveLineItemName(row: Record<string, unknown>): string {
  const lineItemId = String(row.line_item_id ?? "").trim()
  const parts = [row.platform, row.bid_strategy, row.buy_type].filter(
    (x) => x !== null && x !== undefined && String(x).trim() !== ""
  )
  return parts.length > 0 ? parts.map(String).join(" - ") : lineItemId
}

function normaliseLineItemId(raw: unknown): string | null {
  const s = String(raw ?? "").trim()
  return s.length > 0 ? s : null
}

function mapRowToLineItem(row: Record<string, unknown>, table: XanoMediaPlanTable): XanoLineItem | null {
  const line_item_id = normaliseLineItemId(row.line_item_id ?? row.lineItemId)
  if (!line_item_id) return null

  const idRaw = row.id ?? row.ID
  const xano_row_id = typeof idRaw === "number" ? idRaw : Number(idRaw)
  if (!Number.isFinite(xano_row_id)) return null

  return {
    line_item_id,
    mba_number: String(row.mba_number ?? row.mbaNumber ?? "").trim(),
    line_item_name: deriveLineItemName(row),
    platform:
      row.platform === null || row.platform === undefined ? null : String(row.platform),
    buy_type: row.buy_type === null || row.buy_type === undefined ? null : String(row.buy_type),
    fixed_cost_media: Boolean(row.fixed_cost_media),
    bursts_json: parseBurstsJson(row.bursts_json ?? row.bursts),
    source_table: table.table_name,
    xano_row_id,
    xano_created_at: coerceCreatedAtMs(row.created_at ?? row.createdAt),
  }
}

async function fetchAllFromTable(table: XanoMediaPlanTable): Promise<XanoLineItem[]> {
  const baseUrl = xanoUrl(table.table_name, MEDIA_PLANS_BASE_KEYS)
  const label = `LINE_ITEMS:${table.table_name}`
  const raw = await fetchAllXanoPages(baseUrl, {}, label, PAGE_SIZE, MAX_PAGES)
  const out: XanoLineItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const mapped = mapRowToLineItem(row as Record<string, unknown>, table)
    if (mapped) out.push(mapped)
  }
  return out
}

/**
 * Fetch every line item from all configured `media_plan_*` tables (paginated).
 * Caller syncs to Snowflake; consumers filter (e.g. `FIXED_COST_MEDIA`).
 */
export async function fetchAllXanoLineItems(): Promise<XanoLineItem[]> {
  const all: XanoLineItem[] = []
  for (const table of MEDIA_PLAN_TABLES) {
    const items = await fetchAllFromTable(table)
    all.push(...items)
    console.log(`[fetchAllXanoLineItems] ${table.table_name}: ${items.length} rows`)
  }
  return all
}
