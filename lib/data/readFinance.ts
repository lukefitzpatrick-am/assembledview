import "server-only"

import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import {
  getXanoBaseUrl,
  parseXanoListPayload,
  xanoAuthHeader,
  xanoAuthHeaderRecord,
  xanoUrl,
} from "@/lib/api/xano"
import { getDataBackendFor } from "@/lib/data/backend"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { compareReferenceRows, recordShadowDiff } from "@/lib/data/shadowDiff"
import type { FinanceForecastTargetLine } from "@/lib/types/financeForecastTargets"
import {
  fetchRevenueForecastTargetLinesFromXano,
  normalizeTargetLine,
} from "@/lib/finance/forecast/targets/xanoTargetLines"

const DOMAIN = "finance" as const

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

function asRecordList(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === "object" && !Array.isArray(row)
    )
  }
  return parseXanoListPayload(body) as Record<string, unknown>[]
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: unknown; contentType: string }> {
  const upstream = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...xanoAuthHeader(),
      ...(init?.headers ?? {}),
    },
  })
  const contentType = upstream.headers.get("content-type") || ""
  const body = contentType.includes("application/json")
    ? await upstream.json()
    : await upstream.text()
  return { status: upstream.status, body, contentType }
}

function runFinanceShadowCompare(
  table: string,
  xanoBody: unknown,
  postgresRows: Record<string, unknown>[]
): void {
  try {
    const event = compareReferenceRows(table, xanoBody, postgresRows, {
      domain: DOMAIN,
      postgresKeysOnly: true,
      financeDuplicateClass: true,
    })
    recordShadowDiff(event)
  } catch (err) {
    console.error("[migration-shadow-diff] compare failed", { domain: DOMAIN, table, err })
  }
}

// --- finance_billing_records ---

/**
 * Map Postgres row → Xano/API shape.
 * `billed_amount_cents` → `billed_amount` (dollars) for consumers; dual invoice_key
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
  // Compare/serve on Xano field name; keep cents for postgresKeysOnly skip of reverse.
  delete api.billed_amount_cents
  return api
}

export async function fetchFinanceBillingRecordsFromPostgres(): Promise<
  Record<string, unknown>[]
> {
  const db = getDb()
  const rows = await db.select().from(schema.financeBillingRecords)
  return rows.map((row) => mapFinanceBillingRecordFromPostgres(row as Record<string, unknown>))
}

export async function fetchFinanceBillingRecordsFromXano(): Promise<
  Record<string, unknown>[]
> {
  const url = xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano finance_billing_records GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
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

export async function fetchFinanceBillingRecordByIdFromXano(
  id: number | string
): Promise<Record<string, unknown> | null> {
  const url = xanoUrl(`finance_billing_records/${id}`, "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status === 404) return null
  if (result.status >= 400) {
    throw new Error(`Xano finance_billing_records/${id} GET failed: ${result.status}`)
  }
  if (!result.body || typeof result.body !== "object") return null
  return result.body as Record<string, unknown>
}

/**
 * List finance_billing_records with DATA_BACKEND_FINANCE / DATA_BACKEND.
 * Writes (upserts / mark-billed / notes) go through `lib/data/writeFinance.ts` (Postgres).
 */
export async function readFinanceBillingRecords(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchFinanceBillingRecordsFromPostgres()
  }

  // Do not soft-fail to [] — a dead Xano/Postgres looks like "no billed rows".
  // Callers map thrown errors to ViewState / HTTP 5xx at the boundary.
  const xanoRows = await fetchFinanceBillingRecordsFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchFinanceBillingRecordsFromPostgres()
        runFinanceShadowCompare("finance_billing_records", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "finance_billing_records",
          err,
        })
      }
    })()
  }

  return xanoRows
}

export async function readFinanceBillingRecordById(
  id: number | string
): Promise<Record<string, unknown> | null> {
  const backend = getDataBackendFor(DOMAIN)
  const numericId = Number(id)

  if (backend === "postgres") {
    if (!Number.isFinite(numericId)) return null
    return fetchFinanceBillingRecordByIdFromPostgres(numericId)
  }

  const xano = await fetchFinanceBillingRecordByIdFromXano(id)

  if (backend === "shadow" && xano && Number.isFinite(numericId)) {
    void (async () => {
      try {
        const pg = await fetchFinanceBillingRecordByIdFromPostgres(numericId)
        runFinanceShadowCompare(
          "finance_billing_records",
          [xano],
          pg ? [pg] : []
        )
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "finance_billing_records",
          err,
        })
      }
    })()
  }

  return xano
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

export async function fetchFinanceBillingLineItemsFromXano(): Promise<
  Record<string, unknown>[]
> {
  const url = xanoUrl("finance_billing_line_items", "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano finance_billing_line_items GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
}

export async function readFinanceBillingLineItems(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchFinanceBillingLineItemsFromPostgres()
  }

  const xanoRows = await fetchFinanceBillingLineItemsFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchFinanceBillingLineItemsFromPostgres()
        runFinanceShadowCompare("finance_billing_line_items", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "finance_billing_line_items",
          err,
        })
      }
    })()
  }

  return xanoRows
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

export async function fetchFinanceEditsFromXano(): Promise<Record<string, unknown>[]> {
  const url = xanoUrl("finance_edits", "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano finance_edits GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
}

/** List finance_edits. POST/writes stay on Xano. */
export async function readFinanceEdits(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchFinanceEditsFromPostgres()
  }

  const xanoRows = await fetchFinanceEditsFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchFinanceEditsFromPostgres()
        runFinanceShadowCompare("finance_edits", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "finance_edits",
          err,
        })
      }
    })()
  }

  return xanoRows
}

// --- finance_saved_views ---

/**
 * Map Postgres row → Xano shape. `user_id` → `user` (Xano reserved-word rename).
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

export async function fetchFinanceSavedViewsFromXano(): Promise<
  Record<string, unknown>[]
> {
  const url = xanoUrl("finance_saved_views", "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano finance_saved_views GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
}

/** List finance_saved_views. POST stays on Xano. */
export async function readFinanceSavedViews(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchFinanceSavedViewsFromPostgres()
  }

  const xanoRows = await fetchFinanceSavedViewsFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchFinanceSavedViewsFromPostgres()
        // Compare with user_id on PG side: map Xano `user` → user_id for field align
        const xanoForCompare = xanoRows.map((r) => {
          const copy = { ...r }
          if ("user" in copy && !("user_id" in copy)) {
            copy.user_id = copy.user
            delete copy.user
          }
          return copy
        })
        const pgForCompare = postgresRows.map((r) => {
          // mapFinanceSavedViewFromPostgres already emitted `user`; restore user_id for compare
          const raw = { ...r }
          if ("user" in raw) {
            raw.user_id = raw.user
            delete raw.user
          }
          return raw
        })
        // Re-fetch raw PG with user_id for cleaner compare
        const db = getDb()
        const rawPg = (await db.select().from(schema.financeSavedViews)).map((row) =>
          coerceNumericStringsToNumbers(toApiRow(row as Record<string, unknown>))
        )
        runFinanceShadowCompare("finance_saved_views", xanoForCompare, rawPg.length ? rawPg : pgForCompare)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "finance_saved_views",
          err,
        })
      }
    })()
  }

  return xanoRows
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

export async function fetchBillingOverridesFromXano(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<Record<string, unknown>[]> {
  if (versionId == null || String(versionId).trim() === "") return []

  const baseUrl = opts?.baseUrl ?? getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])

  const qs = new URLSearchParams({
    media_plan_version: String(versionId),
    page: "1",
    per_page: "200",
  })
  const result = await fetchJson(`${baseUrl}/billing_overrides?${qs.toString()}`)
  // Missing table / no rows for version → genuine empty. Transport/5xx → throw.
  if (result.status === 404) return []
  if (result.status >= 400) {
    throw new Error(
      `billing_overrides GET failed (${result.status}) for version ${versionId}`
    )
  }
  return asRecordList(result.body)
}

/**
 * GET billing_overrides for a media_plan_version.
 * Writes (replace_line / reset_line / persist) stay on Xano.
 */
export async function readBillingOverridesForVersion(
  versionId: string | number,
  opts?: { baseUrl?: string }
): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchBillingOverridesFromPostgres(versionId)
  }

  const xanoRows = await fetchBillingOverridesFromXano(versionId, opts)

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchBillingOverridesFromPostgres(versionId)
        const xanoForCompare = xanoRows.map((r) => {
          const copy = { ...r }
          if (copy.media_plan_version != null && copy.version_id == null) {
            copy.version_id = copy.media_plan_version
          }
          return copy
        })
        runFinanceShadowCompare("billing_overrides", xanoForCompare, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "billing_overrides",
          err,
        })
      }
    })()
  }

  return xanoRows
}

// --- revenue_forecast_lines ---

export function mapRevenueForecastLineFromPostgres(
  row: Record<string, unknown>
): Record<string, unknown> {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  // Schema: clients_id / fy / month → API: client_id / financial_year_start_year / month_key
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
 * List targets — Postgres-authoritative (forecast target store cutover).
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

export async function fetchRevenueLineCatalogFromXano(): Promise<
  Record<string, unknown>[]
> {
  const url = xanoUrl("revenue_line_catalog", "XANO_CLIENTS_BASE_URL")
  const result = await fetchJson(url)
  if (result.status >= 400) {
    throw new Error(`Xano revenue_line_catalog GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
}

export async function readRevenueLineCatalog(): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchRevenueLineCatalogFromPostgres()
  }

  const xanoRows = await fetchRevenueLineCatalogFromXano()

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchRevenueLineCatalogFromPostgres()
        runFinanceShadowCompare("revenue_line_catalog", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "revenue_line_catalog",
          err,
        })
      }
    })()
  }

  return xanoRows
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

export async function fetchScopeOfWorkFromXano(opts?: {
  projectStatus?: string | null
}): Promise<Record<string, unknown>[]> {
  let url = xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL")
  if (opts?.projectStatus?.trim()) {
    url += `?project_status=${encodeURIComponent(opts.projectStatus.trim())}`
  }
  const result = await fetchJson(url, {
    headers: { ...xanoAuthHeaderRecord() },
  })
  if (result.status >= 400) {
    throw new Error(`Xano scope_of_work GET failed: ${result.status}`)
  }
  return asRecordList(result.body)
}

/** List scope_of_work. Writes stay on Xano. */
export async function readScopeOfWork(opts?: {
  projectStatus?: string | null
}): Promise<Record<string, unknown>[]> {
  const backend = getDataBackendFor(DOMAIN)

  if (backend === "postgres") {
    return fetchScopeOfWorkFromPostgres(opts)
  }

  const xanoRows = await fetchScopeOfWorkFromXano(opts)

  if (backend === "shadow") {
    void (async () => {
      try {
        const postgresRows = await fetchScopeOfWorkFromPostgres(opts)
        runFinanceShadowCompare("scope_of_work", xanoRows, postgresRows)
      } catch (err) {
        console.error("[migration-shadow-diff] compare failed", {
          domain: DOMAIN,
          table: "scope_of_work",
          err,
        })
      }
    })()
  }

  return xanoRows
}

/**
 * Probe all finance tables for shadow diffs (used by migration-diffs when
 * DATA_BACKEND_FINANCE=shadow and tables lack a hot read path).
 * Awaits compares so admin `?probe=finance` returns populated totals.
 */
export async function probeFinanceShadowDiffs(): Promise<void> {
  const backend = getDataBackendFor(DOMAIN)
  if (backend !== "shadow") return

  const tables: Array<{
    table: string
    run: () => Promise<{ xano: unknown; pg: Record<string, unknown>[] }>
  }> = [
    {
      table: "finance_billing_records",
      run: async () => ({
        xano: await fetchFinanceBillingRecordsFromXano(),
        pg: await fetchFinanceBillingRecordsFromPostgres(),
      }),
    },
    {
      table: "finance_billing_line_items",
      run: async () => ({
        xano: await fetchFinanceBillingLineItemsFromXano(),
        pg: await fetchFinanceBillingLineItemsFromPostgres(),
      }),
    },
    {
      table: "finance_edits",
      run: async () => ({
        xano: await fetchFinanceEditsFromXano(),
        pg: await fetchFinanceEditsFromPostgres(),
      }),
    },
    {
      table: "finance_saved_views",
      run: async () => {
        const xano = await fetchFinanceSavedViewsFromXano()
        const db = getDb()
        const pg = (await db.select().from(schema.financeSavedViews)).map((row) =>
          coerceNumericStringsToNumbers(toApiRow(row as Record<string, unknown>))
        )
        const xanoForCompare = xano.map((r) => {
          const copy = { ...r }
          if ("user" in copy && !("user_id" in copy)) {
            copy.user_id = copy.user
            delete copy.user
          }
          return copy
        })
        return { xano: xanoForCompare, pg }
      },
    },
    {
      table: "revenue_line_catalog",
      run: async () => ({
        xano: await fetchRevenueLineCatalogFromXano(),
        pg: await fetchRevenueLineCatalogFromPostgres(),
      }),
    },
    {
      table: "scope_of_work",
      run: async () => ({
        xano: await fetchScopeOfWorkFromXano(),
        pg: await fetchScopeOfWorkFromPostgres(),
      }),
    },
    {
      table: "revenue_forecast_lines",
      run: async () => {
        const fy = new Date().getFullYear()
        const xano = await fetchRevenueForecastTargetLinesFromXano({
          financial_year_start_year: fy,
        })
        const pg = await fetchRevenueForecastLinesFromPostgres({
          financial_year_start_year: fy,
        })
        return {
          xano: xano.map((l) => ({
            id: Number.isFinite(Number(l.id)) ? Number(l.id) : l.id,
            client_id: l.client_id,
            financial_year_start_year: l.financial_year_start_year,
            line_key: l.line_key,
            month_key: l.month_key,
            amount: l.amount,
          })),
          pg,
        }
      },
    },
  ]

  for (const { table, run } of tables) {
    try {
      const { xano, pg } = await run()
      runFinanceShadowCompare(table, xano, pg)
    } catch (err) {
      console.error("[migration-shadow-diff] probe failed", { domain: DOMAIN, table, err })
    }
  }
}
