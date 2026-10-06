import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import type { FinanceForecastTargetLine } from "@/lib/types/financeForecastTargets"
import { normalizeTargetLine } from "@/lib/finance/forecast/targets/xanoTargetLines"

// --- finance_billing_records ---

/**
 * Map Postgres row â†’ Xano/API shape.
 * `billed_amount_cents` â†’ `billed_amount` (dollars) for consumers; dual invoice_key
 * schemes (`media:`/`sow:`/`retainer:`/`xero:`) ported verbatim.
 */
export function mapFinanceBillingRecordFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  const cents = api.billed_amount_cents
  if (typeof cents === "number" && Number.isFinite(cents)) {
    api.billed_amount = cents / 100
  } else if (api.billed_amount_cents != null) {
    const n = Number(api.billed_amount_cents)
    if (Number.isFinite(n)) api.billed_amount = n / 100
  }
  const approvedCents = api.approved_amount_cents
  if (typeof approvedCents === "number" && Number.isFinite(approvedCents)) {
    api.approved_amount = approvedCents / 100
  } else if (api.approved_amount_cents != null) {
    const n = Number(api.approved_amount_cents)
    if (Number.isFinite(n)) api.approved_amount = n / 100
  }
  // Compare/serve on Xano field name; keep cents for postgresKeysOnly skip of reverse.
  delete api.billed_amount_cents
  delete api.approved_amount_cents
  return api
}

export async function fetchFinanceBillingRecordsFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.financeBillingRecords)
  return rows.map((row) => mapFinanceBillingRecordFromPostgres(row as Record<string, unknown>))
}

export async function fetchFinanceBillingRecordByIdFromPostgres(
  id: number
): Promise<Record<string, unknown> | null> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.financeBillingRecords)
    .where(eq(schema.financeBillingRecords.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return mapFinanceBillingRecordFromPostgres(row as Record<string, unknown>)
}

/**
 * List finance_billing_records.
 * Writes (upserts / mark-billed / notes) go through `lib/data/writeFinance.ts` (Postgres).
 */
export async function readFinanceBillingRecords(): Promise<Record<string, unknown>[]> {
  return fetchFinanceBillingRecordsFromPostgres()
}

export async function readFinanceBillingRecordById(
  id: number | string
): Promise<Record<string, unknown> | null> {
  const numericId = Number(id)
  if (!Number.isFinite(numericId)) return null
  return fetchFinanceBillingRecordByIdFromPostgres(numericId)
}

// --- finance_billing_line_items ---

export function mapFinanceBillingLineItemFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

export async function fetchFinanceBillingLineItemsFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.financeBillingLineItems)
  return rows.map((row) =>
    mapFinanceBillingLineItemFromPostgres(row as Record<string, unknown>)
  )
}

export async function readFinanceBillingLineItems(): Promise<Record<string, unknown>[]> {
  return fetchFinanceBillingLineItemsFromPostgres()
}

// --- finance_edits ---

export function mapFinanceEditFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

export async function fetchFinanceEditsFromPostgres(): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const rows = await db.select().from(schema.financeEdits)
  return rows.map((row) => mapFinanceEditFromPostgres(row as Record<string, unknown>))
}

/** List finance_edits. Inserts go through `insertFinanceEdit` / `writeFinanceAuditEdits`. */
export async function readFinanceEdits(): Promise<Record<string, unknown>[]> {
  return fetchFinanceEditsFromPostgres()
}

// --- finance_saved_views ---

/**
 * Map Postgres row â†’ Xano shape. `user_id` â†’ `user` (Xano reserved-word rename).
 */
export function mapFinanceSavedViewFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  if ("user_id" in api) {
    api.user = api.user_id
    delete api.user_id
  }
  return api
}

export async function fetchFinanceSavedViewsFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.financeSavedViews)
  return rows.map((row) => mapFinanceSavedViewFromPostgres(row as Record<string, unknown>))
}

/** List finance_saved_views. POST inserts via `insertFinanceSavedView`. */
export async function readFinanceSavedViews(): Promise<Record<string, unknown>[]> {
  return fetchFinanceSavedViewsFromPostgres()
}

// --- billing_overrides ---

export function mapBillingOverrideFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  // PG uses version_id; Xano callers expect media_plan_version.
  if (api.version_id != null && api.media_plan_version == null) {
    api.media_plan_version = api.version_id
  }
  return api
}

export async function fetchBillingOverridesFromPostgres(
  versionId: string | number
): Promise<Record<string, unknown>[]> {
  const numericId = Number(versionId)
  if (!Number.isFinite(numericId)) return []
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.billingOverrides)
    .where(eq(schema.billingOverrides.versionId, numericId))
  return rows.map((row) => mapBillingOverrideFromPostgres(row as Record<string, unknown>))
}

/**
 * GET billing_overrides for a media_plan_version.
 * Writes (replace_line / reset_line / persist) are Postgres (`writeFinance`).
 */
export async function readBillingOverridesForVersion(
  versionId: string | number,
  _opts?: { baseUrl?: string }
): Promise<Record<string, unknown>[]> {
  return fetchBillingOverridesFromPostgres(versionId)
}

// --- revenue_forecast_lines ---

export function mapRevenueForecastLineFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  // Schema: clients_id / fy / month â†’ API: client_id / financial_year_start_year / month_key
  if (api.clients_id != null && api.client_id == null) {
    api.client_id = String(api.clients_id)
  }
  if (api.fy != null && api.financial_year_start_year == null) {
    const fyNum = typeof api.fy === "number" ? api.fy : Number.parseInt(String(api.fy), 10)
    if (Number.isFinite(fyNum)) api.financial_year_start_year = fyNum
  }
  if (api.month != null && api.month_key == null) {
    api.month_key = api.month
  }
  return api
}

export async function fetchRevenueForecastLinesFromPostgres(params: {
  financial_year_start_year: number
  client_id?: string | null
}): Promise<Record<string, unknown>[]> {
  const db = getDb()
  const fy = String(params.financial_year_start_year)
  let rows = await db.select().from(schema.revenueForecastLines)
  rows = rows.filter((r) => String(r.fy ?? "") === fy)
  if (params.client_id?.trim()) {
    const cid = params.client_id.trim()
    rows = rows.filter((r) => String(r.clientsId ?? "") === cid)
  }
  return rows.map((row) => mapRevenueForecastLineFromPostgres(row as Record<string, unknown>))
}

/**
 * List targets â€” Postgres-authoritative (forecast target store cutover).
 * Variance + GET /api/finance/forecast/targets both use this path.
 */
export async function readRevenueForecastTargetLines(params: {
  financial_year_start_year: number
  client_id?: string | null
}): Promise<FinanceForecastTargetLine[]> {
  if (!process.env.DATABASE_URL?.trim()) return []
  const rows = await fetchRevenueForecastLinesFromPostgres(params)
  return rows
    .map((r) => normalizeTargetLine(r))
    .filter((r): r is FinanceForecastTargetLine => r != null)
}

// --- revenue_line_catalog ---

export function mapRevenueLineCatalogFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

export async function fetchRevenueLineCatalogFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.revenueLineCatalog)
  return rows.map((row) => mapRevenueLineCatalogFromPostgres(row as Record<string, unknown>))
}

export async function readRevenueLineCatalog(): Promise<Record<string, unknown>[]> {
  return fetchRevenueLineCatalogFromPostgres()
}

// --- scope_of_work ---

export function mapScopeOfWorkFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  // App accepts billingSchedule camelCase OR billing_schedule snake.
  if (api.billing_schedule != null && api.billingSchedule == null) {
    api.billingSchedule = api.billing_schedule
  }
  return api
}

export async function fetchScopeOfWorkFromPostgres(opts?: {
  projectStatus?: string | null
}): Promise<Record<string, unknown>[]> {
  const db = getDb()
  let rows = await db.select().from(schema.scopeOfWork)
  if (opts?.projectStatus?.trim()) {
    const status = opts.projectStatus.trim()
    rows = rows.filter((r) => String(r.projectStatus ?? "") === status)
  }
  return rows.map((row) => mapScopeOfWorkFromPostgres(row as Record<string, unknown>))
}

/** List scope_of_work. Writes go through `writeScopeOfWork`. */
export async function readScopeOfWork(opts?: {
  projectStatus?: string | null
}): Promise<Record<string, unknown>[]> {
  return fetchScopeOfWorkFromPostgres(opts)
}

/** Finance reads are Postgres. The shadow probe no longer calls Xano. */
export async function probeFinanceShadowDiffs(): Promise<void> {
  return
}
