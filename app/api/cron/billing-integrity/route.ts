import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import {
  countFindingsBySeverity,
  flagIntegrityFindings,
  flagNoScheduleWithLines,
  logIntegrityFinding,
  projectIntegrityRow,
  type IntegrityFinding,
  type IntegrityRow,
  type NoScheduleVersionInput,
  type VersionMeta,
} from "@/lib/billing/integrityTripwire"
import { fetchAllXanoPagesWithCompleteness } from "@/lib/api/xanoPagination"
import { xanoUrl } from "@/lib/api/xano"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"
import { normalizeBillingScheduleToArray } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import { getBillingSchedule, getDeliverySchedule } from "@/lib/finance/normalizeFields"
import {
  canonicalizeBillingRow,
  canonicalizeDeliveryRow,
  flagRowsChecksumFindings,
  shouldRunRowsChecksumAudit,
  versionMetaFromRaw,
  type RowsChecksumVersionMeta,
} from "@/lib/finance/rows/checksumAudit"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import { MEDIA_PLAN_TABLES } from "@/lib/xano/mediaPlanTables"
import { boundedMap } from "@/lib/utils/boundedMap"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const MEDIA_PLANS_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]
const PAGE_SIZE = 200
const MAX_PAGES = 500
const TABLE_CONCURRENCY = 4

/**
 * Choice (S2-P6): extend nightly `/api/cron/billing-integrity` rather than a sibling route.
 * Channel duplicate/orphan scan stays nightly; rows checksum + writer_bypass run
 * weekly (Monday UTC) or on demand via `?rows_checksum=1`.
 */

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
  rowsVersionMetas: RowsChecksumVersionMeta[]
  noScheduleVersions: NoScheduleVersionInput[]
  versionsComplete: boolean
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
  const rowsVersionMetas: RowsChecksumVersionMeta[] = []
  const noScheduleVersions: NoScheduleVersionInput[] = []
  for (const v of versionsResult.items) {
    if (!v || typeof v !== "object") continue
    const raw = v as Record<string, unknown>
    const id = Number(raw.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const mba = String(raw.mba_number ?? "").trim()
    const versionNumber = Number(raw.version_number)
    if (!Number.isFinite(versionNumber)) continue
    knownVersionIds.add(id)
    knownVersions.set(id, {
      id,
      mba_number: mba,
      version_number: versionNumber,
    })
    const meta = versionMetaFromRaw(raw, currentVersionByMba)
    if (meta) rowsVersionMetas.push(meta)

    const billingNorm = normalizeBillingScheduleToArray(getBillingSchedule(raw))
    const deliveryNorm = normalizeBillingScheduleToArray(getDeliverySchedule(raw))
    noScheduleVersions.push({
      id,
      mba_number: mba,
      version_number: versionNumber,
      schedulesEmpty: billingNorm == null && deliveryNorm == null,
    })
  }

  return {
    knownVersionIds,
    knownVersions,
    currentVersionByMba,
    rowsVersionMetas,
    noScheduleVersions,
    versionsComplete: versionsResult.complete && mastersResult.complete,
  }
}

async function loadPlanRowsGrouped(): Promise<{
  billingByVersion: Map<number, PlanBillingRow[]>
  deliveryByVersion: Map<number, PlanDeliveryRow[]>
  complete: boolean
  rowCount: number
}> {
  const billingByVersion = new Map<number, PlanBillingRow[]>()
  const deliveryByVersion = new Map<number, PlanDeliveryRow[]>()
  let rowCount = 0

  const [billingResult, deliveryResult] = await Promise.all([
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("plan_billing_rows", MEDIA_PLANS_BASE_KEYS),
      {},
      "billing-integrity:plan_billing_rows",
      PAGE_SIZE,
      MAX_PAGES
    ).catch((error: unknown) => {
      console.warn(
        `[billing-integrity] plan_billing_rows fetch soft-fail ${JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        })}`
      )
      return { items: [] as unknown[], complete: false }
    }),
    fetchAllXanoPagesWithCompleteness(
      xanoUrl("plan_delivery_rows", MEDIA_PLANS_BASE_KEYS),
      {},
      "billing-integrity:plan_delivery_rows",
      PAGE_SIZE,
      MAX_PAGES
    ).catch((error: unknown) => {
      console.warn(
        `[billing-integrity] plan_delivery_rows fetch soft-fail ${JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        })}`
      )
      return { items: [] as unknown[], complete: false }
    }),
  ])

  for (const item of billingResult.items) {
    if (!item || typeof item !== "object") continue
    const row = canonicalizeBillingRow(item as Record<string, unknown>)
    if (!row.media_plan_version) continue
    const list = billingByVersion.get(row.media_plan_version) ?? []
    list.push(row)
    billingByVersion.set(row.media_plan_version, list)
    rowCount++
  }
  for (const item of deliveryResult.items) {
    if (!item || typeof item !== "object") continue
    const row = canonicalizeDeliveryRow(item as Record<string, unknown>)
    if (!row.media_plan_version) continue
    const list = deliveryByVersion.get(row.media_plan_version) ?? []
    list.push(row)
    deliveryByVersion.set(row.media_plan_version, list)
    rowCount++
  }

  return {
    billingByVersion,
    deliveryByVersion,
    complete: billingResult.complete && deliveryResult.complete,
    rowCount,
  }
}

/**
 * Nightly read-only tripwire: duplicates, version-less production accumulation,
 * and orphan media_plan_version FKs across channel tables.
 *
 * Weekly (Monday UTC) or `?rows_checksum=1`: also audit plan_*_rows checksums
 * vs snapshot_checksum and writer_bypass (rows without billing_rows_migrated).
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
  const url = new URL(request.url)
  const forceRows =
    url.searchParams.get("rows_checksum") === "1" ||
    url.searchParams.get("rows_checksum") === "true"
  const runRowsAudit = shouldRunRowsChecksumAudit({ force: forceRows })

  try {
    const {
      knownVersionIds,
      knownVersions,
      currentVersionByMba,
      rowsVersionMetas,
      noScheduleVersions,
      versionsComplete,
    } = await loadKnownVersions()

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
        return { table: table.table_name, complete, rowCount: rows.length, findings, rows }
      },
      TABLE_CONCURRENCY
    )

    const findings: IntegrityFinding[] = []
    const incompleteTables: string[] = []
    let rowsScanned = 0
    const rowCountByVersion = new Map<number, number>()

    for (const result of tableResults) {
      rowsScanned += result.rowCount
      if (!result.complete) incompleteTables.push(result.table)
      for (const finding of result.findings) {
        logIntegrityFinding(finding)
        findings.push(finding)
      }
      for (const row of result.rows) {
        const vid = Number(row.media_plan_version)
        if (!Number.isFinite(vid) || vid <= 0) continue
        rowCountByVersion.set(vid, (rowCountByVersion.get(vid) ?? 0) + 1)
      }
    }

    const noScheduleFindings = flagNoScheduleWithLines({
      versions: noScheduleVersions,
      rowCountByVersion,
      currentVersionByMba,
    })
    for (const finding of noScheduleFindings) {
      logIntegrityFinding(finding)
      findings.push(finding)
    }

    let rowsAudit: {
      ran: boolean
      planRowsScanned: number
      complete: boolean
    } = { ran: false, planRowsScanned: 0, complete: true }

    if (runRowsAudit) {
      const grouped = await loadPlanRowsGrouped()
      rowsAudit = {
        ran: true,
        planRowsScanned: grouped.rowCount,
        complete: grouped.complete && versionsComplete,
      }
      if (!grouped.complete) incompleteTables.push("plan_billing_rows", "plan_delivery_rows")
      if (!versionsComplete) incompleteTables.push("media_plan_versions")

      const rowsFindings = flagRowsChecksumFindings({
        versions: rowsVersionMetas,
        billingByVersion: grouped.billingByVersion,
        deliveryByVersion: grouped.deliveryByVersion,
      })
      for (const finding of rowsFindings) {
        logIntegrityFinding(finding)
        findings.push(finding)
      }
      rowsScanned += grouped.rowCount
    }

    const severityCounts = countFindingsBySeverity(findings)
    const kindCounts = {
      duplicate: findings.filter((f) => f.kind === "duplicate").length,
      version_less: findings.filter((f) => f.kind === "version_less").length,
      orphan: findings.filter((f) => f.kind === "orphan").length,
      checksum_drift: findings.filter((f) => f.kind === "checksum_drift").length,
      writer_bypass: findings.filter((f) => f.kind === "writer_bypass").length,
      migrated_empty_side: findings.filter((f) => f.kind === "migrated_empty_side")
        .length,
      no_schedule_with_lines: findings.filter((f) => f.kind === "no_schedule_with_lines")
        .length,
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
        rowsAudit,
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
      rowsAudit,
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
