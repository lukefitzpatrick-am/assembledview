/**
 * Transform 20 media_plan_<channel> Xano tables → line_items inserts.
 */
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import {
  lineItemAttrsByChannel,
  type LineChannel,
} from "@/db/schema"
import {
  asBool,
  asInt,
  asText,
  parseMoneyOrZero,
  type JsonlRow,
} from "./_shared"

export const CHANNEL_TABLES: Array<{ table: string; channel: LineChannel }> = [
  { table: "media_plan_television", channel: "television" },
  { table: "media_plan_radio", channel: "radio" },
  { table: "media_plan_cinema", channel: "cinema" },
  { table: "media_plan_newspaper", channel: "newspaper" },
  { table: "media_plan_magazines", channel: "magazines" },
  { table: "media_plan_ooh", channel: "ooh" },
  { table: "media_plan_prog_display", channel: "prog_display" },
  { table: "media_plan_prog_video", channel: "prog_video" },
  { table: "media_plan_prog_audio", channel: "prog_audio" },
  { table: "media_plan_prog_bvod", channel: "prog_bvod" },
  { table: "media_plan_prog_ooh", channel: "prog_ooh" },
  { table: "media_plan_digi_display", channel: "digi_display" },
  { table: "media_plan_digi_video", channel: "digi_video" },
  { table: "media_plan_digi_audio", channel: "digi_audio" },
  { table: "media_plan_digi_bvod", channel: "digi_bvod" },
  { table: "media_plan_social", channel: "social" },
  { table: "media_plan_search", channel: "search" },
  { table: "media_plan_influencers", channel: "influencers" },
  { table: "media_plan_integrations", channel: "integrations" },
  { table: "media_plan_production", channel: "production" },
]

const COMMON_SKIP = new Set([
  "id",
  "created_at",
  "mba_number",
  "mp_client_name",
  "mp_plannumber",
  "media_plan_version",
  "line_item",
  "line_item_id",
  "market",
  "buying_demo",
  "buy_type",
  "publisher",
  "platform",
  "bid_strategy",
  "fixed_cost_media",
  "client_pays_for_media",
  "budget_includes_fees",
  "no_adserving",
  "bursts",
  "bursts_json",
])

export type VersionRef = {
  id: number
  mbaNumber: string
  versionNumber: number
}

export type LineItemInsert = {
  versionId: number
  channel: LineChannel
  lineItemId: string
  position: number | null
  market: string | null
  buyingDemo: string | null
  buyType: string | null
  publisher: string | null
  platform: string | null
  bidStrategy: string | null
  fixedCostMedia: boolean | null
  clientPaysForMedia: boolean | null
  budgetIncludesFees: boolean | null
  noAdserving: boolean | null
  bursts: unknown
  attrs: Record<string, unknown>
  /** Xano source row id — used for dedupe, not inserted. */
  _xanoId: number
  _mbaNumber: string
}

export type DuplicateCollapse = {
  version_id: number
  mba_number: string
  line_item_id: string
  channel: string
  kept_id: number
  dropped_ids: string
  dropped_budget_sum: number
}

export type ProductionSkip = {
  xano_id: number
  mba_number: string
  mp_plannumber: string
  reason: string
}

function burstBudgetSum(bursts: unknown): number {
  if (!Array.isArray(bursts)) return 0
  let s = 0
  for (const b of bursts) {
    if (!b || typeof b !== "object") continue
    const row = b as Record<string, unknown>
    // Prefer budget; production uses cost × amount
    if (row.budget != null) {
      s += parseMoneyOrZero(row.budget)
    } else if (row.cost != null) {
      const cost = parseMoneyOrZero(row.cost)
      const amount = row.amount != null ? parseMoneyOrZero(row.amount) : 1
      s += cost * (amount || 1)
    }
  }
  return s
}

function buildAttrs(channel: LineChannel, row: JsonlRow): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (COMMON_SKIP.has(k)) continue
    attrs[k] = v
  }
  const validator = lineItemAttrsByChannel[channel]
  if (validator) {
    const parsed = validator.safeParse(attrs)
    if (parsed.success) return parsed.data as Record<string, unknown>
  }
  return attrs
}

function resolveVersionId(
  channel: LineChannel,
  row: JsonlRow,
  versionsById: Map<number, VersionRef>,
  versionsByMba: Map<string, VersionRef[]>,
  versionRemap?: Map<number, number>
): { versionId: number | null; skip?: ProductionSkip } {
  let direct = asInt(row.media_plan_version)
  if (direct != null && versionRemap?.has(direct)) {
    direct = versionRemap.get(direct)!
  }
  if (direct != null && versionsById.has(direct)) {
    return { versionId: direct }
  }
  if (direct != null && !versionsById.has(direct)) {
    return {
      versionId: null,
      skip: {
        xano_id: asInt(row.id) ?? 0,
        mba_number: String(row.mba_number ?? ""),
        mp_plannumber: String(row.mp_plannumber ?? ""),
        reason: `media_plan_version=${direct} not found in versions`,
      },
    }
  }

  // Production (and any other version-less row): mba_number + mp_plannumber
  if (channel !== "production" && direct == null) {
    return {
      versionId: null,
      skip: {
        xano_id: asInt(row.id) ?? 0,
        mba_number: String(row.mba_number ?? ""),
        mp_plannumber: String(row.mp_plannumber ?? ""),
        reason: "missing media_plan_version on non-production channel",
      },
    }
  }

  const mba = String(row.mba_number ?? "").trim()
  const planNum = asInt(row.mp_plannumber)
  if (!mba || planNum == null) {
    return {
      versionId: null,
      skip: {
        xano_id: asInt(row.id) ?? 0,
        mba_number: mba,
        mp_plannumber: String(row.mp_plannumber ?? ""),
        reason: "production row missing mba_number or mp_plannumber",
      },
    }
  }

  const candidates = versionsByMba.get(mba.toLowerCase()) ?? []
  const match = candidates.find((v) => v.versionNumber === planNum)
  if (!match) {
    return {
      versionId: null,
      skip: {
        xano_id: asInt(row.id) ?? 0,
        mba_number: mba,
        mp_plannumber: String(planNum),
        reason: `no version with version_number=${planNum} for MBA ${mba}`,
      },
    }
  }
  return { versionId: match.id }
}

function synthesizeLineItemId(
  channel: LineChannel,
  row: JsonlRow,
  versionId: number
): string {
  const existing = asText(row.line_item_id)?.trim()
  if (existing) return existing
  const mba = String(row.mba_number ?? "MBA").trim()
  const pos = asInt(row.line_item) ?? asInt(row.id) ?? 0
  // Stable synthetic id for production / missing ids
  return `${mba}-${channel}-v${versionId}-p${pos}`
}

function rowToInsert(
  channel: LineChannel,
  row: JsonlRow,
  versionId: number
): LineItemInsert {
  const bursts = resolveLineItemBursts(row)
  return {
    versionId,
    channel,
    lineItemId: synthesizeLineItemId(channel, row, versionId),
    position: asInt(row.line_item),
    market: asText(row.market),
    buyingDemo: asText(row.buying_demo),
    buyType: asText(row.buy_type),
    publisher: asText(row.publisher),
    platform: asText(row.platform),
    bidStrategy: asText(row.bid_strategy),
    fixedCostMedia: asBool(row.fixed_cost_media),
    clientPaysForMedia: asBool(row.client_pays_for_media),
    budgetIncludesFees: asBool(row.budget_includes_fees),
    noAdserving: asBool(row.no_adserving),
    bursts: bursts.length ? bursts : null,
    attrs: buildAttrs(channel, row),
    _xanoId: asInt(row.id) ?? 0,
    _mbaNumber: String(row.mba_number ?? ""),
  }
}

export function buildLineItems(args: {
  channelRows: Array<{ channel: LineChannel; rows: JsonlRow[] }>
  versionsById: Map<number, VersionRef>
  versionsByMba: Map<string, VersionRef[]>
  versionRemap?: Map<number, number>
}): {
  inserts: Omit<LineItemInsert, "_xanoId" | "_mbaNumber">[]
  duplicates: DuplicateCollapse[]
  skips: ProductionSkip[]
  rawRowCount: number
  collapsedAwayCount: number
} {
  const pending: LineItemInsert[] = []
  const skips: ProductionSkip[] = []
  let rawRowCount = 0

  for (const { channel, rows } of args.channelRows) {
    for (const row of rows) {
      rawRowCount++
      const resolved = resolveVersionId(
        channel,
        row,
        args.versionsById,
        args.versionsByMba,
        args.versionRemap
      )
      if (resolved.versionId == null) {
        if (resolved.skip) skips.push(resolved.skip)
        continue
      }
      pending.push(rowToInsert(channel, row, resolved.versionId))
    }
  }

  // Collapse duplicates per (versionId, lineItemId) → keep highest Xano id
  const groups = new Map<string, LineItemInsert[]>()
  for (const item of pending) {
    const key = `${item.versionId}::${item.lineItemId}`
    const g = groups.get(key) ?? []
    g.push(item)
    groups.set(key, g)
  }

  const duplicates: DuplicateCollapse[] = []
  const inserts: Omit<LineItemInsert, "_xanoId" | "_mbaNumber">[] = []
  let collapsedAwayCount = 0

  for (const group of groups.values()) {
    group.sort((a, b) => b._xanoId - a._xanoId)
    const kept = group[0]
    if (group.length > 1) {
      const dropped = group.slice(1)
      collapsedAwayCount += dropped.length
      duplicates.push({
        version_id: kept.versionId,
        mba_number: kept._mbaNumber,
        line_item_id: kept.lineItemId,
        channel: kept.channel,
        kept_id: kept._xanoId,
        dropped_ids: dropped.map((d) => d._xanoId).join("|"),
        dropped_budget_sum: Math.round(
          dropped.reduce((s, d) => s + burstBudgetSum(d.bursts), 0) * 100
        ) / 100,
      })
    }
    const { _xanoId: _a, _mbaNumber: _b, ...rest } = kept
    inserts.push(rest)
  }

  return { inserts, duplicates, skips, rawRowCount, collapsedAwayCount }
}

export { burstBudgetSum }
