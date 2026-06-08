import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import type {
  LineItemPacingRow,
  PacingAlert,
  PacingMatchType,
  PacingSeverity,
  PacingTestMatchRow,
} from "@/lib/xano/pacing-types"

const VW_LINE = "ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING"
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
  if (opts.clientFilter.mode === "none") {
    // TEMP DIAGNOSTIC — remove with fix commit
    console.log(
      "[pacing-diag] line-items SHORT CIRCUIT — clientFilter.mode === none, returning []"
    )
    return []
  }
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
  // TEMP DIAGNOSTIC — remove with fix commit
  console.log("[pacing-diag] line-items SQL", {
    sql,
    binds,
    predicateMode: opts.clientFilter.mode,
  })
  const raw = (await querySnowflake<Record<string, unknown>>(sql, binds, {
    label: "pacing_v_line_item",
  })) ?? []
  return raw.map((r) => mapLineItemPacingRow(r))
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
