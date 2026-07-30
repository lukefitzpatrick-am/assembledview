import "server-only"

import { getDb, schema } from "@/db"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import {
  parseXanoListPayload,
  xanoAuthHeader,
  xanoUrl,
} from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"

const DOMAIN = "pacing" as const

const MEDIA_PLANS_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

/**
 * Pacing-surface Xano reads owned by `DATA_BACKEND_PACING`:
 * - `media_plan_master` / `media_plan_versions` (live campaign crawl for burst /
 *   fixed-cost context — shared by every pacing composer)
 * - `pacing_orphan_fixes` (audit table; POST stays on Xano until write cutover)
 *
 * Channel `media_plan_*` line-item tables stay on Xano until T2e (media-plans
 * domain reassembles from consolidated `line_items`).
 * `fetchAllLineItems` → `XANO_LINE_ITEMS_SNAPSHOT` stays on Xano until T6.
 */

function asRecordList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === "object" && !Array.isArray(row)
    )
  }
  return parseXanoListPayload(body) as Record<string, unknown>[]
}

function createdAtMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : undefined
  }
  return undefined
}

function runPacingShadowCompare(
  table: string,
  xanoBody: unknown,
  postgresRows: Record<string, unknown>[],
  options: {
    financeDuplicateClass?: boolean
    duplicateNaturalKey?: (row: Record<string, unknown>) => string | null
  } = {}
): void {
  try {
    const event = compareReferenceRows(table, xanoBody, postgresRows, {
      domain: DOMAIN,
      postgresKeysOnly: true,
      ...options,
    })
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, table, err })
  }
}

// --- media_plan_master (pacing crawl shape) ---

/**
 * Map Postgres master (+ published version join) → Xano/pacing MediaPlanMaster fields.
 * `campaign_budget_cents` → `mp_campaignbudget` dollars; `version_number` from
 * published version row (watermark), never max(versions).
 */
export function mapPacingMasterFromPostgres(
  master: Record<string, unknown>,
  publishedVersion: Record<string, unknown> | null
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(master))
  const cents = api.campaign_budget_cents
  let mpCampaignbudget = 0
  if (typeof cents === "number" && Number.isFinite(cents)) {
    mpCampaignbudget = cents / 100
  } else if (cents != null) {
    const n = Number(cents)
    if (Number.isFinite(n)) mpCampaignbudget = n / 100
  }

  const versionNumber =
    publishedVersion != null
      ? Number(
          (publishedVersion as { version_number?: unknown; versionNumber?: unknown })
            .version_number ??
            (publishedVersion as { versionNumber?: unknown }).versionNumber ??
            0
        )
      : 0

  const created = createdAtMs(api.created_at)

  return {
    id: api.id,
    mba_number: api.mba_number,
    mp_client_name: api.mp_client_name ?? "",
    mp_campaignname: api.campaign_name ?? "",
    campaign_name: api.campaign_name ?? "",
    version_number: Number.isFinite(versionNumber) ? versionNumber : 0,
    campaign_status: api.campaign_status ?? "",
    campaign_start_date:
      typeof api.campaign_start_date === "string"
        ? api.campaign_start_date.slice(0, 10)
        : api.campaign_start_date ?? "",
    campaign_end_date:
      typeof api.campaign_end_date === "string"
        ? api.campaign_end_date.slice(0, 10)
        : api.campaign_end_date ?? "",
    mp_campaignbudget: mpCampaignbudget,
    ...(created != null ? { created_at: created } : {}),
  }
}

export async function fetchPacingMastersFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const [masters, versions] = await Promise.all([
    db.select().from(schema.mediaPlanMasters),
    db.select().from(schema.mediaPlanVersions),
  ])
  const versionById = new Map(
    versions.map((v) => [v.id, v as Record<string, unknown>] as const)
  )
  return masters.map((m) => {
    const row = m as Record<string, unknown>
    const pubId = row.publishedVersionId ?? row.published_version_id
    const published =
      pubId != null && Number.isFinite(Number(pubId))
        ? versionById.get(Number(pubId)) ?? null
        : null
    const publishedApi = published
      ? coerceNumericStringsToNumbers(toApiRow(published))
      : null
    return mapPacingMasterFromPostgres(row, publishedApi)
  })
}

export async function fetchPacingMastersFromXano(): Promise<Record<string, unknown>[]> {
  const endpoints = ["media_plan_master", "media_plans_master"] as const
  for (const endpoint of endpoints) {
    try {
      const url = xanoUrl(endpoint, [...MEDIA_PLANS_KEYS])
      const raw = await fetchAllXanoPages(url, {}, `PACING_READ_${endpoint}`, 200, 50)
      return asRecordList(raw)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) continue
      throw err
    }
  }
  return []
}

/**
 * Masters list for pacing composers (`fetchAllMasters`).
 * Serve Xano in xano/shadow; Postgres when `DATA_BACKEND_PACING=postgres`.
 */
export async function readPacingMasters(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchPacingMastersFromPostgres()
  }

  const xanoRows = await fetchPacingMastersFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPacingMastersFromPostgres()
        runPacingShadowCompare("media_plan_master", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "media_plan_master",
          err,
        })
      }
    })()
  }

  return xanoRows
}

// --- media_plan_versions (pacing crawl) ---

/** Pacing-relevant version fields only (skip legacy blobs / files). */
export function mapPacingVersionFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: api.id,
    mba_number: api.mba_number,
    version_number: api.version_number,
    brand: api.brand ?? null,
    campaign_name: api.campaign_name ?? null,
    campaign_status: api.campaign_status ?? null,
    campaign_start_date:
      typeof api.campaign_start_date === "string"
        ? api.campaign_start_date.slice(0, 10)
        : api.campaign_start_date ?? null,
    campaign_end_date:
      typeof api.campaign_end_date === "string"
        ? api.campaign_end_date.slice(0, 10)
        : api.campaign_end_date ?? null,
  }
}

export async function fetchPacingVersionsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.mediaPlanVersions)
  return rows.map((row) => mapPacingVersionFromPostgres(row as Record<string, unknown>))
}

export async function fetchPacingVersionsFromXano(): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("media_plan_versions", [...MEDIA_PLANS_KEYS])
  const raw = await fetchAllXanoPages(url, {}, "PACING_READ_VERSIONS", 200, 50)
  return asRecordList(raw).map((row) => ({
    id: row.id,
    mba_number: row.mba_number,
    version_number: row.version_number,
    brand: row.brand ?? null,
    campaign_name: row.campaign_name ?? null,
    campaign_status: row.campaign_status ?? null,
    campaign_start_date:
      typeof row.campaign_start_date === "string"
        ? row.campaign_start_date.slice(0, 10)
        : row.campaign_start_date ?? null,
    campaign_end_date:
      typeof row.campaign_end_date === "string"
        ? row.campaign_end_date.slice(0, 10)
        : row.campaign_end_date ?? null,
  }))
}

function versionDuplicateNaturalKey(row: Record<string, unknown>): string | null {
  const mba = String(row.mba_number ?? "")
    .trim()
    .toLowerCase()
  const vn = row.version_number
  if (!mba || vn == null || String(vn).trim() === "") return null
  return `mba_vn:${mba}::${String(vn).trim()}`
}

/**
 * Versions list for pacing (`fetchCurrentVersionRowsForMasters`).
 * Duplicate (mba, version_number) rows collapsed in PG are tagged duplicate-class.
 */
export async function readPacingVersions(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchPacingVersionsFromPostgres()
  }

  const xanoRows = await fetchPacingVersionsFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPacingVersionsFromPostgres()
        runPacingShadowCompare("media_plan_versions", xanoRows, postgresRows, {
          financeDuplicateClass: true,
          duplicateNaturalKey: versionDuplicateNaturalKey,
        })
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "media_plan_versions",
          err,
        })
      }
    })()
  }

  return xanoRows
}

// --- pacing_orphan_fixes ---

export function mapPacingOrphanFixFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

export async function fetchPacingOrphanFixesFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.pacingOrphanFixes)
  return rows.map((row) => mapPacingOrphanFixFromPostgres(row as Record<string, unknown>))
}

export async function fetchPacingOrphanFixesFromXano(): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("pacing_orphan_fixes", [...MEDIA_PLANS_KEYS])
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...xanoAuthHeader(),
    },
  })
  if (upstream.status >= 400) {
    throw new Error(`Xano pacing_orphan_fixes GET failed: ${upstream.status}`)
  }
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  return asRecordList(body)
}

/**
 * List orphan-fix audit rows (no hot UI GET today — used for shadow probe).
 * POST create stays on Xano via `createPacingOrphanFix`.
 */
export async function readPacingOrphanFixes(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchPacingOrphanFixesFromPostgres()
  }

  const xanoRows = await fetchPacingOrphanFixesFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchPacingOrphanFixesFromPostgres()
        runPacingShadowCompare("pacing_orphan_fixes", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "pacing_orphan_fixes",
          err,
        })
      }
    })()
  }

  return xanoRows
}

/**
 * Probe pacing Xano tables for shadow diffs (admin `?probe=pacing`).
 */
export async function probePacingShadowDiffs(): Promise<void> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend !== "shadow") return

  const tables: Array<{
    table: string
    run: () => Promise<{ xano: unknown; pg: Record<string, unknown>[] }>
    opts?: {
      financeDuplicateClass?: boolean
      duplicateNaturalKey?: (row: Record<string, unknown>) => string | null
    }
  }> = [
    {
      table: "media_plan_master",
      run: async () => ({
        xano: await fetchPacingMastersFromXano(),
        pg: await fetchPacingMastersFromPostgres(),
      }),
    },
    {
      table: "media_plan_versions",
      run: async () => ({
        xano: await fetchPacingVersionsFromXano(),
        pg: await fetchPacingVersionsFromPostgres(),
      }),
      opts: {
        financeDuplicateClass: true,
        duplicateNaturalKey: versionDuplicateNaturalKey,
      },
    },
    {
      table: "pacing_orphan_fixes",
      run: async () => ({
        xano: await fetchPacingOrphanFixesFromXano(),
        pg: await fetchPacingOrphanFixesFromPostgres(),
      }),
    },
  ]

  for (const { table, run, opts } of tables) {
    try {
      const { xano, pg } = await run()
      runPacingShadowCompare(table, xano, pg, opts)
    } catch (err) {
      console.error("[migration-shadow-diff] probe failed", { domain: DOMAIN, table, err })
    }
  }
}
