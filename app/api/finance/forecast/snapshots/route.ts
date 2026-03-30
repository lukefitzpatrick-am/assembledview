import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import type { FinanceForecastDataset } from "@/lib/types/financeForecast"
import {
  buildSnapshotStagingPayload,
  type SnapshotApiMetaLike,
  type SnapshotSourceAuditFields,
} from "@/lib/finance/forecast/snapshot/buildSnapshotPayload"
import { checkSnapshotDuplicateGuard, recordSnapshotDedupeGuard } from "@/lib/finance/forecast/snapshot/duplicateGuard"
import { formatAutomatedSnapshotLabel } from "@/lib/finance/forecast/snapshot/labels"
import { hashFinanceForecastDataset } from "@/lib/finance/forecast/snapshot/serializeForSnapshotHash"
import { persistFinanceForecastSnapshotToXano } from "@/lib/finance/forecast/snapshot/xanoPersistSnapshot"
import {
  loadFinanceForecastDataset,
  normalizeScenario,
} from "@/lib/finance/forecast/server/loadFinanceForecastDataset"
import {
  fetchFinanceForecastSnapshotListFromXano,
  isSnapshotStorageConfigured,
} from "@/lib/finance/forecast/snapshot/xanoSnapshotQuery"

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

function canCreateFinanceForecastSnapshot(roles: string[]): boolean {
  return roles.includes("admin")
}

function isFinanceForecastDataset(body: unknown): body is FinanceForecastDataset {
  if (!body || typeof body !== "object") return false
  const d = body as FinanceForecastDataset
  if (!d.meta || typeof d.meta !== "object") return false
  if (typeof d.meta.financial_year_start_year !== "number") return false
  if (d.meta.scenario !== "confirmed" && d.meta.scenario !== "confirmed_plus_probable") return false
  if (!Array.isArray(d.client_blocks)) return false
  return true
}

function takenByFromSession(user: { email?: string | null; sub?: string | null }): string | null {
  return (
    (typeof user.email === "string" && user.email.length > 0 ? user.email : null) ||
    (typeof user.sub === "string" && user.sub.length > 0 ? user.sub : null) ||
    null
  )
}

function userDedupeKeyFromSession(user: { email?: string | null; sub?: string | null }): string {
  return (typeof user.sub === "string" && user.sub.length > 0 ? user.sub : null) || user.email || "unknown"
}

type SnapshotSuccessBody = {
  ok: true
  persisted: boolean
  snapshot_label: string
  taken_at: string
  line_count: number
  dataset_hash: string
  snapshot_id?: string
  reason?: string
}

/**
 * GET — List snapshot headers (admin only). Requires `XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL`.
 */
export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canCreateFinanceForecastSnapshot(roles)) {
    return noStore(
      { error: "forbidden", message: "Only administrators can list Finance Forecast snapshots." },
      { status: 403 }
    )
  }

  if (!isSnapshotStorageConfigured()) {
    return noStore({ snapshots: [], configured: false })
  }

  try {
    const snapshots = await fetchFinanceForecastSnapshotListFromXano()
    return noStore({ snapshots, configured: true })
  } catch (err) {
    console.error("[api/finance/forecast/snapshots] GET list failed", err)
    return noStore(
      {
        error: "list_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}

/**
 * POST — Create a Finance Forecast snapshot (admin only).
 *
 * **Server-computed** (preferred for UI):
 * `{ financial_year, scenario, notes?, client?, search?, q?, debug?, force_duplicate? }`
 * — runs `loadFinanceForecastDataset` on the server with the same filter semantics as GET `/api/finance/forecast`.
 *
 * **Legacy / staging**: `{ snapshot_label, dataset, api_meta?, filter_context?, ... }`
 * — persists a client-supplied dataset (e.g. integration tests).
 */
export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canCreateFinanceForecastSnapshot(roles)) {
    return noStore(
      {
        error: "forbidden",
        message: "Only administrators can create Finance Forecast snapshots.",
      },
      { status: 403 }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return noStore({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 })
  }

  if (!json || typeof json !== "object") {
    return noStore({ error: "bad_request", message: "Expected an object body." }, { status: 400 })
  }

  const body = json as Record<string, unknown>

  const hasFy =
    typeof body.financial_year === "number" ||
    typeof body.financial_year === "string" ||
    typeof body.fy === "number" ||
    typeof body.fy === "string"

  if (hasFy && body.dataset === undefined) {
    return await handleServerComputedSnapshot(session.user, body)
  }

  return await handleLegacySuppliedDataset(session.user, body)
}

async function handleServerComputedSnapshot(
  user: { email?: string | null; sub?: string | null },
  body: Record<string, unknown>
): Promise<NextResponse> {
  const fyRaw = body.financial_year ?? body.fy
  const fy = typeof fyRaw === "number" ? fyRaw : Number.parseInt(String(fyRaw ?? ""), 10)
  if (!Number.isFinite(fy) || fy < 1990 || fy > 2100) {
    return noStore({ error: "bad_request", message: "financial_year (or fy) must be a valid year." }, { status: 400 })
  }

  const scenarioNorm = normalizeScenario(typeof body.scenario === "string" ? body.scenario : null)
  if (!scenarioNorm) {
    return noStore(
      { error: "bad_request", message: "scenario is required: confirmed | confirmed_plus_probable" },
      { status: 400 }
    )
  }

  const clientFilterStr =
    typeof body.client === "string"
      ? body.client
      : typeof body.client_filter === "string"
        ? body.client_filter
        : ""
  const searchStr =
    typeof body.search === "string" ? body.search : typeof body.q === "string" ? body.q : ""

  const debugFlag =
    body.debug === true ||
    body.debug === "1" ||
    body.debug === "true" ||
    body.include_debug === true ||
    body.include_row_debug === true

  const forceDuplicate = body.force_duplicate === true || body.force_duplicate === "true"

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null

  const calculation_started_at = new Date().toISOString()
  let loaded: Awaited<ReturnType<typeof loadFinanceForecastDataset>>
  try {
    loaded = await loadFinanceForecastDataset({
      financialYearStartYear: fy,
      scenario: scenarioNorm,
      clientFilter: clientFilterStr.trim() || undefined,
      searchText: searchStr.trim() || undefined,
      allowedClientSlugs: null,
      includeRowDebug: debugFlag,
    })
  } catch (err) {
    console.error("[api/finance/forecast/snapshots] loadFinanceForecastDataset failed", err)
    return noStore(
      {
        error: "forecast_compute_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }

  const calculation_completed_at = new Date().toISOString()
  const dataset_hash = hashFinanceForecastDataset(loaded.dataset)
  const takenAtDate = new Date(calculation_completed_at)
  const snapshot_label = formatAutomatedSnapshotLabel(fy, scenarioNorm, takenAtDate, {
    repeatCapture: forceDuplicate,
  })

  const taken_by = takenByFromSession(user)
  const userKey = userDedupeKeyFromSession(user)

  const dup = checkSnapshotDuplicateGuard({
    userKey,
    fy,
    scenario: scenarioNorm,
    clientFilter: clientFilterStr,
    searchText: searchStr,
    includeDebug: debugFlag,
    datasetHash: dataset_hash,
    forceDuplicate,
  })

  if (!dup.allowed) {
    return noStore(
      {
        error: "duplicate_snapshot",
        message:
          "An identical snapshot (same filters and dataset) was captured moments ago. Wait a minute, change filters, or set force_duplicate: true to label the capture as a repeat.",
        retry_after_ms: dup.retry_after_ms,
      },
      { status: 409 }
    )
  }

  const source_audit: SnapshotSourceAuditFields = {
    calculation_started_at,
    calculation_completed_at,
    dataset_hash,
  }

  const filter_context: Record<string, unknown> = {
    client_filter: clientFilterStr.trim() || null,
    search_versions: searchStr.trim() || null,
    include_row_debug: debugFlag,
    calculation_started_at,
    calculation_completed_at,
    dataset_hash,
    snapshot_mode: "server_compute",
  }

  const staging = buildSnapshotStagingPayload({
    snapshot_label,
    snapshot_type: "server_compute",
    dataset: loaded.dataset,
    taken_by,
    taken_at: takenAtDate,
    notes,
    api_meta: loaded.meta,
    source_audit,
    filter_context,
  })

  const successBase: SnapshotSuccessBody = {
    ok: true,
    persisted: false,
    snapshot_label: staging.header.snapshot_label,
    taken_at: staging.header.taken_at,
    line_count: staging.lines.length,
    dataset_hash,
  }

  if (!process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL) {
    recordSnapshotDedupeGuard({
      userKey,
      fy,
      scenario: scenarioNorm,
      clientFilter: clientFilterStr,
      searchText: searchStr,
      includeDebug: debugFlag,
      datasetHash: dataset_hash,
    })
    return noStore({
      ...successBase,
      reason: "snapshot_storage_not_configured",
    })
  }

  try {
    const { snapshot_id } = await persistFinanceForecastSnapshotToXano(staging)
    recordSnapshotDedupeGuard({
      userKey,
      fy,
      scenario: scenarioNorm,
      clientFilter: clientFilterStr,
      searchText: searchStr,
      includeDebug: debugFlag,
      datasetHash: dataset_hash,
    })
    return noStore({
      ...successBase,
      persisted: true,
      snapshot_id,
    })
  } catch (err) {
    console.error("[api/finance/forecast/snapshots] persist failed", err)
    return noStore(
      {
        error: "snapshot_persist_failed",
        message: err instanceof Error ? err.message : String(err),
        dataset_hash,
        line_count: staging.lines.length,
        staging,
      },
      { status: 502 }
    )
  }
}

async function handleLegacySuppliedDataset(
  user: { email?: string | null; sub?: string | null },
  body: Record<string, unknown>
): Promise<NextResponse> {
  const snapshot_label = typeof body.snapshot_label === "string" ? body.snapshot_label.trim() : ""
  if (!snapshot_label) {
    return noStore({ error: "bad_request", message: "snapshot_label is required when supplying a dataset." }, { status: 400 })
  }

  const dataset = body.dataset
  if (!isFinanceForecastDataset(dataset)) {
    return noStore(
      {
        error: "bad_request",
        message:
          "dataset must be included for legacy mode, with meta.financial_year_start_year, meta.scenario, client_blocks[].",
      },
      { status: 400 }
    )
  }

  const snapshot_type =
    typeof body.snapshot_type === "string" && body.snapshot_type.trim().length > 0
      ? body.snapshot_type.trim()
      : "manual_import"
  const notes = typeof body.notes === "string" ? body.notes : null
  const api_meta = (body.api_meta ?? null) as SnapshotApiMetaLike | null
  const filter_context =
    body.filter_context && typeof body.filter_context === "object"
      ? (body.filter_context as Record<string, unknown>)
      : null
  const source_audit =
    body.source_audit && typeof body.source_audit === "object"
      ? (body.source_audit as SnapshotSourceAuditFields)
      : null

  const taken_by = takenByFromSession(user)

  const staging = buildSnapshotStagingPayload({
    snapshot_label,
    snapshot_type,
    dataset,
    taken_by,
    notes,
    api_meta,
    source_audit,
    filter_context,
  })

  const dataset_hash = hashFinanceForecastDataset(dataset)

  if (!process.env.XANO_FINANCE_FORECAST_SNAPSHOTS_BASE_URL) {
    return noStore({
      ok: true,
      persisted: false,
      reason: "snapshot_storage_not_configured",
      snapshot_label: staging.header.snapshot_label,
      taken_at: staging.header.taken_at,
      line_count: staging.lines.length,
      dataset_hash,
      staging,
    })
  }

  try {
    const { snapshot_id } = await persistFinanceForecastSnapshotToXano(staging)
    return noStore({
      ok: true,
      persisted: true,
      snapshot_label: staging.header.snapshot_label,
      taken_at: staging.header.taken_at,
      line_count: staging.lines.length,
      dataset_hash,
      snapshot_id,
    })
  } catch (err) {
    console.error("[api/finance/forecast/snapshots] POST legacy persist failed", err)
    return noStore(
      {
        error: "snapshot_persist_failed",
        message: err instanceof Error ? err.message : String(err),
        dataset_hash,
        line_count: staging.lines.length,
        staging,
      },
      { status: 502 }
    )
  }
}
