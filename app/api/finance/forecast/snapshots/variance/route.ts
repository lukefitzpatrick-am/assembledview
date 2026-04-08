import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { fetchFinanceForecastRawFromXano } from "@/lib/finance/forecast/server/loadFinanceForecastDataset"
import { enrichFinanceForecastVarianceReportAttribution } from "@/lib/finance/forecast/snapshot/attribution/enrichVarianceReportAttribution"
import { compareFinanceForecastSnapshots } from "@/lib/finance/forecast/snapshot/varianceEngine"
import type { FinanceForecastMediaPlanVersionInput } from "@/lib/types/financeForecast"
import type { FinanceForecastScenario } from "@/lib/types/financeForecast"
import type { FinanceForecastSnapshotRecord } from "@/lib/types/financeForecastSnapshot"
import type { FinanceForecastVarianceReport } from "@/lib/types/financeForecastVariance"
import {
  fetchFinanceForecastSnapshotLinesFromXano,
  fetchFinanceForecastSnapshotListFromXano,
  findFinanceForecastSnapshotHeader,
  isSnapshotStorageConfigured,
} from "@/lib/finance/forecast/snapshot/xanoSnapshotQuery"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

function canAccessSnapshots(roles: string[]): boolean {
  return roles.includes("admin")
}

export type FinanceForecastVarianceSnapshotHeaderSummary = {
  id: string
  snapshot_label: string
  scenario: FinanceForecastScenario | null
  financial_year: number | null
  taken_at: string | null
}

function headerSummary(h: FinanceForecastSnapshotRecord | null, fallbackId: string): FinanceForecastVarianceSnapshotHeaderSummary {
  if (!h) {
    return {
      id: fallbackId,
      snapshot_label: `Snapshot ${fallbackId}`,
      scenario: null,
      financial_year: null,
      taken_at: null,
    }
  }
  return {
    id: String(h.id),
    snapshot_label: h.snapshot_label,
    scenario: h.scenario,
    financial_year: h.financial_year,
    taken_at: h.taken_at,
  }
}

export type FinanceForecastVarianceApiResponse = {
  ok: true
  older: FinanceForecastVarianceSnapshotHeaderSummary
  newer: FinanceForecastVarianceSnapshotHeaderSummary
  report: FinanceForecastVarianceReport
}

/**
 * POST — Compare two snapshots (admin only). Body:
 * `{ older_snapshot_id, newer_snapshot_id, include_unchanged?: boolean }`
 */
export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canAccessSnapshots(roles)) {
    return noStore({ error: "forbidden", message: "Only administrators can run variance reports." }, { status: 403 })
  }

  if (!isSnapshotStorageConfigured()) {
    return noStore(
      { error: "not_configured", message: "Snapshot storage is not configured on the server." },
      { status: 503 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return noStore({ error: "bad_request", message: "Invalid JSON." }, { status: 400 })
  }

  const olderId = String(body.older_snapshot_id ?? body.older_id ?? "").trim()
  const newerId = String(body.newer_snapshot_id ?? body.newer_id ?? "").trim()
  if (!olderId || !newerId) {
    return noStore(
      { error: "bad_request", message: "older_snapshot_id and newer_snapshot_id are required." },
      { status: 400 }
    )
  }
  if (olderId === newerId) {
    return noStore(
      { error: "bad_request", message: "Choose two different snapshots." },
      { status: 400 }
    )
  }

  const includeUnchanged = body.include_unchanged === true

  let list: Awaited<ReturnType<typeof fetchFinanceForecastSnapshotListFromXano>> = []
  try {
    list = await fetchFinanceForecastSnapshotListFromXano()
  } catch (err) {
    console.error("[variance] list fetch failed", err)
    return noStore(
      { error: "list_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  const olderHeader = await findFinanceForecastSnapshotHeader(olderId, list)
  const newerHeader = await findFinanceForecastSnapshotHeader(newerId, list)

  let linesOlder: Awaited<ReturnType<typeof fetchFinanceForecastSnapshotLinesFromXano>>
  let linesNewer: Awaited<ReturnType<typeof fetchFinanceForecastSnapshotLinesFromXano>>
  try {
    ;[linesOlder, linesNewer] = await Promise.all([
      fetchFinanceForecastSnapshotLinesFromXano(olderId),
      fetchFinanceForecastSnapshotLinesFromXano(newerId),
    ])
  } catch (err) {
    console.error("[variance] lines fetch failed", err)
    return noStore(
      { error: "lines_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  const report = compareFinanceForecastSnapshots(
    {
      snapshot_id: olderId,
      label: olderHeader?.snapshot_label,
      lines: linesOlder,
    },
    {
      snapshot_id: newerId,
      label: newerHeader?.snapshot_label,
      lines: linesNewer,
    },
    { include_unchanged: includeUnchanged }
  )

  try {
    const { versions } = await fetchFinanceForecastRawFromXano()
    const versionById = new Map<string, FinanceForecastMediaPlanVersionInput | Record<string, unknown>>()
    for (const v of versions) {
      const id = v.id != null && v.id !== "" ? String(v.id) : ""
      if (id) versionById.set(id, v)
    }
    enrichFinanceForecastVarianceReportAttribution(report, linesOlder, linesNewer, versionById)
  } catch (err) {
    console.error("[variance] attribution enrichment failed", err)
  }

  const payload: FinanceForecastVarianceApiResponse = {
    ok: true,
    older: headerSummary(olderHeader, olderId),
    newer: headerSummary(newerHeader, newerId),
    report,
  }

  return noStore(payload)
}
