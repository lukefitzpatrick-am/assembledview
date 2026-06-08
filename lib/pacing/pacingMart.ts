import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import type { PacingMatchType, PacingTestMatchRow } from "@/lib/xano/pacing-types"

const FACT_DELIVERY = "ASSEMBLEDVIEW.MART_PACING.FACT_DELIVERY_DAILY"

function str(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
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
