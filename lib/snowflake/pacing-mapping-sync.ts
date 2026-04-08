import "server-only"

import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { querySnowflake } from "@/lib/snowflake/client"
import {
  sessionExecuteRows,
  sessionExecuteVoid,
  withSnowflakeSession,
} from "@/lib/snowflake/snowflakeSession"
import { PACING_MAPPINGS_PATH } from "@/lib/xano/pacingXanoApi"
import type { PacingMapping } from "@/lib/xano/pacing-types"

const DIM = "ASSEMBLEDVIEW.MART_PACING.DIM_PLAN_MAPPING"
const FACT_DELIVERY_DT = "ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY"
const FACT_DT = "ASSEMBLEDVIEW.MART_PACING.FACT_LINE_ITEM_PACING_DAILY"

/** Merge / upsert key: Xano `pacing_mappings.id` (see migration `10_dim_plan_mapping_xano_mapping_id.sql`). */
const COLS =
  "XANO_MAPPING_ID, CLIENTS_ID, MEDIA_PLAN_ID, AV_LINE_ITEM_ID, AV_LINE_ITEM_LABEL, MEDIA_TYPE, PLATFORM, MATCH_TYPE, CAMPAIGN_NAME_PATTERN, GROUP_NAME_PATTERN, AV_LINE_ITEM_CODE, BUDGET_SPLIT_PCT, LINE_ITEM_BUDGET, START_DATE, END_DATE, IS_ACTIVE, CREATED_AT, UPDATED_AT, CREATED_BY_USERS_ID, CREATED_VIA"

export function coercePacingMapping(raw: unknown): PacingMapping | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const id = Number(o.id)
  if (!Number.isFinite(id)) return null
  const clients_id = Number(o.clients_id)
  if (!Number.isFinite(clients_id)) return null
  const av_line_item_id = String(o.av_line_item_id ?? "").trim()
  if (!av_line_item_id) return null

  const media_plan_id = o.media_plan_id == null ? null : Number(o.media_plan_id)
  const match_type = String(o.match_type ?? "exact") as PacingMapping["match_type"]
  const budget_split_pct = Number(o.budget_split_pct ?? 100)
  const is_active = Boolean(o.is_active !== false && o.is_active !== 0 && o.is_active !== "false")

  return {
    id,
    clients_id,
    media_plan_id: media_plan_id !== null && Number.isFinite(media_plan_id) ? media_plan_id : null,
    av_line_item_id,
    av_line_item_label: o.av_line_item_label == null ? null : String(o.av_line_item_label),
    media_type: o.media_type == null ? null : String(o.media_type),
    platform: o.platform == null ? null : String(o.platform),
    match_type:
      match_type === "prefix" || match_type === "regex" || match_type === "exact" || match_type === "suffix_id"
        ? match_type
        : "exact",
    campaign_name_pattern: o.campaign_name_pattern == null ? null : String(o.campaign_name_pattern),
    group_name_pattern: o.group_name_pattern == null ? null : String(o.group_name_pattern),
    av_line_item_code:
      o.av_line_item_code == null || o.av_line_item_code === ""
        ? null
        : String(o.av_line_item_code).trim(),
    budget_split_pct: Number.isFinite(budget_split_pct) ? budget_split_pct : 100,
    line_item_budget: (() => {
      if (o.line_item_budget == null || o.line_item_budget === "") return null
      const n = Number(o.line_item_budget)
      return Number.isFinite(n) ? n : null
    })(),
    start_date: o.start_date == null || o.start_date === "" ? null : String(o.start_date).slice(0, 10),
    end_date: o.end_date == null || o.end_date === "" ? null : String(o.end_date).slice(0, 10),
    is_active,
    created_at: (o.created_at as number | string | null | undefined) ?? null,
    updated_at: (o.updated_at as number | string | null | undefined) ?? null,
    created_by_users_id: (() => {
      if (o.created_by_users_id == null || o.created_by_users_id === "") return null
      const n = Number(o.created_by_users_id)
      return Number.isFinite(n) ? n : null
    })(),
    created_via: (() => {
      const v = o.created_via
      if (v === null || v === undefined || v === "") return null
      const s = String(v).trim()
      if (s === "manual" || s === "search_sync") return s
      return null
    })(),
  }
}

function toSfTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().replace("T", " ").slice(0, 19)
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (n > 1e12) return new Date(n).toISOString().replace("T", " ").slice(0, 19)
    if (n > 1e9) return new Date(n * 1000).toISOString().replace("T", " ").slice(0, 19)
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 19).replace("T", " ")
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().replace("T", " ").slice(0, 19)
}

function mappingToBinds(m: PacingMapping): (string | number | boolean | null)[] {
  return [
    m.id,
    m.clients_id,
    m.media_plan_id,
    m.av_line_item_id,
    m.av_line_item_label,
    m.media_type,
    m.platform,
    m.match_type,
    m.campaign_name_pattern,
    m.group_name_pattern,
    m.av_line_item_code ?? null,
    m.budget_split_pct,
    m.line_item_budget,
    m.start_date,
    m.end_date,
    m.is_active,
    toSfTimestamp(m.created_at as number | string | null),
    toSfTimestamp(m.updated_at as number | string | null) ?? new Date().toISOString().replace("T", " ").slice(0, 19),
    m.created_by_users_id,
    m.created_via ?? null,
  ]
}

/**
 * MERGE one row into DIM_PLAN_MAPPING keyed on XANO_MAPPING_ID (= Xano id).
 */
export async function upsertMapping(mapping: PacingMapping): Promise<void> {
  const b = mappingToBinds(mapping)
  const sql = `
    MERGE INTO ${DIM} t
    USING (
      SELECT
        ?::NUMBER AS XANO_MAPPING_ID,
        ?::NUMBER AS CLIENTS_ID,
        ?::NUMBER AS MEDIA_PLAN_ID,
        ?::VARCHAR AS AV_LINE_ITEM_ID,
        ?::VARCHAR AS AV_LINE_ITEM_LABEL,
        ?::VARCHAR AS MEDIA_TYPE,
        ?::VARCHAR AS PLATFORM,
        ?::VARCHAR AS MATCH_TYPE,
        ?::VARCHAR AS CAMPAIGN_NAME_PATTERN,
        ?::VARCHAR AS GROUP_NAME_PATTERN,
        ?::VARCHAR AS AV_LINE_ITEM_CODE,
        ?::NUMBER AS BUDGET_SPLIT_PCT,
        ?::NUMBER AS LINE_ITEM_BUDGET,
        ?::DATE AS START_DATE,
        ?::DATE AS END_DATE,
        ?::BOOLEAN AS IS_ACTIVE,
        ?::TIMESTAMP_NTZ AS CREATED_AT,
        ?::TIMESTAMP_NTZ AS UPDATED_AT,
        ?::NUMBER AS CREATED_BY_USERS_ID,
        ?::VARCHAR AS CREATED_VIA
    ) s
    ON t.XANO_MAPPING_ID = s.XANO_MAPPING_ID
    WHEN MATCHED THEN UPDATE SET
      CLIENTS_ID = s.CLIENTS_ID,
      MEDIA_PLAN_ID = s.MEDIA_PLAN_ID,
      AV_LINE_ITEM_ID = s.AV_LINE_ITEM_ID,
      AV_LINE_ITEM_LABEL = s.AV_LINE_ITEM_LABEL,
      MEDIA_TYPE = s.MEDIA_TYPE,
      PLATFORM = s.PLATFORM,
      MATCH_TYPE = s.MATCH_TYPE,
      CAMPAIGN_NAME_PATTERN = s.CAMPAIGN_NAME_PATTERN,
      GROUP_NAME_PATTERN = s.GROUP_NAME_PATTERN,
      AV_LINE_ITEM_CODE = s.AV_LINE_ITEM_CODE,
      BUDGET_SPLIT_PCT = s.BUDGET_SPLIT_PCT,
      LINE_ITEM_BUDGET = s.LINE_ITEM_BUDGET,
      START_DATE = s.START_DATE,
      END_DATE = s.END_DATE,
      IS_ACTIVE = s.IS_ACTIVE,
      CREATED_AT = COALESCE(s.CREATED_AT, t.CREATED_AT),
      UPDATED_AT = s.UPDATED_AT,
      CREATED_BY_USERS_ID = s.CREATED_BY_USERS_ID,
      CREATED_VIA = s.CREATED_VIA
    WHEN NOT MATCHED THEN INSERT (${COLS})
      VALUES (
        s.XANO_MAPPING_ID, s.CLIENTS_ID, s.MEDIA_PLAN_ID, s.AV_LINE_ITEM_ID, s.AV_LINE_ITEM_LABEL,
        s.MEDIA_TYPE, s.PLATFORM, s.MATCH_TYPE, s.CAMPAIGN_NAME_PATTERN, s.GROUP_NAME_PATTERN, s.AV_LINE_ITEM_CODE,
        s.BUDGET_SPLIT_PCT, s.LINE_ITEM_BUDGET, s.START_DATE, s.END_DATE, s.IS_ACTIVE,
        COALESCE(s.CREATED_AT, CURRENT_TIMESTAMP()), s.UPDATED_AT, s.CREATED_BY_USERS_ID, s.CREATED_VIA
      )
  `
  await querySnowflake(sql, b, { label: "pacing_dim_merge" })
}

/**
 * Soft-delete in Snowflake so historical facts stay joinable.
 */
export async function deleteMapping(mapping_id: number): Promise<void> {
  const sql = `
    UPDATE ${DIM}
    SET IS_ACTIVE = FALSE,
        UPDATED_AT = CURRENT_TIMESTAMP()
    WHERE XANO_MAPPING_ID = ?
  `
  await querySnowflake(sql, [mapping_id], { label: "pacing_dim_soft_delete" })
}

export async function refreshFactDeliveryDaily(): Promise<void> {
  const sql = `ALTER DYNAMIC TABLE ${FACT_DELIVERY_DT} REFRESH`
  await querySnowflake(sql, [], { label: "pacing_dt_refresh_fact_delivery" })
}

export async function refreshFactLineItemPacingDaily(): Promise<void> {
  const sql = `ALTER DYNAMIC TABLE ${FACT_DT} REFRESH`
  await querySnowflake(sql, [], { label: "pacing_dt_refresh" })
}

/** Refresh delivery aggregate first, then line-item pacing (depends on delivery + dim). */
export async function refreshBothPacingMartDynamicTables(): Promise<void> {
  await refreshFactDeliveryDaily()
  await refreshFactLineItemPacingDaily()
}

export async function upsertMappingAndRefreshFact(mapping: PacingMapping): Promise<void> {
  await upsertMapping(mapping)
  await refreshFactLineItemPacingDaily()
}

export async function softDeleteMappingAndRefreshFact(mappingId: number): Promise<void> {
  await deleteMapping(mappingId)
  await refreshFactLineItemPacingDaily()
}

export async function resyncAllAndRefreshFact(): Promise<{
  inserted: number
  updated: number
  deleted: number
}> {
  const counts = await resyncAll()
  await refreshFactLineItemPacingDaily()
  return counts
}

async function fetchAllMappingsFromXano(): Promise<PacingMapping[]> {
  const url = xanoUrl(PACING_MAPPINGS_PATH, "XANO_CLIENTS_BASE_URL")
  const raw = await fetchAllXanoPages(url, {}, "PACING_MAPPINGS_RESYNC", 200, 100)
  const out: PacingMapping[] = []
  for (const row of raw) {
    const m = coercePacingMapping(row)
    if (m) out.push(m)
  }
  return out
}

const VALUE_PLACEHOLDERS = COLS.split(", ").map(() => "?").join(", ")
const INSERT_ONE_SQL = `INSERT INTO ${DIM} (${COLS}) VALUES (${VALUE_PLACEHOLDERS})`

/**
 * DELETE all dim rows (DML), reload from Xano, single transaction on one session.
 */
export async function resyncAll(): Promise<{ inserted: number; updated: number; deleted: number }> {
  const mappings = await fetchAllMappingsFromXano()

  return withSnowflakeSession(async (conn) => {
    await sessionExecuteVoid(conn, "BEGIN")
    try {
      const countRows = await sessionExecuteRows<{ C: number }>(
        conn,
        `SELECT COUNT(*)::NUMBER AS C FROM ${DIM}`
      )
      const deleted = Number(countRows[0]?.C ?? 0) || 0

      await sessionExecuteVoid(conn, `DELETE FROM ${DIM}`)

      let inserted = 0
      for (const m of mappings) {
        await sessionExecuteVoid(conn, INSERT_ONE_SQL, mappingToBinds(m))
        inserted += 1
      }

      await sessionExecuteVoid(conn, "COMMIT")
      return { inserted, updated: 0, deleted }
    } catch (e) {
      try {
        await sessionExecuteVoid(conn, "ROLLBACK")
      } catch {
        // ignore rollback errors
      }
      throw e
    }
  })
}
