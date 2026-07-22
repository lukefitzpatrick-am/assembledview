import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getUserRoles } from "@/lib/rbac"
import {
  isFinanceForecastLineKey,
  isFinanceForecastMonthKey,
  isTargetStorageConfigured,
  fetchRevenueForecastTargetLinesFromXano,
  targetLineNaturalKey,
  upsertRevenueForecastTargetLine,
  upsertRevenueForecastTargetLinesBatch,
} from "@/lib/finance/forecast/targets/xanoTargetLines"
import { writeStatusChangeEdit } from "@/lib/finance/writeFinanceAuditEdits"
import type {
  FinanceForecastTargetUpsertCell,
} from "@/lib/types/financeForecastTargets"

export const maxDuration = 60

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: unknown, init?: ResponseInit) {
  const res = NextResponse.json(json, init)
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

function canManageForecastTargets(roles: string[]): boolean {
  return roles.includes("admin")
}

function parseFy(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseUpsertCell(raw: Record<string, unknown>): FinanceForecastTargetUpsertCell | { error: string } {
  const client_id =
    raw.client_id != null && String(raw.client_id).trim() !== ""
      ? String(raw.client_id).trim()
      : ""
  if (!client_id) return { error: "client_id is required." }

  const fyRaw = raw.financial_year_start_year ?? raw.fy
  const financial_year_start_year =
    typeof fyRaw === "number"
      ? fyRaw
      : typeof fyRaw === "string"
        ? Number.parseInt(fyRaw, 10)
        : NaN
  if (!Number.isFinite(financial_year_start_year)) {
    return { error: "financial_year_start_year (or fy) is required." }
  }

  if (!isFinanceForecastLineKey(raw.line_key)) {
    return { error: "line_key must be a FinanceForecastLineKey." }
  }
  if (!isFinanceForecastMonthKey(raw.month_key)) {
    return { error: "month_key must be a FinanceForecastMonthKey (july…june)." }
  }

  const amount = parseAmount(raw.amount)
  if (amount == null) return { error: "amount must be a finite number." }

  const client_name =
    raw.client_name == null
      ? null
      : typeof raw.client_name === "string"
        ? raw.client_name
        : String(raw.client_name)

  return {
    client_id,
    financial_year_start_year,
    line_key: raw.line_key,
    month_key: raw.month_key,
    amount,
    client_name,
  }
}

function auditFieldName(cell: FinanceForecastTargetUpsertCell): string {
  return `forecast_target:${targetLineNaturalKey(cell)}`
}

async function auditTargetWrite(params: {
  cell: FinanceForecastTargetUpsertCell
  previousAmount: number | null
  editedBy: number
  editedByName: string
}) {
  await writeStatusChangeEdit(
    {
      finance_billing_records_id: null,
      field_name: auditFieldName(params.cell),
      old_value: params.previousAmount == null ? null : String(params.previousAmount),
      new_value: String(params.cell.amount),
    },
    {
      editedBy: params.editedBy,
      editedByName: params.editedByName,
      recordType: "forecast_target",
    }
  )
}

/**
 * GET — List target lines for a FY (+ optional client_id). Admin only.
 * Query: `fy` or `financial_year_start_year`, optional `client_id`.
 */
export async function GET(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canManageForecastTargets(roles)) {
    return noStore(
      { error: "forbidden", message: "Only administrators can list Finance Forecast targets." },
      { status: 403 }
    )
  }

  if (!isTargetStorageConfigured()) {
    return noStore({
      lines: [],
      configured: false,
      financial_year_start_year: null,
      message:
        "Target storage is not configured. Set XANO_FINANCE_FORECAST_TARGETS_BASE_URL or XANO_CLIENTS_BASE_URL.",
    })
  }

  const sp = request.nextUrl.searchParams
  const fy = parseFy(sp.get("fy") ?? sp.get("financial_year_start_year"))
  if (fy == null) {
    return noStore(
      { error: "bad_request", message: "Query fy (or financial_year_start_year) is required." },
      { status: 400 }
    )
  }

  const client_id = sp.get("client_id")?.trim() || null

  try {
    const lines = await fetchRevenueForecastTargetLinesFromXano({
      financial_year_start_year: fy,
      client_id,
    })
    return noStore({
      lines,
      configured: true,
      financial_year_start_year: fy,
      client_id,
    })
  } catch (err) {
    console.error("[api/finance/forecast/targets] GET list failed", err)
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
 * POST — Upsert one target cell. Admin only.
 * Body: `{ client_id, financial_year_start_year|fy, line_key, month_key, amount, client_name? }`
 */
export async function POST(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canManageForecastTargets(roles)) {
    return noStore(
      { error: "forbidden", message: "Only administrators can write Finance Forecast targets." },
      { status: 403 }
    )
  }

  const currentUser = await getCurrentUser(request)
  if (!currentUser) {
    return noStore(
      { error: "no_user", message: "Could not resolve user for audit." },
      { status: 401 }
    )
  }

  if (!isTargetStorageConfigured()) {
    return noStore(
      {
        error: "not_configured",
        reason: "target_storage_not_configured",
        message:
          "Target storage is not configured. Set XANO_FINANCE_FORECAST_TARGETS_BASE_URL or XANO_CLIENTS_BASE_URL.",
      },
      { status: 503 }
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

  const parsed = parseUpsertCell(json as Record<string, unknown>)
  if ("error" in parsed) {
    return noStore({ error: "bad_request", message: parsed.error }, { status: 400 })
  }

  const updatedBy =
    currentUser.email || currentUser.name || (currentUser.id ? String(currentUser.id) : null)

  try {
    const { line, previousAmount } = await upsertRevenueForecastTargetLine({
      cell: parsed,
      updatedBy,
    })
    await auditTargetWrite({
      cell: parsed,
      previousAmount,
      editedBy: currentUser.id,
      editedByName: currentUser.name ?? currentUser.email ?? String(currentUser.id),
    })
    return noStore({ ok: true, line })
  } catch (err) {
    console.error("[api/finance/forecast/targets] POST upsert failed", err)
    return noStore(
      {
        error: "upsert_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}

/**
 * PATCH — Batch upsert target cells (grid save). Admin only.
 * Body: `{ cells: [{ client_id, financial_year_start_year|fy, line_key, month_key, amount, client_name? }, ...] }`
 */
export async function PATCH(request: NextRequest) {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return noStore({ error: "unauthorised" }, { status: 401 })
  }

  const roles = getUserRoles(session.user)
  if (!canManageForecastTargets(roles)) {
    return noStore(
      { error: "forbidden", message: "Only administrators can write Finance Forecast targets." },
      { status: 403 }
    )
  }

  const currentUser = await getCurrentUser(request)
  if (!currentUser) {
    return noStore(
      { error: "no_user", message: "Could not resolve user for audit." },
      { status: 401 }
    )
  }

  if (!isTargetStorageConfigured()) {
    return noStore(
      {
        error: "not_configured",
        reason: "target_storage_not_configured",
        message:
          "Target storage is not configured. Set XANO_FINANCE_FORECAST_TARGETS_BASE_URL or XANO_CLIENTS_BASE_URL.",
      },
      { status: 503 }
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
  if (!Array.isArray(body.cells)) {
    return noStore({ error: "bad_request", message: "cells must be an array." }, { status: 400 })
  }
  if (body.cells.length === 0) {
    return noStore({ ok: true, upserted: 0, lines: [] })
  }

  const cells: FinanceForecastTargetUpsertCell[] = []
  for (let i = 0; i < body.cells.length; i++) {
    const raw = body.cells[i]
    if (!raw || typeof raw !== "object") {
      return noStore(
        { error: "bad_request", message: `cells[${i}] must be an object.` },
        { status: 400 }
      )
    }
    const parsed = parseUpsertCell(raw as Record<string, unknown>)
    if ("error" in parsed) {
      return noStore(
        { error: "bad_request", message: `cells[${i}]: ${parsed.error}` },
        { status: 400 }
      )
    }
    cells.push(parsed)
  }

  const updatedBy =
    currentUser.email || currentUser.name || (currentUser.id ? String(currentUser.id) : null)
  const editedByName = currentUser.name ?? currentUser.email ?? String(currentUser.id)

  try {
    const { lines, previousByKey } = await upsertRevenueForecastTargetLinesBatch({
      cells,
      updatedBy,
    })

    for (const cell of cells) {
      const key = targetLineNaturalKey(cell)
      const previousAmount = previousByKey.get(key) ?? null
      await auditTargetWrite({
        cell,
        previousAmount,
        editedBy: currentUser.id,
        editedByName,
      })
    }

    return noStore({ ok: true, upserted: lines.length, lines })
  } catch (err) {
    console.error("[api/finance/forecast/targets] PATCH batch failed", err)
    return noStore(
      {
        error: "upsert_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
