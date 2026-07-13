import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
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
    const maxDate = row?.MAX_DATE ? String(row.MAX_DATE).slice(0, 10) : null
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

export async function runOpsHealthChecks(now: Date = new Date()) {
  const asOfDate = getAsOfDate(now)

  const [platformChecks, xano, methodology] = await Promise.all([
    checkWarehouseAndVolume(asOfDate),
    checkXanoProxyLiveness(),
    checkPlanningMethodology(),
  ])

  // Struck: Xero daily sync (xero_sync_log) — no app client / Xano endpoint exists.
  // Finance only reads xero_sync_exceptions today.

  return {
    asOfDate,
    checkedAt: now.toISOString(),
    results: [platformChecks.freshness, platformChecks.volume, xano, methodology],
  }
}
