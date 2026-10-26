/**
 * Fixed cost margin loader: published-tip billing schedule (Postgres) +
 * platform spend per line per month (Snowflake). Read-only.
 *
 * Fixed cost = `line_items.fixed_cost_media` or `buy_type = 'fixed_cost'`.
 * Billed = `schedule_months` media, basis billing (plan of record). Fees and
 * ad serving are other components and are never read. Client-pays lines are
 * left out (we do not buy that media).
 */

import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { getDb } from "@/db"
import { getCurrentBillingMonth } from "@/lib/finance/months"
import { FINANCE_STATUS_INCLUDED_SQL } from "@/lib/finance/sections/financeCampaignStatus"
import {
  composeFixedCostMargin,
  FIXED_COST_MARGIN_CAPTION,
  FIXED_COST_MARGIN_NOTES,
  invoicedMonthKey,
  summariseFixedCostMargin,
  type FinanceFixedCostMarginPayload,
  type FixedCostPlanCell,
  type PlatformSpendCell,
  type SpendSourceMode,
} from "@/lib/finance/sections/fixedCostMargin/compose"
import {
  normalizeCostsQuery,
  type FinanceCostsQuery,
} from "@/lib/finance/sections/costsQuery"
import {
  PUBLISHER_IDENTITY_SQL,
  UNSPECIFIED_PUBLISHER,
} from "@/lib/finance/sections/publisherIdentitySql"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import { IS_SERVICE_LINE_SQL } from "@/lib/finance/sections/serviceLineBucket"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"
import { toCents } from "@/lib/money/cents"
import { querySnowflake } from "@/lib/snowflake/query"

export type FinanceFixedCostMarginQuery = Pick<FinanceCostsQuery, "fy" | "from" | "to" | "clientIds">

export const PLATFORM_SPEND_VIEW = "ASSEMBLEDVIEW.MART.VW_PLATFORM_SPEND_LINE_MONTH"

const VIEW_NOTE =
  "Platform spend from VW_PLATFORM_SPEND_LINE_MONTH: DV360 report, Taboola, Vistar and Channel Factory feeds (relabelled), Meta, TikTok and Reddit, Google and Microsoft Ads."
const FALLBACK_NOTE =
  "Platform spend from the pacing facts (VW_PLATFORM_SPEND_LINE_MONTH is not created yet). A DV360 line renamed in DV360 can count twice here."


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

function asNumber(v: unknown): number {
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function asText(v: unknown): string {
  return v == null ? "" : String(v).trim()
}

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "t"
}

export function normalizeFixedCostMarginQuery(input: {
  fy?: number
  from?: string
  to?: string
  clients?: number[]
  today?: Date
}): FinanceFixedCostMarginQuery {
  const base = normalizeCostsQuery({
    fy: input.fy,
    from: input.from,
    to: input.to,
    clients: input.clients,
    today: input.today,
  })
  return { fy: base.fy, from: base.from, to: base.to, clientIds: base.clientIds }
}

const LINE_NAME_SQL = `COALESCE(
  NULLIF(BTRIM(li.attrs->>'creative_targeting'), ''),
  NULLIF(BTRIM(li.attrs->>'targeting_attribute'), ''),
  NULLIF(BTRIM(li.attrs->>'creative'), ''),
  NULLIF(BTRIM(li.attrs->>'placement'), ''),
  ''
)`

/** Every billing and delivery media cell of fixed-cost lines on approved/booked/completed tips. */
async function loadPlanCells(q: FinanceFixedCostMarginQuery): Promise<FixedCostPlanCell[]> {
  const db = getDb()
  const publisherExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNSPECIFIED_PUBLISHER}')`
  const result = await db.execute(sql`
    SELECT
      m.client_id AS client_id,
      COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS client_name,
      m.mba_number AS mba_number,
      COALESCE(NULLIF(BTRIM(m.campaign_name), ''), NULLIF(BTRIM(v.campaign_name), ''), '') AS campaign_name,
      LOWER(COALESCE(m.campaign_status, '')) AS campaign_status,
      li.line_item_id AS line_item_id,
      ${sql.raw(LINE_NAME_SQL)} AS line_name,
      ${sql.raw(publisherExpr)} AS publisher,
      COALESCE(NULLIF(BTRIM(li.platform), ''), '') AS platform,
      li.channel::text AS channel,
      LOWER(COALESCE(li.buy_type, '')) AS buy_type,
      COALESCE(li.fixed_cost_media, FALSE) AS fixed_cost_media,
      sm.basis::text AS basis,
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
      SUM(sm.amount_cents)::bigint AS amount_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.component = 'media'
      AND sm.basis IN ('billing', 'delivery')
    INNER JOIN line_items li ON ${sql.raw(SCHEDULE_LINE_JOIN_SQL)}
    LEFT JOIN clients c ON c.id = m.client_id
    WHERE m.published_version_id IS NOT NULL
      AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
      AND (
        COALESCE(li.fixed_cost_media, FALSE) = TRUE
        OR LOWER(BTRIM(COALESCE(li.buy_type, ''))) = 'fixed_cost'
      )
      AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
      AND NOT ${sql.raw(IS_SERVICE_LINE_SQL)}
      AND ${clientFilterSql(q.clientIds)}
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
  `)
  return executeRows(result).map((r) => ({
    clientId: asNumber(r.client_id),
    clientName: asText(r.client_name) || "Unknown",
    mbaNumber: asText(r.mba_number),
    campaignName: asText(r.campaign_name),
    campaignStatus: asText(r.campaign_status),
    lineItemId: asText(r.line_item_id),
    lineName: asText(r.line_name),
    publisher: asText(r.publisher) || UNSPECIFIED_PUBLISHER,
    platform: asText(r.platform),
    channel: asText(r.channel),
    buyType: asText(r.buy_type),
    fixedCostMedia: asBool(r.fixed_cost_media),
    basis: asText(r.basis) === "delivery" ? "delivery" : "billing",
    month: asText(r.month),
    amountCents: asNumber(r.amount_cents),
  }))
}

/** MBA-months with an invoiced media record (not cancelled). */
async function loadInvoicedKeys(q: FinanceFixedCostMarginQuery): Promise<Set<string>> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT LOWER(BTRIM(r.mba_number)) AS mba, r.billing_month AS month
    FROM finance_billing_records r
    WHERE r.billing_type = 'media'
      AND r.mba_number IS NOT NULL
      AND r.billing_month >= ${q.from}
      AND r.billing_month <= ${q.to}
      AND LOWER(COALESCE(r.status, '')) <> 'cancelled'
      AND (
        COALESCE(r.billed, FALSE) = TRUE
        OR LOWER(COALESCE(r.status, '')) IN ('invoiced', 'paid')
        OR r.exported_at IS NOT NULL
        OR r.matched_xero_invoice_id IS NOT NULL
      )
    GROUP BY 1, 2
  `)
  const out = new Set<string>()
  for (const r of executeRows(result)) {
    const mba = asText(r.mba)
    const month = asText(r.month).slice(0, 7)
    if (mba && month) out.add(invoicedMonthKey(mba, month))
  }
  return out
}

type SpendRow = {
  LINE_ITEM_ID: string
  MONTH: string
  SOURCE: string
  AMOUNT_SPENT: number | string | null
  IMPRESSIONS: number | string | null
  ROW_COUNT: number | string | null
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ")
}

function viewSql(ids: string[]): string {
  return `
    SELECT LINE_ITEM_ID, MONTH, SOURCE,
      SUM(AMOUNT_SPENT) AS AMOUNT_SPENT,
      SUM(IMPRESSIONS) AS IMPRESSIONS, SUM(ROW_COUNT) AS ROW_COUNT
    FROM ${PLATFORM_SPEND_VIEW}
    WHERE LINE_ITEM_ID IN (${placeholders(ids.length)})
      AND MONTH >= ? AND MONTH <= ?
    GROUP BY 1, 2, 3
  `
}

/**
 * Fallback before the view exists. PACING_FACT programmatic rows only (its
 * Social rows duplicate SOCIAL_PACING_FACT), no CM360 (verification counts).
 */
function fallbackSql(ids: string[]): string {
  const p = placeholders(ids.length)
  return `
    WITH spend_rows AS (
      SELECT LOWER(TRIM(LINE_ITEM_ID)) AS LINE_ITEM_ID, DATE_DAY, 'Pacing fact (' || CHANNEL || ')' AS SOURCE,
        AMOUNT_SPENT, IMPRESSIONS
      FROM ASSEMBLEDVIEW.MART.PACING_FACT
      WHERE CHANNEL ILIKE 'Programmatic%' AND LOWER(TRIM(LINE_ITEM_ID)) IN (${p})
      UNION ALL
      SELECT LOWER(TRIM(LINE_ITEM_ID)), DATE_DAY, REPLACE(CHANNEL, 'Social - ', ''), AMOUNT_SPENT, IMPRESSIONS
      FROM ASSEMBLEDVIEW.MART.SOCIAL_PACING_FACT
      WHERE LOWER(TRIM(LINE_ITEM_ID)) IN (${p})
      UNION ALL
      SELECT LOWER(TRIM(LINE_ITEM_ID)), DATE_DAY,
        IFF(CHANNEL ILIKE '%Microsoft%', 'Microsoft Ads', 'Google Ads'), AMOUNT_SPENT, IMPRESSIONS
      FROM ASSEMBLEDVIEW.MART.SEARCH_PACING_FACT
      WHERE LOWER(TRIM(LINE_ITEM_ID)) IN (${p})
    )
    SELECT LINE_ITEM_ID, TO_CHAR(DATE_TRUNC('month', DATE_DAY), 'YYYY-MM') AS MONTH, SOURCE,
      SUM(COALESCE(AMOUNT_SPENT, 0)) AS AMOUNT_SPENT,
      SUM(COALESCE(IMPRESSIONS, 0)) AS IMPRESSIONS, COUNT(*) AS ROW_COUNT
    FROM spend_rows
    WHERE TO_CHAR(DATE_TRUNC('month', DATE_DAY), 'YYYY-MM') >= ?
      AND TO_CHAR(DATE_TRUNC('month', DATE_DAY), 'YYYY-MM') <= ?
    GROUP BY 1, 2, 3
  `
}

function mapSpendRows(rows: SpendRow[]): PlatformSpendCell[] {
  return rows.map((r) => ({
    lineItemId: asText(r.LINE_ITEM_ID).toLowerCase(),
    month: asText(r.MONTH),
    source: asText(r.SOURCE),
    spendCents: toCents(asNumber(r.AMOUNT_SPENT)),
    impressions: asNumber(r.IMPRESSIONS),
    rowCount: asNumber(r.ROW_COUNT),
  }))
}

function isMissingObjectError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /does not exist or not authorized/i.test(msg)
}

async function loadPlatformSpend(
  lineIds: string[],
  q: FinanceFixedCostMarginQuery
): Promise<{ cells: PlatformSpendCell[]; mode: SpendSourceMode }> {
  if (!lineIds.length) return { cells: [], mode: "line_month_view" }
  try {
    const rows = await querySnowflake<SpendRow>(viewSql(lineIds), [...lineIds, q.from, q.to], {
      label: "fixed_cost_margin_spend_view",
    })
    return { cells: mapSpendRows(rows), mode: "line_month_view" }
  } catch (error) {
    if (!isMissingObjectError(error)) throw error
    console.warn("[fixed-cost-margin] spend view missing; using pacing facts", error)
    const rows = await querySnowflake<SpendRow>(
      fallbackSql(lineIds),
      [...lineIds, ...lineIds, ...lineIds, q.from, q.to],
      { label: "fixed_cost_margin_spend_fallback" }
    )
    return { cells: mapSpendRows(rows), mode: "pacing_facts_fallback" }
  }
}

export async function fetchFinanceFixedCostMargin(
  q: FinanceFixedCostMarginQuery
): Promise<FinanceFixedCostMarginPayload> {
  const [plan, invoiced] = await Promise.all([loadPlanCells(q), loadInvoicedKeys(q)])
  const lineIds = [...new Set(plan.map((c) => c.lineItemId.trim().toLowerCase()).filter(Boolean))].sort()
  const { cells, mode } = await loadPlatformSpend(lineIds, q)
  const lines = composeFixedCostMargin({ plan, spend: cells, invoiced, from: q.from, to: q.to })
  const publishers = [...new Set(lines.map((l) => l.publisher))].sort((a, b) => a.localeCompare(b))
  const platforms = [...new Set(lines.map((l) => l.platform).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )
  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      clients: q.clientIds,
      currentMonth: getCurrentBillingMonth(),
    },
    caption: FIXED_COST_MARGIN_CAPTION,
    spendSource: { mode, note: mode === "line_month_view" ? VIEW_NOTE : FALLBACK_NOTE },
    lines,
    summary: summariseFixedCostMargin(lines),
    options: { publishers, platforms },
    notes: [...FIXED_COST_MARGIN_NOTES],
  }
}
