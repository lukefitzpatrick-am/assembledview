import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import type {
  DeliveryPacingRow,
  LineItemPacingDailyPoint,
  LineItemPacingRow,
  PacingAlert,
  PacingMatchType,
  PacingSeverity,
  PacingTestMatchRow,
} from "@/lib/xano/pacing-types"

const VW_LINE = "ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING"
const VW_LINE_DAILY = "ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING_DAILY"
const VW_DELIVERY = "ASSEMBLEDVIEW.VW_PACING.V_DELIVERY_PACING"
const VW_ALERTS = "ASSEMBLEDVIEW.VW_PACING.V_PACING_ALERTS"
const FACT_DELIVERY = "ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY"

export type ClientFilterMode = { mode: "all" } | { mode: "none" } | { mode: "ids"; ids: number[] }

function clientPredicate(
  filter: ClientFilterMode,
  column = "CLIENTS_ID"
): { sql: string; binds: number[] } {
  if (filter.mode === "none") return { sql: " 1=0 ", binds: [] }
  if (filter.mode === "all") return { sql: " 1=1 ", binds: [] }
  const placeholders = filter.ids.map(() => "?").join(", ")
  return { sql: ` ${column} IN (${placeholders}) `, binds: filter.ids }
}

function num(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k]
    if (v === undefined || v === null) continue
    const n = typeof v === "number" ? v : Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function str(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

export function mapLineItemPacingRow(row: Record<string, unknown>): LineItemPacingRow {
  return {
    clients_id: num(row, "CLIENTS_ID", "clients_id") ?? 0,
    media_plan_id: num(row, "MEDIA_PLAN_ID", "media_plan_id"),
    av_line_item_id: str(row, "AV_LINE_ITEM_ID", "av_line_item_id") ?? "",
    av_line_item_label: str(row, "AV_LINE_ITEM_LABEL", "av_line_item_label"),
    mba_number: str(row, "MBA_NUMBER", "mba_number"),
    campaign_name: str(row, "CAMPAIGN_NAME", "campaign_name"),
    media_type: str(row, "MEDIA_TYPE", "media_type"),
    platform: str(row, "PLATFORM", "platform"),
    pacing_status: str(row, "PACING_STATUS", "pacing_status", "STATUS", "status") ?? "not_started",
    delivery_health: str(row, "DELIVERY_HEALTH", "delivery_health"),
    budget_amount: num(row, "BUDGET_AMOUNT", "budget_amount", "LINE_ITEM_BUDGET", "line_item_budget"),
    spend_amount: num(row, "SPEND_AMOUNT", "spend_amount", "ACTUAL_SPEND", "actual_spend"),
    pacing_ratio: num(row, "PACING_RATIO", "pacing_ratio"),
    expected_spend: num(row, "EXPECTED_SPEND", "expected_spend"),
    start_date: str(row, "START_DATE", "start_date"),
    end_date: str(row, "END_DATE", "end_date"),
  }
}

function mapDaily(row: Record<string, unknown>): LineItemPacingDailyPoint {
  return {
    delivery_date: str(row, "DELIVERY_DATE", "delivery_date", "DATE_DAY", "date_day") ?? "",
    av_line_item_id: str(row, "AV_LINE_ITEM_ID", "av_line_item_id") ?? "",
    spend: num(row, "SPEND", "spend", "AMOUNT_SPENT", "amount_spent"),
    impressions: num(row, "IMPRESSIONS", "impressions"),
    clicks: num(row, "CLICKS", "clicks"),
    conversions: num(row, "CONVERSIONS", "conversions"),
  }
}

function mapDelivery(row: Record<string, unknown>): DeliveryPacingRow {
  return {
    av_line_item_id: str(row, "AV_LINE_ITEM_ID", "av_line_item_id") ?? "",
    platform: str(row, "PLATFORM", "platform"),
    group_type: str(row, "GROUP_TYPE", "group_type"),
    campaign_name: str(row, "CAMPAIGN_NAME", "campaign_name"),
    group_name: str(row, "GROUP_NAME", "group_name"),
    delivery_date: str(row, "DELIVERY_DATE", "delivery_date", "DATE_DAY", "date_day"),
    spend: num(row, "SPEND", "spend", "AMOUNT_SPENT", "amount_spent"),
    impressions: num(row, "IMPRESSIONS", "impressions"),
    clicks: num(row, "CLICKS", "clicks"),
    conversions: num(row, "CONVERSIONS", "conversions", "RESULTS", "results"),
    ctr: num(row, "CTR", "ctr"),
    cpc: num(row, "CPC", "cpc"),
    cpa: num(row, "CPA", "cpa"),
    roas: num(row, "ROAS", "roas"),
    target_cpa: num(row, "TARGET_CPA", "target_cpa"),
    target_roas: num(row, "TARGET_ROAS", "target_roas"),
    delivery_health: str(row, "DELIVERY_HEALTH", "delivery_health"),
    reach: num(row, "REACH", "reach"),
    frequency: num(row, "FREQUENCY", "frequency"),
    viewable_impressions: num(row, "VIEWABLE_IMPRESSIONS", "viewable_impressions"),
    viewability: num(row, "VIEWABILITY", "viewability"),
    completed_views: num(row, "COMPLETED_VIEWS", "completed_views"),
    vcr: num(row, "VCR", "vcr"),
    delivery_pct: num(row, "DELIVERY_PCT", "delivery_pct"),
  }
}

function mapAlert(row: Record<string, unknown>): PacingAlert {
  return {
    clients_id: num(row, "CLIENTS_ID", "clients_id") ?? 0,
    severity: str(row, "SEVERITY", "severity") ?? "info",
    media_type: str(row, "MEDIA_TYPE", "media_type"),
    av_line_item_id: str(row, "AV_LINE_ITEM_ID", "av_line_item_id"),
    alert_message: str(row, "ALERT_MESSAGE", "alert_message", "MESSAGE", "message"),
    alert_code: str(row, "ALERT_CODE", "alert_code", "CODE", "code"),
    pacing_status: str(row, "PACING_STATUS", "pacing_status"),
  }
}

export async function fetchLineItemPacingRows(opts: {
  clientFilter: ClientFilterMode
  mediaType?: string | null
  mediaTypes?: string[] | null
  status?: string | null
  statuses?: string[] | null
  dateFrom?: string | null
  dateTo?: string | null
  search?: string | null
  limit?: number
  /** When set, restricts rows to this media plan version id (Xano / dim). */
  mediaPlanId?: number | null
}): Promise<LineItemPacingRow[]> {
  if (opts.clientFilter.mode === "none") return []
  const { sql: csql, binds: cbinds } = clientPredicate(opts.clientFilter)
  const binds: (string | number)[] = [...cbinds]
  const parts: string[] = [`SELECT * FROM ${VW_LINE} WHERE (${csql})`]

  const mp = opts.mediaPlanId
  if (mp != null && Number.isFinite(Number(mp))) {
    parts.push(` AND COALESCE(MEDIA_PLAN_ID, media_plan_id) = ? `)
    binds.push(Number(mp))
  }

  const mediaList =
    opts.mediaTypes?.length ? opts.mediaTypes : opts.mediaType?.trim() ? [opts.mediaType.trim()] : []
  if (mediaList.length === 1) {
    parts.push(` AND LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) = LOWER(?) `)
    binds.push(mediaList[0]!.toLowerCase())
  } else if (mediaList.length > 1) {
    const ph = mediaList.map(() => "?").join(", ")
    parts.push(` AND LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) IN (${ph}) `)
    binds.push(...mediaList.map((m) => m.toLowerCase()))
  }

  const statusList =
    opts.statuses?.length ? opts.statuses : opts.status?.trim() ? [opts.status.trim()] : []
  if (statusList.length === 1) {
    parts.push(
      ` AND LOWER(TRIM(COALESCE(PACING_STATUS, COALESCE(STATUS, '')))) = LOWER(?) `
    )
    binds.push(statusList[0]!.toLowerCase())
  } else if (statusList.length > 1) {
    const ph = statusList.map(() => "?").join(", ")
    parts.push(
      ` AND LOWER(TRIM(COALESCE(PACING_STATUS, COALESCE(STATUS, '')))) IN (${ph}) `
    )
    binds.push(...statusList.map((s) => s.toLowerCase()))
  }

  const df = opts.dateFrom?.trim()
  const dt = opts.dateTo?.trim()
  if (df && dt) {
    parts.push(
      ` AND (COALESCE(START_DATE, CAST('1900-01-01' AS DATE)) <= ?::DATE) AND (COALESCE(END_DATE, CAST('2999-12-31' AS DATE)) >= ?::DATE) `
    )
    binds.push(dt, df)
  }

  if (opts.search?.trim()) {
    const q = `%${opts.search.trim().toLowerCase()}%`
    parts.push(
      ` AND (
        LOWER(TRIM(COALESCE(AV_LINE_ITEM_ID, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(AV_LINE_ITEM_LABEL, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(CAMPAIGN_NAME, ''))) LIKE ?
        OR LOWER(TRIM(COALESCE(MBA_NUMBER, ''))) LIKE ?
      )`
    )
    binds.push(q, q, q, q)
  }

  const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 10_000)
  parts.push(` LIMIT ${limit}`)

  const sql = parts.join("")
  const raw = (await querySnowflake<Record<string, unknown>>(sql, binds, {
    label: "pacing_v_line_item",
  })) ?? []
  return raw.map((r) => mapLineItemPacingRow(r))
}

function lineItemScopeSql(
  filter: ClientFilterMode,
  tableAlias: string
): { sql: string; binds: number[] } {
  if (filter.mode === "none") return { sql: " 1=0 ", binds: [] }
  if (filter.mode === "all") return { sql: " 1=1 ", binds: [] }
  const { sql: csql, binds } = clientPredicate(filter)
  return {
    sql: ` ${tableAlias}.AV_LINE_ITEM_ID IN (SELECT AV_LINE_ITEM_ID FROM ${VW_LINE} WHERE (${csql})) `,
    binds: [...binds],
  }
}

export async function fetchLineItemPacingDaily(opts: {
  clientFilter: ClientFilterMode
  avLineItemId: string
  days: number
}): Promise<LineItemPacingDailyPoint[]> {
  if (opts.clientFilter.mode === "none") return []
  const days = Math.min(Math.max(opts.days, 1), 366)
  const { sql: scopeSql, binds: scopeBinds } = lineItemScopeSql(opts.clientFilter, "d")
  const binds: (string | number)[] = [...scopeBinds, opts.avLineItemId.trim(), -days]
  const sql = `
    SELECT d.* FROM ${VW_LINE_DAILY} d
    WHERE (${scopeSql})
      AND LOWER(TRIM(COALESCE(d.AV_LINE_ITEM_ID, ''))) = LOWER(TRIM(?))
      AND COALESCE(d.DELIVERY_DATE, d.DATE_DAY)::DATE >= DATEADD('day', ?, CURRENT_DATE())
    ORDER BY COALESCE(d.DELIVERY_DATE, d.DATE_DAY) ASC
    LIMIT 20000
  `
  const raw = (await querySnowflake<Record<string, unknown>>(sql, binds, {
    label: "pacing_v_line_daily",
  })) ?? []
  return raw.map((r) => mapDaily(r))
}

/** Many line items in one round-trip (cap 400 ids / request). */
export async function fetchLineItemPacingDailyBatch(opts: {
  clientFilter: ClientFilterMode
  avLineItemIds: readonly string[]
  days: number
}): Promise<Map<string, LineItemPacingDailyPoint[]>> {
  const out = new Map<string, LineItemPacingDailyPoint[]>()
  if (opts.clientFilter.mode === "none") return out
  const norm = [
    ...new Set(
      opts.avLineItemIds.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean)
    ),
  ].slice(0, 400)
  if (norm.length === 0) return out
  const days = Math.min(Math.max(opts.days, 1), 366)
  const { sql: scopeSql, binds: scopeBinds } = lineItemScopeSql(opts.clientFilter, "d")
  const placeholders = norm.map(() => "?").join(", ")
  const binds: (string | number)[] = [...scopeBinds, ...norm, -days]
  const sql = `
    SELECT d.* FROM ${VW_LINE_DAILY} d
    WHERE (${scopeSql})
      AND LOWER(TRIM(COALESCE(d.AV_LINE_ITEM_ID, ''))) IN (${placeholders})
      AND COALESCE(d.DELIVERY_DATE, d.DATE_DAY)::DATE >= DATEADD('day', ?, CURRENT_DATE())
    ORDER BY d.AV_LINE_ITEM_ID, COALESCE(d.DELIVERY_DATE, d.DATE_DAY) ASC
    LIMIT 500000
  `
  const raw =
    (await querySnowflake<Record<string, unknown>>(sql, binds, {
      label: "pacing_v_line_daily_batch",
    })) ?? []
  const lowerToOriginal = new Map<string, string>()
  for (const id of opts.avLineItemIds) {
    const t = String(id ?? "").trim()
    if (!t) continue
    lowerToOriginal.set(t.toLowerCase(), t)
  }
  for (const row of raw) {
    const mapped = mapDaily(row)
    const key = String(mapped.av_line_item_id ?? "").trim()
    const orig = lowerToOriginal.get(key.toLowerCase()) ?? key
    const list = out.get(orig) ?? []
    list.push(mapped)
    out.set(orig, list)
  }
  return out
}

export async function fetchDeliveryPacingRows(opts: {
  clientFilter: ClientFilterMode
  avLineItemId: string
  platform?: string | null
  groupType?: string | null
  limit?: number
}): Promise<DeliveryPacingRow[]> {
  if (opts.clientFilter.mode === "none") return []
  const { sql: scopeSql, binds: scopeBinds } = lineItemScopeSql(opts.clientFilter, "v")
  const binds: (string | number)[] = [...scopeBinds, opts.avLineItemId.trim()]
  const parts: string[] = [
    `SELECT v.* FROM ${VW_DELIVERY} v WHERE (${scopeSql}) AND LOWER(TRIM(COALESCE(v.AV_LINE_ITEM_ID, ''))) = LOWER(TRIM(?))`,
  ]
  if (opts.platform?.trim()) {
    parts.push(` AND LOWER(TRIM(COALESCE(v.PLATFORM, ''))) = LOWER(?) `)
    binds.push(opts.platform.trim())
  }
  if (opts.groupType?.trim()) {
    parts.push(` AND LOWER(TRIM(COALESCE(v.GROUP_TYPE, ''))) = LOWER(?) `)
    binds.push(opts.groupType.trim())
  }
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 50_000)
  parts.push(` LIMIT ${limit}`)
  const raw = (await querySnowflake<Record<string, unknown>>(parts.join(""), binds, {
    label: "pacing_v_delivery",
  })) ?? []
  return raw.map((r) => mapDelivery(r))
}

function severityRankExpr(column = "SEVERITY"): string {
  return `CASE LOWER(TRIM(COALESCE(${column}, '')))
    WHEN 'critical' THEN 3
    WHEN 'warning' THEN 2
    WHEN 'info' THEN 1
    ELSE 0 END`
}

export async function fetchPacingAlerts(opts: {
  clientFilter: ClientFilterMode
  severity?: string | null
  /** When set, include alerts at this severity or higher (info ≤ warning ≤ critical). */
  minSeverity?: PacingSeverity | string | null
  mediaType?: string | null
  mediaTypes?: string[] | null
  limit?: number
}): Promise<PacingAlert[]> {
  if (opts.clientFilter.mode === "none") return []
  const { sql: csql, binds: cbinds } = clientPredicate(opts.clientFilter)
  const binds: (string | number)[] = [...cbinds]
  const parts: string[] = [`SELECT * FROM ${VW_ALERTS} WHERE (${csql})`]
  if (opts.severity?.trim()) {
    parts.push(` AND LOWER(TRIM(COALESCE(SEVERITY, ''))) = LOWER(?) `)
    binds.push(opts.severity.trim())
  } else {
    const minRaw = opts.minSeverity?.trim()
    if (minRaw) {
      parts.push(` AND (${severityRankExpr()}) >= (CASE LOWER(TRIM(?))
        WHEN 'critical' THEN 3
        WHEN 'warning' THEN 2
        WHEN 'info' THEN 1
        ELSE 1 END) `)
      binds.push(minRaw.toLowerCase())
    }
  }
  const mediaList =
    opts.mediaTypes?.length ? opts.mediaTypes : opts.mediaType?.trim() ? [opts.mediaType.trim()] : []
  if (mediaList.length === 1) {
    parts.push(` AND LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) = LOWER(?) `)
    binds.push(mediaList[0]!.toLowerCase())
  } else if (mediaList.length > 1) {
    const ph = mediaList.map(() => "?").join(", ")
    parts.push(` AND LOWER(TRIM(COALESCE(MEDIA_TYPE, ''))) IN (${ph}) `)
    binds.push(...mediaList.map((m) => m.toLowerCase()))
  }
  const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 20_000)
  parts.push(` LIMIT ${limit}`)
  const raw = (await querySnowflake<Record<string, unknown>>(parts.join(""), binds, {
    label: "pacing_v_alerts",
  })) ?? []
  return raw.map((r) => mapAlert(r))
}

function matchExpr(
  column: string,
  matchType: PacingMatchType,
  pattern: string | null,
  binds: unknown[]
): string {
  if (matchType === "suffix_id") return " 1=1 "
  const p = (pattern ?? "").trim()
  if (!p) return " 1=1 "
  if (matchType === "exact") {
    binds.push(p.toLowerCase())
    return ` LOWER(TRIM(COALESCE(${column}, ''))) = ? `
  }
  if (matchType === "prefix") {
    binds.push(`${p.toLowerCase()}%`)
    return ` LOWER(COALESCE(${column}, '')) LIKE ? `
  }
  binds.push(p)
  return ` REGEXP_LIKE(COALESCE(${column}, ''), ?, 'i') `
}

export async function fetchTestMatchRows(params: {
  platform: string
  matchType: PacingMatchType
  campaignNamePattern: string | null
  groupNamePattern: string | null
  avLineItemCode?: string | null
  startDate: string
  endDate: string
}): Promise<PacingTestMatchRow[]> {
  const binds: unknown[] = []
  const platform = params.platform.trim()
  binds.push(platform)
  binds.push(params.startDate)
  binds.push(params.endDate)

  let sql: string
  if (params.matchType === "suffix_id") {
    const code = (params.avLineItemCode ?? "").trim().toLowerCase()
    if (!code) {
      return []
    }
    binds.push(code)
    sql = `
      SELECT DISTINCT
        CAMPAIGN_NAME,
        GROUP_NAME,
        GROUP_TYPE
      FROM ${FACT_DELIVERY}
      WHERE LOWER(TRIM(COALESCE(PLATFORM, ''))) = LOWER(?)
        AND COALESCE(DELIVERY_DATE, DATE_DAY)::DATE BETWEEN ?::DATE AND ?::DATE
        AND GROUP_TYPE IN ('ad_group', 'asset_group')
        AND LOWER(TRIM(REGEXP_SUBSTR(GROUP_NAME, '[^-]+$'))) = ?
      LIMIT 50
    `
  } else {
    const campExpr = matchExpr("CAMPAIGN_NAME", params.matchType, params.campaignNamePattern, binds)
    const grpExpr = matchExpr("GROUP_NAME", params.matchType, params.groupNamePattern, binds)
    sql = `
      SELECT DISTINCT
        CAMPAIGN_NAME,
        GROUP_NAME,
        GROUP_TYPE
      FROM ${FACT_DELIVERY}
      WHERE LOWER(TRIM(COALESCE(PLATFORM, ''))) = LOWER(?)
        AND COALESCE(DELIVERY_DATE, DATE_DAY)::DATE BETWEEN ?::DATE AND ?::DATE
        AND (${campExpr})
        AND (${grpExpr})
      LIMIT 50
    `
  }

  const raw =
    (await querySnowflake<Record<string, unknown>>(sql, binds as (string | number)[], {
      label: "pacing_test_match",
    })) ?? []

  return raw.map((r) => ({
    campaign_name: str(r, "CAMPAIGN_NAME", "campaign_name"),
    group_name: str(r, "GROUP_NAME", "group_name"),
    group_type: str(r, "GROUP_TYPE", "group_type"),
  }))
}
