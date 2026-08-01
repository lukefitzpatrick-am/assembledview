/**
 * Finance sections overview summary — Postgres aggregation on published tip schedules.
 *
 * Client-pays semantics (must match computeCampaignFinancials / burstAmounts):
 * - Billing basis receivables: sum media+fee+adserving on basis=billing.
 *   Client-pays media is already $0 on the billing schedule (mediaAmount=0 upstream);
 *   fee remains billable. Do not re-filter client_pays on billing media.
 * - Delivery basis payables (CP-3): media component only; exclude media where
 *   line_items.client_pays_for_media IS TRUE; fee + adserving are separate labelled
 *   figures (not in the payables headline).
 * - Status scope (CP-3 / FS-2): approved|booked|completed only; draft|planned|cancelled
 *   totals live in coverage.excludedByStatusCents (never silent-drop).
 * - Version authority: published tip + schedule_months (D1) — not relevantPlanVersions.
 */

import { sql, type SQL } from "drizzle-orm"
import { getDb } from "@/db"
import {
  australianFyStartYearForDate,
  billingMonthsInAustralianFinancialYear,
  getCurrentBillingMonth,
  referenceDateForFyStartYear,
} from "@/lib/finance/months"
import { clampMonthRangeToFy } from "@/lib/finance/sections/defaultScope"
import {
  FINANCE_STATUS_EXCLUDED_SQL,
  FINANCE_STATUS_INCLUDED_SQL,
  PAYABLES_FYTD_BASIS,
  type ExcludedByStatusCents,
} from "@/lib/finance/sections/financeCampaignStatus"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import {
  IS_SERVICE_LINE_SQL,
  LINE_DETAIL_COVERAGE_NOTE,
} from "@/lib/finance/sections/serviceLineBucket"
import {
  getFinancePeriodsMode,
  isFinancePeriodsEnabled,
} from "@/lib/finance/periods/flag"
import { PERIOD_STATUS_LABEL } from "@/lib/finance/periods/labels"
import { getPeriodPg } from "@/lib/finance/periods/postgresStore"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import type { FinancePeriodStatus } from "@/lib/finance/periods/types"

export type FinanceSectionsSummaryQuery = {
  fy: number
  from: string
  to: string
  clientIds: number[]
}

export type LabelledCentsBlock = {
  cents: number
  basis: string
  scope: string
}

export type FinanceSectionsSummaryPayload = {
  scope: {
    fy: number
    from: string
    to: string
    clients: number[]
    currentMonth: string
  }
  receivablesFytd: LabelledCentsBlock
  /** Media-only payables (ex client-pays; status-scoped). */
  payablesFytd: LabelledCentsBlock
  /** Delivery fee component — labelled separately from payables headline. */
  feeDeliveryFytd: LabelledCentsBlock
  /** Delivery adserving component — labelled separately from payables headline. */
  adservingDeliveryFytd: LabelledCentsBlock
  netAccrual: LabelledCentsBlock
  currentMonthBilling: LabelledCentsBlock
  invoicedToDate: LabelledCentsBlock
  monthlySeries: Array<{
    month: string
    billingCents: number
    deliveryCents: number
    basis: { billing: string; delivery: string }
  }>
  topClients: Array<{ clientId: number | null; clientName: string; billingCents: number }>
  topPublishers: Array<{ publisher: string; deliveryCents: number }>
  coverage: {
    lineDetailPct: number
    lineDetailCents: number
    campaignLevelCents: number
    /** Orphan non-service media (no line_items row) inside included statuses. */
    orphanLineCents: number
    /** Client-pays media excluded within included statuses. */
    clientPaysExcludedCents: number
    excludedByStatusCents: ExcludedByStatusCents
    note: string
  }
  periodStatus: {
    periodMonth: string
    status: string | null
    message: string
    href: string
    amendedAfterLock?: boolean
    mode: string
  }
  xeroExceptions: LabelledCentsBlock & { count: number; href: string }
  /** SQL fragments for recon / MCP re-run. */
  _debugSql?: {
    receivables: string
    payables: string
  }
}

function monthStartDate(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function monthEndExclusive(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((x) => Number.parseInt(x, 10))
  const d = new Date(y!, m! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

async function resolvePeriodStatusCard(): Promise<FinanceSectionsSummaryPayload["periodStatus"]> {
  const periodMonth = getSydneyWallClock().periodMonth
  const mode = getFinancePeriodsMode()
  const href = `/finance/periods?month=${encodeURIComponent(periodMonth)}`

  if (!isFinancePeriodsEnabled()) {
    return {
      periodMonth,
      status: null,
      mode,
      href,
      message: `FINANCE_PERIODS is ${mode}. Enable shadow|on to materialise period runs.`,
    }
  }

  try {
    const period = await getPeriodPg(periodMonth)
    if (!period) {
      const monthName = new Date(`${periodMonth}-01T00:00:00`).toLocaleString("en-AU", {
        month: "long",
      })
      return {
        periodMonth,
        status: null,
        mode,
        href,
        message: `No run has been created for ${monthName}.`,
      }
    }
    const label =
      PERIOD_STATUS_LABEL[period.status as FinancePeriodStatus] ?? period.status
    return {
      periodMonth,
      status: period.status,
      mode,
      href,
      amendedAfterLock: period.amendedAfterLock,
      message: `${periodMonth} · ${label}${
        period.amendedAfterLock ? " · amended after lock" : ""
      }`,
    }
  } catch {
    return {
      periodMonth,
      status: null,
      mode,
      href,
      message: "Period status unavailable (finance_periods read failed).",
    }
  }
}

function clientFilterSql(clientIds: number[]): SQL {
  if (!clientIds.length) return sql`TRUE`
  return sql`m.client_id = ANY(ARRAY[${sql.join(
    clientIds.map((id) => sql`${id}::bigint`),
    sql`, `
  )}])`
}

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const r = result as { rows?: Record<string, unknown>[] }
  return Array.isArray(r.rows) ? r.rows : []
}

function asBigInt(v: unknown): number {
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Documented SQL for receivables FYTD (billing basis, published tip, status-scoped). */
export function receivablesSqlText(q: FinanceSectionsSummaryQuery): string {
  const from = monthStartDate(q.from)
  const toEx = monthEndExclusive(q.to)
  const clients =
    q.clientIds.length > 0 ? `AND m.client_id = ANY(ARRAY[${q.clientIds.join(",")}])` : ""
  return `
SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = 'billing'
  AND sm.component IN ('media', 'fee', 'adserving')
  AND sm.month >= DATE '${from}'
  AND sm.month < DATE '${toEx}'
WHERE m.published_version_id IS NOT NULL
  AND ${FINANCE_STATUS_INCLUDED_SQL}
${clients}
`.trim()
}

/**
 * Documented SQL for payables FYTD — delivery media only, client-pays excluded,
 * statuses approved|booked|completed.
 */
export function payablesSqlText(q: FinanceSectionsSummaryQuery): string {
  const from = monthStartDate(q.from)
  const toEx = monthEndExclusive(q.to)
  const clients =
    q.clientIds.length > 0 ? `AND m.client_id = ANY(ARRAY[${q.clientIds.join(",")}])` : ""
  return `
SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
FROM media_plan_masters m
INNER JOIN media_plan_versions v ON v.id = m.published_version_id
INNER JOIN schedule_months sm ON sm.version_id = v.id
  AND sm.basis = 'delivery'
  AND sm.component = 'media'
  AND sm.month >= DATE '${from}'
  AND sm.month < DATE '${toEx}'
LEFT JOIN line_items li
  ON ${SCHEDULE_LINE_JOIN_SQL}
WHERE m.published_version_id IS NOT NULL
  AND ${FINANCE_STATUS_INCLUDED_SQL}
  AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
${clients}
`.trim()
}

export function normalizeSummaryQuery(input: {
  fy?: number
  from?: string
  to?: string
  clients?: number[]
  today?: Date
}): FinanceSectionsSummaryQuery {
  const today = input.today ?? new Date()
  const currentFy = australianFyStartYearForDate(today)
  const fy = input.fy && input.fy >= 2000 && input.fy <= 2100 ? input.fy : currentFy
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentMonth = getCurrentBillingMonth(today)
  let from = input.from?.trim() || fyMonths[0]!
  let to = input.to?.trim() || (fy === currentFy ? currentMonth : fyMonths[fyMonths.length - 1]!)
  const clamped = clampMonthRangeToFy(fy, { from, to }, today)
  return {
    fy,
    from: clamped.from,
    to: clamped.to,
    clientIds: input.clients ?? [],
  }
}

export async function fetchFinanceSectionsSummary(
  input: FinanceSectionsSummaryQuery
): Promise<FinanceSectionsSummaryPayload> {
  const db = getDb()
  const q = input
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const currentMonth = getCurrentBillingMonth()
  const currentMonthStart = monthStartDate(currentMonth)
  const currentMonthEndEx = monthEndExclusive(currentMonth)
  const clientSql = clientFilterSql(q.clientIds)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)
  const scopeLabel = `FY${q.fy} · ${q.from}→${q.to}${
    q.clientIds.length ? ` · ${q.clientIds.length} clients` : " · all clients"
  }`

  const statusIncluded = sql.raw(FINANCE_STATUS_INCLUDED_SQL)
  const statusExcluded = sql.raw(FINANCE_STATUS_EXCLUDED_SQL)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)

  const billingAgg = await db.execute(sql`
    SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'billing'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND ${clientSql}
  `)

  /** Media-only payables headline (ex client-pays, included statuses). */
  const deliveryAgg = await db.execute(sql`
    SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    LEFT JOIN line_items li
      ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
      AND ${clientSql}
  `)

  const feeAdsAgg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component IN ('fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND ${clientSql}
  `)

  const lineDetailAgg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE
        WHEN NOT (${isService}) AND li.id IS NOT NULL THEN sm.amount_cents ELSE 0 END), 0) AS line_detail_cents,
      COALESCE(SUM(CASE WHEN ${isService} THEN sm.amount_cents ELSE 0 END), 0) AS campaign_level_cents,
      COALESCE(SUM(CASE
        WHEN NOT (${isService}) AND li.id IS NULL THEN sm.amount_cents ELSE 0 END), 0) AS orphan_line_cents,
      COALESCE(SUM(CASE
        WHEN COALESCE(li.client_pays_for_media, FALSE) = TRUE THEN sm.amount_cents ELSE 0 END), 0)
        AS client_pays_excluded_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    LEFT JOIN line_items li
      ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND ${clientSql}
  `)

  const excludedByStatusAgg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN sm.component = 'media' THEN sm.amount_cents ELSE 0 END), 0) AS media_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'fee' THEN sm.amount_cents ELSE 0 END), 0) AS fee_cents,
      COALESCE(SUM(CASE WHEN sm.component = 'adserving' THEN sm.amount_cents ELSE 0 END), 0) AS adserving_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${statusExcluded}
      AND ${clientSql}
  `)

  const currentBillingAgg = await db.execute(sql`
    SELECT COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'billing'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${currentMonthStart}::date
      AND sm.month < ${currentMonthEndEx}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND ${clientSql}
  `)

  const invoicedAgg = await db.execute(sql`
    SELECT COALESCE(SUM(fbr.billed_amount_cents), 0) AS cents
    FROM finance_billing_records fbr
    WHERE fbr.billed IS TRUE
      AND fbr.billed_amount_cents IS NOT NULL
      AND fbr.billing_month >= ${q.from}
      AND fbr.billing_month <= ${q.to}
      AND (
        ${
          q.clientIds.length
            ? sql`fbr.clients_id = ANY(ARRAY[${sql.join(
                q.clientIds.map((id) => sql`${id}::bigint`),
                sql`, `
              )}])`
            : sql`TRUE`
        }
      )
  `)

  const monthlyAgg = await db.execute(sql`
    WITH months AS (
      SELECT to_char(d, 'YYYY-MM') AS month
      FROM generate_series(
        ${fromDate}::date,
        (${toExclusive}::date - INTERVAL '1 day')::date,
        INTERVAL '1 month'
      ) AS d
    ),
    billing AS (
      SELECT to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
             SUM(sm.amount_cents) AS cents
      FROM media_plan_masters m
      INNER JOIN media_plan_versions v ON v.id = m.published_version_id
      INNER JOIN schedule_months sm ON sm.version_id = v.id
        AND sm.basis = 'billing'
        AND sm.component IN ('media', 'fee', 'adserving')
        AND sm.month >= ${fromDate}::date
        AND sm.month < ${toExclusive}::date
      WHERE m.published_version_id IS NOT NULL
        AND ${statusIncluded}
        AND ${clientSql}
      GROUP BY 1
    ),
    delivery AS (
      SELECT to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
             SUM(sm.amount_cents) AS cents
      FROM media_plan_masters m
      INNER JOIN media_plan_versions v ON v.id = m.published_version_id
      INNER JOIN schedule_months sm ON sm.version_id = v.id
        AND sm.basis = 'delivery'
        AND sm.component = 'media'
        AND sm.month >= ${fromDate}::date
        AND sm.month < ${toExclusive}::date
      LEFT JOIN line_items li
        ON ${lineJoin}
      WHERE m.published_version_id IS NOT NULL
        AND ${statusIncluded}
        AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
        AND ${clientSql}
      GROUP BY 1
    )
    SELECT months.month,
           COALESCE(billing.cents, 0) AS billing_cents,
           COALESCE(delivery.cents, 0) AS delivery_cents
    FROM months
    LEFT JOIN billing ON billing.month = months.month
    LEFT JOIN delivery ON delivery.month = months.month
    ORDER BY months.month
  `)

  const topClientsAgg = await db.execute(sql`
    SELECT m.client_id AS client_id,
           COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS client_name,
           SUM(sm.amount_cents) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'billing'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    LEFT JOIN clients c ON c.id = m.client_id
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND ${clientSql}
    GROUP BY 1, 2
    ORDER BY cents DESC NULLS LAST
    LIMIT 5
  `)

  const topPublishersAgg = await db.execute(sql`
    SELECT COALESCE(NULLIF(BTRIM(li.publisher), ''), 'Unspecified') AS publisher,
           SUM(sm.amount_cents) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'delivery'
      AND sm.component = 'media'
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    INNER JOIN line_items li
      ON ${lineJoin}
    WHERE m.published_version_id IS NOT NULL
      AND ${statusIncluded}
      AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
      AND NOT (${isService})
      AND ${clientSql}
    GROUP BY 1
    ORDER BY cents DESC NULLS LAST
    LIMIT 5
  `)

  const xeroAgg = await db.execute(sql`
    SELECT COUNT(*)::bigint AS count
    FROM xero_sync_exceptions
    WHERE COALESCE(resolved, FALSE) = FALSE
  `)

  const receivablesCents = asBigInt(executeRows(billingAgg)[0]?.cents)
  const payablesCents = asBigInt(executeRows(deliveryAgg)[0]?.cents)
  const feeAdsRow = executeRows(feeAdsAgg)[0] ?? {}
  const feeCents = asBigInt(feeAdsRow.fee_cents)
  const adservingCents = asBigInt(feeAdsRow.adserving_cents)
  const lineDetailRow = executeRows(lineDetailAgg)[0] ?? {}
  const lineDetailCents = asBigInt(lineDetailRow.line_detail_cents)
  const campaignLevelCents = asBigInt(lineDetailRow.campaign_level_cents)
  const orphanLineCents = asBigInt(lineDetailRow.orphan_line_cents)
  const clientPaysExcludedCents = asBigInt(lineDetailRow.client_pays_excluded_cents)
  const excludedRow = executeRows(excludedByStatusAgg)[0] ?? {}
  const excludedByStatusCents: ExcludedByStatusCents = {
    media: asBigInt(excludedRow.media_cents),
    fee: asBigInt(excludedRow.fee_cents),
    adserving: asBigInt(excludedRow.adserving_cents),
  }
  const lineDetailPct =
    payablesCents <= 0
      ? 0
      : Math.round((lineDetailCents / payablesCents) * 1000) / 10
  const currentMonthBillingCents = asBigInt(executeRows(currentBillingAgg)[0]?.cents)
  const invoicedCents = asBigInt(executeRows(invoicedAgg)[0]?.cents)
  const xeroCount = asBigInt(executeRows(xeroAgg)[0]?.count)

  const monthlySeries = executeRows(monthlyAgg).map((row) => ({
    month: String(row.month ?? ""),
    billingCents: asBigInt(row.billing_cents),
    deliveryCents: asBigInt(row.delivery_cents),
    basis: {
      billing:
        "billing · media+fee+adserving · statuses approved/booked/completed (client-pays media already $0)",
      delivery: PAYABLES_FYTD_BASIS,
    },
  }))

  const topClients = executeRows(topClientsAgg).map((row) => ({
    clientId: row.client_id == null ? null : asBigInt(row.client_id),
    clientName: String(row.client_name ?? "Unknown"),
    billingCents: asBigInt(row.cents),
  }))

  const topPublishers = executeRows(topPublishersAgg).map((row) => ({
    publisher: String(row.publisher ?? "Unspecified"),
    deliveryCents: asBigInt(row.cents),
  }))

  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      clients: q.clientIds,
      currentMonth,
    },
    receivablesFytd: {
      cents: receivablesCents,
      basis:
        "billing · media+fee+adserving · statuses approved/booked/completed (client-pays media already $0)",
      scope: scopeLabel,
    },
    payablesFytd: {
      cents: payablesCents,
      basis: PAYABLES_FYTD_BASIS,
      scope: scopeLabel,
    },
    feeDeliveryFytd: {
      cents: feeCents,
      basis: "delivery · fee component · statuses approved/booked/completed (not in payables headline)",
      scope: scopeLabel,
    },
    adservingDeliveryFytd: {
      cents: adservingCents,
      basis:
        "delivery · adserving component · statuses approved/booked/completed (not in payables headline)",
      scope: scopeLabel,
    },
    netAccrual: {
      cents: receivablesCents - payablesCents,
      basis: "receivables − media-only payables (schedule FYTD)",
      scope: scopeLabel,
    },
    currentMonthBilling: {
      cents: currentMonthBillingCents,
      basis: "billing · current calendar month · statuses approved/booked/completed",
      scope: `${currentMonth}${q.clientIds.length ? ` · ${q.clientIds.length} clients` : " · all clients"}`,
    },
    invoicedToDate: {
      cents: invoicedCents,
      basis: "finance_billing_records · billed_amount_cents where billed",
      scope: scopeLabel,
    },
    monthlySeries,
    topClients,
    topPublishers,
    coverage: {
      lineDetailPct,
      lineDetailCents,
      campaignLevelCents,
      orphanLineCents,
      clientPaysExcludedCents,
      excludedByStatusCents,
      note: `${LINE_DETAIL_COVERAGE_NOTE} Orphan non-service media (no line_items row) is in the payables headline but not line-detail-attributed — see orphanLineCents. Draft/planned/cancelled totals are in excludedByStatusCents.`,
    },
    periodStatus: await resolvePeriodStatusCard(),
    xeroExceptions: {
      count: xeroCount,
      cents: 0,
      basis: "xero_sync_exceptions · unresolved",
      scope: "all open exceptions",
      href: "/finance/xero",
    },
    _debugSql: {
      receivables: receivablesSqlText(q),
      payables: payablesSqlText(q),
    },
  }
}

/**
 * Per-MBA billing FYTD cents for reconciliation against blob hub.
 */
export async function fetchReceivablesByMba(
  q: FinanceSectionsSummaryQuery
): Promise<Array<{ mba: string; cents: number }>> {
  const db = getDb()
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const clientSql = clientFilterSql(q.clientIds)
  const result = await db.execute(sql`
    SELECT m.mba_number AS mba, COALESCE(SUM(sm.amount_cents), 0) AS cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON v.id = m.published_version_id
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.basis = 'billing'
      AND sm.component IN ('media', 'fee', 'adserving')
      AND sm.month >= ${fromDate}::date
      AND sm.month < ${toExclusive}::date
    WHERE m.published_version_id IS NOT NULL
      AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
      AND ${clientSql}
    GROUP BY m.mba_number
    HAVING SUM(sm.amount_cents) <> 0
    ORDER BY m.mba_number
  `)
  return executeRows(result).map((row) => ({
    mba: String(row.mba ?? ""),
    cents: asBigInt(row.cents),
  }))
}
