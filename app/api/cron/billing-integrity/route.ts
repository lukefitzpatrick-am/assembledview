import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import {
  countFindingsBySeverity,
  flagIntegrityFindings,
  logIntegrityFinding,
  projectIntegrityRow,
  type IntegrityFinding,
  type IntegrityRow,
  type VersionMeta,
} from "@/lib/billing/integrityTripwire"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"
import { MEDIA_PLAN_TABLES } from "@/lib/xano/mediaPlanTables"
import { boundedMap } from "@/lib/utils/boundedMap"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const MEDIA_PLANS_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]
const PAGE_SIZE = 200
const MAX_PAGES = 500
const TABLE_CONCURRENCY = 4

async function fetchIntegrityRows(tableName: string): Promise<{
  rows: IntegrityRow[]
  complete: boolean
}> {
  const baseUrl = xanoUrl(tableName, MEDIA_PLANS_BASE_KEYS)
  const { items: raw, complete } = await fetchAllXanoPagesWithCompleteness(
    baseUrl,
    {},
    `billing-integrity:${tableName}`,
    PAGE_SIZE,
    MAX_PAGES
  )
  const rows: IntegrityRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    rows.push(projectIntegrityRow(item as Record<string, unknown>))
  }
  return { rows, complete }
}

async function loadKnownVersions(): Promise<{
  knownVersionIds: Set<number>
  knownVersions: Map<number, VersionMeta>
  currentVersionByMba: Map<string, number>
}> {
  const [mastersResult, versionsResult] = await Promise.all([
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("media_plan_master", MEDIA_PLANS_BASE_KEYS),
      {},
      "billing-integrity:media_plan_master",
      PAGE_SIZE,
      MAX_PAGES
    ),
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("media_plan_versions", MEDIA_PLANS_BASE_KEYS),
      {},
      "billing-integrity:media_plan_versions",
      PAGE_SIZE,
      MAX_PAGES
    ),
  ])

  const mbaLatest = buildMbaToLatestVersionMap(mastersResult.items)
  const currentVersionByMba = new Map<string, number>()
  for (const [mba, info] of mbaLatest) {
    currentVersionByMba.set(mba, info.versionNumber)
  }

  const knownVersionIds = new Set<number>()
  const knownVersions = new Map<number, VersionMeta>()
  for (const v of versionsResult.items) {
    if (!v || typeof v !== "object") continue
    const id = Number((v as { id?: unknown }).id)
    if (!Number.isFinite(id) || id <= 0) continue
    const mba = String(
      (v as { mba_number?: unknown }).mba_number ?? ""
    ).trim()
    const versionNumber = Number(
      (v as { version_number?: unknown }).version_number
    )
    if (!Number.isFinite(versionNumber)) continue
    knownVersionIds.add(id)
    knownVersions.set(id, {
      id,
      mba_number: mba,
      version_number: versionNumber,
    })
  }

  return { knownVersionIds, knownVersions, currentVersionByMba }
}

/**
 * Nightly read-only tripwire: duplicates, version-less production accumulation,
 * and orphan media_plan_version FKs across channel tables.
 *
 * Auth: `x-cron-secret` or `Authorization: Bearer <CRON_SECRET>` (same as
 * other `/api/cron/*` routes).
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 }
    )
  }

  const started = Date.now()

  try {
    const { knownVersionIds, knownVersions, currentVersionByMba } =
      await loadKnownVersions()

    const tableResults = await boundedMap(
      MEDIA_PLAN_TABLES,
      async (table) => {
        const { rows, complete } = await fetchIntegrityRows(table.table_name)
        const findings = flagIntegrityFindings({
          table: table.table_name,
          rows,
          knownVersionIds,
          knownVersions,
          currentVersionByMba,
          checkVersionLess: table.table_name === "media_plan_production",
        })
        return { table: table.table_name, complete, rowCount: rows.length, findings }
      },
      TABLE_CONCURRENCY
    )

    const findings: IntegrityFinding[] = []
    const incompleteTables: string[] = []
    let rowsScanned = 0

    for (const result of tableResults) {
      rowsScanned += result.rowCount
      if (!result.complete) incompleteTables.push(result.table)
      for (const finding of result.findings) {
        logIntegrityFinding(finding)
        findings.push(finding)
      }
    }

    const severityCounts = countFindingsBySeverity(findings)
    const kindCounts = {
      duplicate: findings.filter((f) => f.kind === "duplicate").length,
      version_less: findings.filter((f) => f.kind === "version_less").length,
      orphan: findings.filter((f) => f.kind === "orphan").length,
    }

    const durationMs = Date.now() - started
    console.info(
      `[billing-integrity] summary ${JSON.stringify({
        ok: true,
        durationMs,
        tablesScanned: MEDIA_PLAN_TABLES.length,
        rowsScanned,
        findingCount: findings.length,
        severityCounts,
        kindCounts,
        incompleteTables,
      })}`
    )

    return NextResponse.json({
      ok: true,
      durationMs,
      tablesScanned: MEDIA_PLAN_TABLES.length,
      rowsScanned,
      incompleteTables,
      severityCounts,
      kindCounts,
      findings,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[billing-integrity] failed ${JSON.stringify({
        ok: false,
        durationMs: Date.now() - started,
        error: message,
      })}`
    )
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - started },
      { status: 500 }
    )
  }
}
