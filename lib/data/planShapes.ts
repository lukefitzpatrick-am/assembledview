import {
  lineItemAttrsByChannel,
  type LineChannel,
  LINE_CHANNELS,
} from "@/db/schema"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

/**
 * Channels that store bursts under `bursts` (not `bursts_json`) in Xano.
 * Matches ETL COMMON_SKIP / resolveLineItemBursts contract.
 */
export const BURSTS_FIELD_AS_BURSTS = new Set<LineChannel>([
  "cinema",
  "radio",
  "production",
])

/** Xano table endpoint → consolidated `line_channel` enum. */
export const CHANNEL_ENDPOINT_TO_CHANNEL: Record<string, LineChannel> = {
  media_plan_television: "television",
  media_plan_radio: "radio",
  media_plan_cinema: "cinema",
  media_plan_newspaper: "newspaper",
  media_plan_magazines: "magazines",
  media_plan_ooh: "ooh",
  media_plan_prog_display: "prog_display",
  media_plan_prog_video: "prog_video",
  media_plan_prog_audio: "prog_audio",
  media_plan_prog_bvod: "prog_bvod",
  media_plan_prog_ooh: "prog_ooh",
  media_plan_digi_display: "digi_display",
  media_plan_digi_video: "digi_video",
  media_plan_digi_audio: "digi_audio",
  media_plan_digi_bvod: "digi_bvod",
  media_plan_social: "social",
  media_plan_search: "search",
  media_plan_influencers: "influencers",
  media_plan_integrations: "integrations",
  media_plan_production: "production",
}

/**
 * Known-corrupt MBAs (version-duplicate / double-count class from ETL).
 * Shadow extras on these are EXPECTED duplicate-class (T2c pattern).
 */
export const PLANS_DUPLICATE_CLASS_MBAS = new Set([
  "penfold015",
  "penfold013",
  "penfold014",
  "boss001",
])

/** Common typed columns restored to top-level on reassembly (excl. join keys). */
export const LINE_ITEM_COMMON_FIELDS = [
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
] as const

function createdAtMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

function burstsFieldForChannel(channel: LineChannel): "bursts" | "bursts_json" {
  return BURSTS_FIELD_AS_BURSTS.has(channel) ? "bursts" : "bursts_json"
}

/**
 * Spread `attrs` through the channel zod validator (passthrough keeps legacy keys).
 * Throws on hard schema failure so goldens catch spread mistakes.
 */
export function spreadAttrsForChannel(
  channel: LineChannel,
  attrs: unknown
): Record<string, unknown> {
  const validator = lineItemAttrsByChannel[channel]
  const parsed = validator.safeParse(attrs ?? {})
  if (!parsed.success) {
    throw new Error(
      `line_items.attrs failed zod for channel=${channel}: ${parsed.error.message}`
    )
  }
  return parsed.data as Record<string, unknown>
}

export type LineItemAssemblyContext = {
  versionId: number
  versionNumber: number
  mbaNumber: string
  mpClientName: string | null
}

/**
 * Reassemble one Postgres `line_items` row into the legacy per-channel Xano shape
 * (after parseXanoListPayload). Byte-compatible for consumers of get*LineItemsByMBA.
 */
export function mapLineItemFromPostgres(
  row: Record<string, unknown>,
  ctx: LineItemAssemblyContext
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  const channel = String(api.channel ?? "") as LineChannel
  if (!(LINE_CHANNELS as readonly string[]).includes(channel)) {
    throw new Error(`Unknown line_items.channel: ${api.channel}`)
  }

  const attrs = spreadAttrsForChannel(channel, api.attrs)
  const burstsKey = burstsFieldForChannel(channel)
  const bursts = api.bursts ?? null
  const created = createdAtMs(api.created_at)

  const out: Record<string, unknown> = {
    id: api.id,
    mba_number: ctx.mbaNumber,
    mp_client_name: ctx.mpClientName ?? "",
    mp_plannumber: String(ctx.versionNumber),
    media_plan_version: ctx.versionId,
    line_item_id: api.line_item_id,
    line_item: api.position ?? null,
    market: api.market ?? null,
    buying_demo: api.buying_demo ?? null,
    buy_type: api.buy_type ?? null,
    publisher: api.publisher ?? null,
    platform: api.platform ?? null,
    bid_strategy: api.bid_strategy ?? null,
    fixed_cost_media: api.fixed_cost_media ?? null,
    client_pays_for_media: api.client_pays_for_media ?? null,
    budget_includes_fees: api.budget_includes_fees ?? null,
    no_adserving: api.no_adserving ?? null,
    ...attrs,
    [burstsKey]: bursts,
  }
  if (created != null) out.created_at = created
  return out
}

/**
 * Normalise a line-item row for shadow/golden compare: join on `line_item_id`,
 * drop volatile ids / timestamps. Production rows often lack `line_item_id` in
 * Xano (ETL synthesizes `${mba}-${channel}-v${versionId}-p${pos}`) — fall back
 * to mba + mp_plannumber + position so both sides join. When on that fallback
 * path, drop ETL-only asymmetries (`line_item_id`, `media_plan_version`) so
 * they do not count as field diffs.
 */
export function normalizeLineItemForCompare(
  row: Record<string, unknown>
): Record<string, unknown> {
  const { id: _id, created_at: _c, ...rest } = row
  const lid = String(row.line_item_id ?? "").trim()
  const synthetic = /^[A-Za-z0-9]+-[a-z_]+-v\d+-p\d+$/i.test(lid)
  const useFallback = !lid || synthetic
  // Prefer mp_plannumber (version_number): Xano production often omits
  // media_plan_version (version id) while PG assembly always sets both.
  const fallback = [
    String(row.mba_number ?? "")
      .trim()
      .toLowerCase(),
    String(row.mp_plannumber ?? row.media_plan_version ?? "").trim(),
    String(row.line_item ?? "").trim(),
  ].join("::")
  const key = useFallback ? fallback : lid

  if (useFallback) {
    const {
      line_item_id: _lid,
      media_plan_version: _mpv,
      ...compareRest
    } = rest
    return { id: key || _id, line_item_id: null, ...compareRest }
  }

  return { id: key || _id, line_item_id: lid, ...rest }
}
