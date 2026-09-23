import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/db"
import { querySnowflake } from "@/lib/snowflake/query"
import { normalizeDailyFactDate } from "@/lib/snowflake/normalizeDate"
import { SOCIAL_PACING_TABLE } from "@/lib/pacing/social-channels"
import { getAsOfDate, getMelbourneYesterdayISO } from "@/lib/pacing/maths"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaders } from "@/lib/api/xano"
import type { OpsCheckResult } from "./types"
import {
  daysBehindMaxDate,
  freshnessStatus,
  rowVolumeStatus,
  worstStatus,
} from "./status"

const SEARCH_FACT = "ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT"
const PACING_FACT = "ASSEMBLEDVIEW.MART.PACING_FACT"

type PlatformSpec = {
  name: string
  table: string
  channelWhere: string | null
}

/**
 * Platforms checked against existing MART facts (no new Snowflake objects).
 * cm360 → ad-serving channel (app convention); google → SEARCH_PACING_FACT.
 */
const PLATFORMS: PlatformSpec[] = [
  { name: "google", table: SEARCH_FACT, channelWhere: null },
  { name: "meta", table: SOCIAL_PACING_TABLE, channelWhere: "LOWER(CHANNEL) LIKE '%meta%'" },
  { name: "tiktok", table: SOCIAL_PACING_TABLE, channelWhere: "LOWER(CHANNEL) LIKE '%tiktok%'" },
  { name: "taboola", table: PACING_FACT, channelWhere: "LOWER(CHANNEL) LIKE '%taboola%'" },
  {
    name: "cm360",
    table: PACING_FACT,
    channelWhere: "(LOWER(CHANNEL) LIKE '%ad serving%' OR LOWER(CHANNEL) LIKE '%cm360%')",
  },
  {
    name: "dv360",
    table: PACING_FACT,
    channelWhere:
      "(LOWER(CHANNEL) LIKE '%dv360%' OR (LOWER(CHANNEL) LIKE '%programmatic%' AND LOWER(CHANNEL) NOT LIKE '%taboola%'))",
  },
]

type FreshnessRow = {
  PLATFORM: string
  MAX_DATE: string | null
  YDAY_ROWS: number | null
  TRAIL_MEAN: number | null
}

function addDaysISO(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`)
  const dt = new Date(ms + days * 86_400_000)
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function queryPlatformStats(yesterday: string): Promise<FreshnessRow[]> {
  const trailStart = addDaysISO(yesterday, -7)

  const parts = PLATFORMS.map((p) => {
    const whereExtra = p.channelWhere ? `AND ${p.channelWhere}` : ""
    return `
      SELECT
        '${p.name}' AS PLATFORM,
        MAX(CAST(DATE_DAY AS DATE)) AS MAX_DATE,
        COUNT_IF(CAST(DATE_DAY AS DATE) = TO_DATE(?)) AS YDAY_ROWS,
        (
          SELECT AVG(daily_cnt)
          FROM (
            SELECT CAST(DATE_DAY AS DATE) AS d, COUNT(*) AS daily_cnt
            FROM ${p.table}
            WHERE CAST(DATE_DAY AS DATE) >= TO_DATE(?)
              AND CAST(DATE_DAY AS DATE) < TO_DATE(?)
              ${whereExtra}
            GROUP BY 1
          )
        ) AS TRAIL_MEAN
      FROM ${p.table}
      WHERE 1=1 ${whereExtra}
    `
  })

  const binds: string[] = []
  for (let i = 0; i < PLATFORMS.length; i++) {
    binds.push(yesterday, trailStart, yesterday)
  }

  const sql = parts.join("\nUNION ALL\n")
  const rows = await querySnowflake<FreshnessRow>(sql, binds, {
    label: "ops_health_platform_stats",
  })
  return rows ?? []
}

function checksFromPlatformStats(
  asOfDate: string,
  rows: FreshnessRow[],
): { freshness: OpsCheckResult; volume: OpsCheckResult } {
  const byName = new Map(rows.map((r) => [String(r.PLATFORM).toLowerCase(), r]))
  const freshParts: string[] = []
  const freshStatuses: ReturnType<typeof freshnessStatus>[] = []
  const volParts: string[] = []
  const volStatuses: ReturnType<typeof rowVolumeStatus>[] = []

  for (const p of PLATFORMS) {
    const row = byName.get(p.name)
    const maxDate = row?.MAX_DATE ? normalizeDailyFactDate(row.MAX_DATE) : null
    const behind = daysBehindMaxDate(maxDate, asOfDate)
    const fSt = freshnessStatus(behind)
    freshStatuses.push(fSt)
    freshParts.push(
      `${p.name}: max=${maxDate ?? "none"} (${behind === null ? "?" : behind}d behind)`,
    )

    const yday = Number(row?.YDAY_ROWS ?? 0)
    const mean = Number(row?.TRAIL_MEAN ?? 0)
    const vSt = rowVolumeStatus(yday, mean)
    volStatuses.push(vSt)
    volParts.push(`${p.name}: yday=${yday} mean7=${Number.isFinite(mean) ? mean.toFixed(0) : "0"}`)
  }

  return {
    freshness: {
      name: "Warehouse freshness",
      status: worstStatus(freshStatuses),
      detail: freshParts.join("; "),
    },
    volume: {
      name: "Row-volume anomaly",
      status: worstStatus(volStatuses),
      detail: volParts.join("; "),
    },
  }
}

export async function checkWarehouseAndVolume(asOfDate: string): Promise<{
  freshness: OpsCheckResult
  volume: OpsCheckResult
}> {
  const yesterday = getMelbourneYesterdayISO(asOfDate)
  try {
    const rows = await queryPlatformStats(yesterday)
    return checksFromPlatformStats(asOfDate, rows)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      freshness: { name: "Warehouse freshness", status: "red", detail },
      volume: { name: "Row-volume anomaly", status: "red", detail },
    }
  }
}

/**
 * Authenticated GET against the clients collection (same URL as finance ref cache).
 * Does not use getCachedClients — that swallows errors into [].
 */
export async function checkXanoProxyLiveness(): Promise<OpsCheckResult> {
  try {
    const url = getXanoClientsCollectionUrl()
    const res = await fetch(url, {
      method: "GET",
      headers: xanoAuthHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return {
        name: "Xano proxy liveness",
        status: "red",
        detail: `GET clients → HTTP ${res.status}`,
      }
    }
    return {
      name: "Xano proxy liveness",
      status: "green",
      detail: `GET clients → HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      name: "Xano proxy liveness",
      status: "red",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

/** Methodology rows ≥ 9 (catches pending Snowsight seeds). */
export async function checkPlanningMethodology(): Promise<OpsCheckResult> {
  try {
    const meta = await getCachedPlanningMeta()
    const count = meta.methodology?.length ?? 0
    if (count >= 9) {
      return {
        name: "Planning methodology data",
        status: "green",
        detail: `${count} methodology rows (≥ 9)`,
      }
    }
    return {
      name: "Planning methodology data",
      status: "amber",
      detail: `${count} methodology rows (expected ≥ 9 — pending Snowsight seeds?)`,
    }
  } catch (err) {
    return {
      name: "Planning methodology data",
      status: "red",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export const XERO_SYNC_STAGES = ["invoices", "import", "contacts", "pdfs"] as const
export type XeroSyncStageName = (typeof XERO_SYNC_STAGES)[number]

const XERO_SYNC_GREEN_HOURS = 36
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000

export type XeroStageSuccess = {
  stage: string
  run_started_at: string | Date | null
}

export type XeroStageLogRow = {
  id?: number
  stage: string | null
  status: string | null
  run_started_at: string | Date | null
}

function ageHours(startedAt: Date, now: Date): number {
  return (now.getTime() - startedAt.getTime()) / 3_600_000
}

/**
 * Newest success row per stage. Green only when every stage succeeded within
 * 36h. Any missing or older success is red. There is no amber band.
 */
export function xeroSyncFreshnessFromStages(
  newestSuccessByStage: Partial<Record<XeroSyncStageName, XeroStageSuccess | null>>,
  now: Date = new Date(),
): OpsCheckResult {
  const name = "Xero sync freshness"
  const parts: string[] = []
  let red = false
  for (const stage of XERO_SYNC_STAGES) {
    const row = newestSuccessByStage[stage]
    if (!row?.run_started_at) {
      red = true
      parts.push(`${stage}=none`)
      continue
    }
    const startedAt = new Date(row.run_started_at)
    if (Number.isNaN(startedAt.getTime())) {
      red = true
      parts.push(`${stage}=unparseable`)
      continue
    }
    const hours = ageHours(startedAt, now)
    if (hours > XERO_SYNC_GREEN_HOURS) red = true
    parts.push(`${stage}=${Math.round(hours)}h`)
  }
  return {
    name,
    status: red ? "red" : "green",
    detail: parts.join("; "),
  }
}

function isStaleRunning(row: XeroStageLogRow, now: Date): boolean {
  if (row.status !== "running" || !row.run_started_at) return false
  const started = new Date(row.run_started_at)
  if (Number.isNaN(started.getTime())) return true
  return now.getTime() - started.getTime() > STALE_RUNNING_MS
}

function isStageFailure(row: XeroStageLogRow, now: Date): boolean {
  if (row.status === "failed" || row.status === "incomplete") return true
  return isStaleRunning(row, now)
}

/**
 * A stage alerts when its two newest considered runs both failed or timed out.
 * `incomplete` is the clean budget stop. A `running` row older than 2h is a
 * platform kill. A `running` row newer than 2h is still in flight and skipped.
 */
export function xeroStageConsecutiveFailures(
  rows: XeroStageLogRow[],
  now: Date = new Date(),
): XeroSyncStageName[] {
  const alerted: XeroSyncStageName[] = []
  for (const stage of XERO_SYNC_STAGES) {
    const considered = rows
      .filter((r) => r.stage === stage)
      .filter((r) => r.status !== "running" || isStaleRunning(r, now))
      .toSorted((a, b) => (b.id ?? 0) - (a.id ?? 0))
    const newest = considered.slice(0, 2)
    if (newest.length === 2 && newest.every((r) => isStageFailure(r, now))) {
      alerted.push(stage)
    }
  }
  return alerted
}

export function xeroStageFailureCheck(
  rows: XeroStageLogRow[],
  now: Date = new Date(),
): OpsCheckResult {
  const name = "Xero sync stage failures"
  const alerted = xeroStageConsecutiveFailures(rows, now)
  if (alerted.length === 0) {
    return { name, status: "green", detail: "no stage failed twice in a row" }
  }
  return {
    name,
    status: "red",
    detail: alerted
      .map((stage) => `${stage} failed or timed out on 2 consecutive runs`)
      .join("; "),
  }
}

export async function checkXeroSyncFreshness(
  now: Date = new Date(),
): Promise<OpsCheckResult> {
  try {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (stage)
        stage, run_started_at
      FROM xero_sync_log
      WHERE status = 'success'
        AND stage IN ('invoices', 'import', 'contacts', 'pdfs')
      ORDER BY stage, run_started_at DESC NULLS LAST
    `)
    const rows = (
      Array.isArray(result)
        ? result
        : ((result as { rows?: XeroStageSuccess[] }).rows ?? [])
    ) as XeroStageSuccess[]
    const byStage: Partial<Record<XeroSyncStageName, XeroStageSuccess | null>> = {}
    for (const stage of XERO_SYNC_STAGES) byStage[stage] = null
    for (const row of rows) {
      if (
        row.stage === "invoices" ||
        row.stage === "import" ||
        row.stage === "contacts" ||
        row.stage === "pdfs"
      ) {
        byStage[row.stage] = row
      }
    }
    return xeroSyncFreshnessFromStages(byStage, now)
  } catch (err) {
    return {
      name: "Xero sync freshness",
      status: "red",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function checkXeroStageFailures(
  now: Date = new Date(),
): Promise<OpsCheckResult> {
  try {
    const result = await db.execute(sql`
      SELECT id, stage, status, run_started_at
      FROM xero_sync_log
      WHERE stage IN ('invoices', 'import', 'contacts', 'pdfs')
      ORDER BY id DESC
      LIMIT 40
    `)
    const rows = (
      Array.isArray(result)
        ? result
        : ((result as { rows?: XeroStageLogRow[] }).rows ?? [])
    ) as XeroStageLogRow[]
    return xeroStageFailureCheck(
      rows.map((r) => ({ ...r, id: r.id != null ? Number(r.id) : undefined })),
      now,
    )
  } catch (err) {
    return {
      name: "Xero sync stage failures",
      status: "red",
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runOpsHealthChecks(now: Date = new Date()) {
  const asOfDate = getAsOfDate(now)

  const [platformChecks, xano, methodology, xeroSync, xeroFailures] = await Promise.all([
    checkWarehouseAndVolume(asOfDate),
    checkXanoProxyLiveness(),
    checkPlanningMethodology(),
    checkXeroSyncFreshness(now),
    checkXeroStageFailures(now),
  ])

  return {
    asOfDate,
    checkedAt: now.toISOString(),
    results: [
      platformChecks.freshness,
      platformChecks.volume,
      xano,
      methodology,
      xeroSync,
      xeroFailures,
    ],
  }
}
