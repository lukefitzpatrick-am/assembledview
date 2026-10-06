/**
 * One-shot shadow smoke for finance domain tables (T2c verify).
 * Avoids importing `server-only` modules — mirrors the reader compare path.
 * Usage: npx tsx scripts/migration/shadow-smoke-finance.ts
 */
import { eq } from "drizzle-orm"
import { loadEnvLocal } from "./_shared"
import { getDb, schema } from "@/db"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "@/lib/data/shadowDiff"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { parseXanoListPayload, xanoAuthHeader, xanoUrl } from "@/lib/api/xano"

async function fetchXanoList(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...xanoAuthHeader() },
  })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const body = await res.json()
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  return parseXanoListPayload(body) as Record<string, unknown>[]
}

function mapBillingRecord(row: Record<string, unknown>) {
  const api = coerceNumericStringsToNumbers(toApiRow(row))
  const cents = api.billed_amount_cents
  if (typeof cents === "number" && Number.isFinite(cents)) {
    api.billed_amount = cents / 100
  }
  delete api.billed_amount_cents
  return api
}

function mapPorted(row: Record<string, unknown>) {
  return coerceNumericStringsToNumbers(toApiRow(row))
}

async function main() {
  loadEnvLocal()
  __resetShadowDiffStoreForTests()

  const db = getDb()
  const fy = new Date().getFullYear()

  const [
    xanoBilling,
    xanoLineItems,
    xanoEdits,
    xanoViews,
    xanoCatalog,
    xanoScopes,
    xanoTargets,
    pgBilling,
    pgLineItems,
    pgEdits,
    pgViews,
    pgCatalog,
    pgScopes,
    pgTargets,
  ] = await Promise.all([
    fetchXanoList(xanoUrl("finance_billing_records", "XANO_CLIENTS_BASE_URL")),
    fetchXanoList(xanoUrl("finance_billing_line_items", "XANO_CLIENTS_BASE_URL")).catch(
      () => [] as Record<string, unknown>[]
    ),
    fetchXanoList(xanoUrl("finance_edits", "XANO_CLIENTS_BASE_URL")),
    fetchXanoList(xanoUrl("finance_saved_views", "XANO_CLIENTS_BASE_URL")).catch(
      () => [] as Record<string, unknown>[]
    ),
    fetchXanoList(xanoUrl("revenue_line_catalog", "XANO_CLIENTS_BASE_URL")).catch(
      () => [] as Record<string, unknown>[]
    ),
    fetchXanoList(xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL")),
    fetchXanoList(
      `${(process.env.XANO_FINANCE_FORECAST_TARGETS_BASE_URL || process.env.XANO_CLIENTS_BASE_URL || "").replace(/\/$/, "")}/revenue_forecast_lines?financial_year_start_year=${fy}`
    ).catch(() => [] as Record<string, unknown>[]),
    db.select().from(schema.financeBillingRecords),
    db.select().from(schema.financeBillingLineItems),
    db.select().from(schema.financeEdits),
    db.select().from(schema.financeSavedViews),
    db.select().from(schema.revenueLineCatalog),
    db.select().from(schema.scopeOfWork),
    db.select().from(schema.revenueForecastLines),
  ])

  const opts = {
    domain: "finance" as const,
    postgresKeysOnly: true,
    financeDuplicateClass: true,
  }

  const pairs: Array<[string, unknown, Record<string, unknown>[]]> = [
    [
      "finance_billing_records",
      xanoBilling,
      pgBilling.map((r) => mapBillingRecord(r as Record<string, unknown>)),
    ],
    [
      "finance_billing_line_items",
      xanoLineItems,
      pgLineItems.map((r) => mapPorted(r as Record<string, unknown>)),
    ],
    [
      "finance_edits",
      xanoEdits,
      pgEdits.map((r) => mapPorted(r as Record<string, unknown>)),
    ],
    [
      "finance_saved_views",
      (xanoViews as Record<string, unknown>[]).map((r) => {
        const copy = { ...r }
        if ("user" in copy && !("user_id" in copy)) {
          copy.user_id = copy.user
          delete copy.user
        }
        return copy
      }),
      pgViews.map((r) => mapPorted(r as Record<string, unknown>)),
    ],
    [
      "revenue_line_catalog",
      xanoCatalog,
      pgCatalog.map((r) => mapPorted(r as Record<string, unknown>)),
    ],
    [
      "scope_of_work",
      xanoScopes,
      pgScopes.map((r) => mapPorted(r as Record<string, unknown>)),
    ],
    [
      "revenue_forecast_lines",
      xanoTargets,
      pgTargets
        .filter((r) => String(r.fy ?? "") === String(fy))
        .map((r) => {
          const api = mapPorted(r as Record<string, unknown>)
          if (api.clients_id != null) api.client_id = String(api.clients_id)
          if (api.fy != null) api.financial_year_start_year = Number(api.fy)
          if (api.month != null) api.month_key = api.month
          return api
        }),
    ],
  ]

  // Sample billing_overrides for one known version if any exist in PG
  const ovSample = await db.select().from(schema.billingOverrides).limit(1)
  if (ovSample[0]) {
    const versionId = ovSample[0].versionId
    const mediaBase =
      process.env.XANO_MEDIA_PLANS_BASE_URL || process.env.XANO_MEDIAPLANS_BASE_URL
    if (mediaBase) {
      const xanoOv = await fetchXanoList(
        `${mediaBase.replace(/\/$/, "")}/billing_overrides?media_plan_version=${versionId}&page=1&per_page=200`
      ).catch(() => [] as Record<string, unknown>[])
      const pgOv = (
        await db
          .select()
          .from(schema.billingOverrides)
          .where(eq(schema.billingOverrides.versionId, versionId))
      ).map((r) => mapPorted(r as Record<string, unknown>))
      const xanoForCompare = xanoOv.map((r) => {
        const copy = { ...r }
        if (copy.media_plan_version != null && copy.version_id == null) {
          copy.version_id = copy.media_plan_version
        }
        return copy
      })
      pairs.push(["billing_overrides", xanoForCompare, pgOv])
    }
  }

  for (const [table, xano, pg] of pairs) {
    const event = compareReferenceRows(table, xano, pg, opts)
    recordShadowDiff(event)
  }

  const summary = summarizeShadowDiffs()
  const finance = summary.byDomain.find((d) => d.domain === "finance")
  console.log(
    JSON.stringify(
      {
        financeSplit: finance
          ? {
              unexpectedMissingInPostgres: finance.totalUnexpectedMissingInPostgres,
              duplicateClassMissingInPostgres:
                finance.totalDuplicateClassMissingInPostgres,
              missingInXano: finance.totalMissingInXano,
              fieldDiffRows: finance.totalRowsWithFieldDiffs,
              events: finance.events,
            }
          : null,
        byTable: summary.byTable
          .filter((t) => t.domain === "finance")
          .map((t) => ({
            table: t.table,
            xano: t.lastEvent.xanoCount,
            pg: t.lastEvent.postgresCount,
            unexpectedMissing: t.lastEvent.unexpectedMissingInPostgres,
            duplicateClass: t.lastEvent.duplicateClassMissingInPostgres,
            missingInXano: t.lastEvent.missingInXano,
            fieldDiffs: t.lastEvent.rowsWithFieldDiffs,
            diffClass: t.lastEvent.diffClass,
            sample: t.lastEvent.sampleFieldDiffs.slice(0, 3),
          })),
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
