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
  addMonths,
  billLineView,
  buildCfPlacementMap,
  costBasisForPublisher,
  createBillPublisherResolver,
  createDirectPublisherFor,
  type PublisherRow,
} from "@/lib/finance/sections/fixedCostMargin/bills/assemble"
import {
  billCostCells,
  matchBillLines,
  summariseBillMatches,
  type BillPlanLine,
  type CfPlacementMap,
  type ResolvedPublisher,
} from "@/lib/finance/sections/fixedCostMargin/bills/match"
import {
  findKnownMbas,
  parseBill,
  type ParsedBillLine,
  type RawBillRow,
} from "@/lib/finance/sections/fixedCostMargin/bills/parse"
import { BILL_CONTACT_SQL_REGEX, supplierKindOf } from "@/lib/finance/sections/fixedCostMargin/bills/suppliers"
import {
  DV360_SPEND_SOURCE,
  dv360BillCells,
  dv360CheckCells,
  dv360SpendByMbaMonth,
  FIVE_STONES_CONTACT_SQL_REGEX,
  parseFiveStonesDv360Bill,
  unmatchedDv360Lines,
  type Dv360CheckCell,
} from "@/lib/finance/sections/fixedCostMargin/bills/fiveStones"
import {
  buildDv360CheckRows,
  composeFixedCostMargin,
  FIXED_COST_MARGIN_CAPTION,
  FIXED_COST_MARGIN_NOTES,
  invoicedMonthKey,
  summariseFixedCostMargin,
  type FinanceFixedCostMarginPayload,
  type FixedCostBillLineView,
  type FixedCostDv360Check,
  type FixedCostBillTotals,
  type FixedCostPlanCell,
  type LineBillCostCell,
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
const BILL_NOTE =
  "Channel Factory and Advertising Associates cost from Xero bills (xero_ap_bills), matched in the app on each load."
const CF_FILE_LINES_TABLE = "ASSEMBLEDVIEW.RAW.PARTNER_FILE_LINES"
const BILL_WINDOW_BEFORE_MONTHS = 3
const BILL_WINDOW_AFTER_MONTHS = 6
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

// ---------------------------------------------------------------------------
// Xero bills (Channel Factory, Advertising Associates, direct publishers)
// ---------------------------------------------------------------------------

async function loadPublishers(): Promise<PublisherRow[]> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT id, publisher_name, publisherid, billingagency FROM publishers ORDER BY id
  `)
  return executeRows(result).map((r) => ({
    id: asNumber(r.id),
    publisher_name: asText(r.publisher_name) || null,
    publisherid: asText(r.publisherid) || null,
    billingagency: asText(r.billingagency) || null,
  }))
}

/** Every MBA number (lower-case) with its client, to recognise MBAs in bill text. */
async function loadMbaClients(): Promise<Map<string, { clientId: number; clientName: string }>> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT LOWER(BTRIM(m.mba_number)) AS mba, m.client_id AS client_id,
      COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS client_name
    FROM media_plan_masters m
    LEFT JOIN clients c ON c.id = m.client_id
    WHERE NULLIF(BTRIM(m.mba_number), '') IS NOT NULL
  `)
  const out = new Map<string, { clientId: number; clientName: string }>()
  for (const r of executeRows(result)) {
    const mba = asText(r.mba)
    if (mba && !out.has(mba)) out.set(mba, { clientId: asNumber(r.client_id), clientName: asText(r.client_name) })
  }
  return out
}

/**
 * Bills from the suppliers the report reads, issued in a window around the
 * range (three months before, six after) so the delivered-month view sees
 * bills issued late. DELETED and VOIDED bills are never loaded.
 */
async function loadBills(
  q: FinanceFixedCostMarginQuery,
  contactRegex: string = BILL_CONTACT_SQL_REGEX
): Promise<RawBillRow[]> {
  const db = getDb()
  const fromDate = `${addMonths(q.from, -BILL_WINDOW_BEFORE_MONTHS)}-01`
  const toDate = `${addMonths(q.to, BILL_WINDOW_AFTER_MONTHS + 1)}-01`
  const result = await db.execute(sql`
    SELECT b.id, b.xero_invoice_id, COALESCE(b.invoice_number, '') AS invoice_number,
      COALESCE(b.reference_raw, '') AS reference_raw, c.name AS contact_name,
      COALESCE(b.status, '') AS status, COALESCE(b.currency, '') AS currency,
      to_char(b.issue_date, 'YYYY-MM-DD') AS issue_date,
      COALESCE(b.raw_json->>'LineAmountTypes', '') AS line_amount_types,
      b.line_items_json AS line_items
    FROM xero_ap_bills b
    JOIN xero_contacts c ON c.xero_contact_id = b.xero_contact_id
    WHERE b.issue_date >= ${fromDate}::date
      AND b.issue_date < ${toDate}::date
      AND UPPER(COALESCE(b.status, '')) NOT IN ('DELETED', 'VOIDED')
      AND c.name ~* ${contactRegex}
    ORDER BY b.issue_date, b.id
  `)
  return executeRows(result).map((r) => ({
    billId: asNumber(r.id),
    xeroInvoiceId: asText(r.xero_invoice_id),
    invoiceNumber: asText(r.invoice_number),
    referenceRaw: asText(r.reference_raw),
    contactName: asText(r.contact_name),
    status: asText(r.status),
    currency: asText(r.currency),
    issueDate: asText(r.issue_date),
    lineAmountTypes: asText(r.line_amount_types),
    lineItems: typeof r.line_items === "string" ? JSON.parse(r.line_items) : r.line_items,
  }))
}

/**
 * Plan lines a bill line can match: every media line (any buy type) of the
 * MBAs named on the bills and of the CF plan lines, on approved, booked and
 * completed published tips, with billed cents by month.
 */
async function loadBillPlanLines(
  mbas: string[],
  lineIds: string[],
  resolvePublisher: (text: string) => ResolvedPublisher | null
): Promise<BillPlanLine[]> {
  if (!mbas.length && !lineIds.length) return []
  const db = getDb()
  const publisherExpr = `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '')`
  const mbaList = mbas.length ? sql.join(mbas.map((m) => sql`${m}`), sql`, `) : sql`''`
  const lidList = lineIds.length ? sql.join(lineIds.map((m) => sql`${m}`), sql`, `) : sql`''`
  const result = await db.execute(sql`
    SELECT
      LOWER(BTRIM(m.mba_number)) AS mba,
      LOWER(BTRIM(li.line_item_id)) AS line_item_id,
      m.client_id AS client_id,
      COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS client_name,
      ${sql.raw(publisherExpr)} AS publisher,
      (COALESCE(li.fixed_cost_media, FALSE) = TRUE OR LOWER(BTRIM(COALESCE(li.buy_type, ''))) = 'fixed_cost') AS fixed_cost,
      COALESCE(li.client_pays_for_media, FALSE) AS client_pays,
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
      SUM(sm.amount_cents)::bigint AS amount_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
    INNER JOIN schedule_months sm ON sm.version_id = v.id
      AND sm.component = 'media'
      AND sm.basis = 'billing'
    INNER JOIN line_items li ON ${sql.raw(SCHEDULE_LINE_JOIN_SQL)}
    LEFT JOIN clients c ON c.id = m.client_id
    WHERE m.published_version_id IS NOT NULL
      AND ${sql.raw(FINANCE_STATUS_INCLUDED_SQL)}
      AND NOT ${sql.raw(IS_SERVICE_LINE_SQL)}
      AND (
        LOWER(BTRIM(m.mba_number)) IN (${mbaList})
        OR LOWER(BTRIM(li.line_item_id)) IN (${lidList})
      )
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
  `)
  const byLine = new Map<string, BillPlanLine & { billedByMonth: Map<string, number> }>()
  for (const r of executeRows(result)) {
    const lid = asText(r.line_item_id)
    const mba = asText(r.mba)
    const key = `${mba}|${lid}`
    let line = byLine.get(key)
    if (!line) {
      const resolved = resolvePublisher(asText(r.publisher))
      line = {
        mbaNumber: mba,
        lineItemId: lid,
        clientId: asNumber(r.client_id),
        clientName: asText(r.client_name),
        publisher: resolved?.name ?? null,
        billingAgency: resolved?.billingAgency ?? "",
        inReport: asBool(r.fixed_cost) && !asBool(r.client_pays),
        billedByMonth: new Map(),
      }
      byLine.set(key, line)
    }
    const month = asText(r.month)
    line.billedByMonth.set(month, (line.billedByMonth.get(month) ?? 0) + asNumber(r.amount_cents))
  }
  return [...byLine.values()]
}

type CfPlacementRow = { PL: string | null; LID: string | null }

/**
 * CF placement (PL...) to plan line code from the CF daily delivery file
 * (`RAW.PARTNER_FILE_LINES`, column 3 media buy, column 4 plan code).
 * Null when Snowflake cannot be read, so the page still loads.
 */
async function loadCfPlacements(placements: string[]): Promise<CfPlacementMap | null> {
  if (!placements.length) return new Map()
  try {
    const rows = await querySnowflake<CfPlacementRow>(
      `
      WITH r AS (
        SELECT SPLIT_PART(RAW_LINE, '\\t', 3) AS C3, SPLIT_PART(RAW_LINE, '\\t', 4) AS C4
        FROM ${CF_FILE_LINES_TABLE}
        WHERE SOURCE_FILE ILIKE 'channel-factory/%' AND RAW_LINE ILIKE '%PL%'
      )
      SELECT REGEXP_SUBSTR(C3, 'PL[0-9]{6}') AS PL,
        LOWER(REGEXP_SUBSTR(C4, '[A-Za-z]{3,}[0-9]{3}P[VO][0-9]+', 1, 1, 'i')) AS LID
      FROM r
      WHERE REGEXP_SUBSTR(C3, 'PL[0-9]{6}') IN (${placeholders(placements.length)})
      GROUP BY 1, 2
      `,
      placements,
      { label: "fixed_cost_margin_cf_placements" }
    )
    return buildCfPlacementMap(rows.map((r) => ({ placementId: asText(r.PL), lineItemId: asText(r.LID) })))
  } catch (error) {
    console.warn("[fixed-cost-margin] CF placement map unavailable", error)
    return null
  }
}

type BillsResult = {
  costs: LineBillCostCell[]
  views: FixedCostBillLineView[]
  totals: FixedCostBillTotals[]
  ok: boolean
  note: string
}

async function loadBillCosts(
  q: FinanceFixedCostMarginQuery,
  publishers: PublisherRow[],
  mbaClients: Map<string, { clientId: number; clientName: string }>
): Promise<BillsResult> {
  const resolvePublisher = createBillPublisherResolver(publishers)
  const raw = await loadBills(q)
  const parsed: ParsedBillLine[] = []
  for (const bill of raw) {
    const kind = supplierKindOf(bill.contactName)
    if (kind) parsed.push(...parseBill(bill, kind))
  }
  const knownMbas = new Set(mbaClients.keys())
  const placements = [...new Set(parsed.map((l) => l.plId).filter((p): p is string => !!p))].sort()
  const cfPlacements = await loadCfPlacements(placements)
  const mbas = new Set<string>()
  for (const l of parsed) {
    if (l.supplierKind === "channel_factory") continue
    for (const m of findKnownMbas(`${l.billText} ${l.tracking.join(" ")}`, knownMbas)) mbas.add(m)
  }
  const cfLineIds = new Set<string>()
  if (cfPlacements) for (const p of placements) for (const id of cfPlacements.get(p) ?? []) cfLineIds.add(id)
  const planLines = await loadBillPlanLines([...mbas].sort(), [...cfLineIds].sort(), resolvePublisher)

  const matched = matchBillLines(parsed, {
    knownMbas,
    mbaClients,
    planLines,
    cfPlacements,
    resolveMediaOwner: resolvePublisher,
    directPublisherFor: createDirectPublisherFor(resolvePublisher),
  })
  const clientSet = new Set(q.clientIds)
  const inScope = matched.filter(
    (l) =>
      (inRangeMonth(l.billedMonth, q) || inRangeMonth(l.deliveredMonth, q)) &&
      (!clientSet.size || (l.clientId != null && clientSet.has(l.clientId)))
  )
  return {
    costs: billCostCells(matched),
    views: inScope.map(billLineView),
    totals: summariseBillMatches(inScope.filter((l) => inRangeMonth(l.billedMonth, q))),
    ok: cfPlacements != null,
    note:
      cfPlacements != null
        ? BILL_NOTE
        : `${BILL_NOTE} The CF daily delivery file could not be read, so Channel Factory bill lines are unmatched.`,
  }
}

// ---------------------------------------------------------------------------
// Five Stones DV360 bills vs DV360 AMOUNT_SPENT (MAR-10)
// ---------------------------------------------------------------------------

const DV360_CHECK_NOTE =
  "Five Stones bill (DV360) is matched at MBA-month: a Five Stones bill line is one DV360 insertion order for the month and can carry several plan lines, so it cannot be matched to a line. The MBA-month bill is split over the MBA's DV360 lines by DV360 spend. DV360 cost in the margin stays AMOUNT_SPENT."

type MbaSpendRow = { LINE_ITEM_ID: string | null; MONTH: string | null; AMOUNT_SPENT: number | string | null }

/** DV360 AMOUNT_SPENT for every line of these MBAs (any buy type), by line and month. */
async function loadDv360MbaSpend(mbas: string[], q: FinanceFixedCostMarginQuery): Promise<Map<string, number>> {
  if (!mbas.length) return new Map()
  const prefixes = mbas.map(() => "STARTSWITH(LOWER(LINE_ITEM_ID), ?)").join(" OR ")
  const rows = await querySnowflake<MbaSpendRow>(
    `
    SELECT LOWER(LINE_ITEM_ID) AS LINE_ITEM_ID, MONTH, SUM(AMOUNT_SPENT) AS AMOUNT_SPENT
    FROM ${PLATFORM_SPEND_VIEW}
    WHERE SOURCE = ? AND MONTH >= ? AND MONTH <= ? AND (${prefixes})
    GROUP BY 1, 2
    `,
    [DV360_SPEND_SOURCE, q.from, q.to, ...mbas],
    { label: "fixed_cost_margin_dv360_mba_spend" }
  )
  return dv360SpendByMbaMonth(
    rows.map((r) => ({
      lineItemId: asText(r.LINE_ITEM_ID),
      month: asText(r.MONTH),
      spendCents: toCents(asNumber(r.AMOUNT_SPENT)),
    })),
    mbas
  )
}

type Dv360BillsResult = { cells: Dv360CheckCell[]; ok: boolean; note: string; unmatchedLines: number; unmatchedCents: number }

/**
 * Five Stones DV360 bills issued in the range, by MBA-month, with DV360
 * spend on all of each MBA's DV360 lines. Only MBAs that have a DV360 line in
 * the report are kept. Needs the platform spend view; on the pacing-facts
 * fallback, or when Snowflake fails, the check is empty and says why.
 */
async function loadDv360Bills(
  q: FinanceFixedCostMarginQuery,
  reportDv360Mbas: string[],
  knownMbas: ReadonlySet<string>,
  mode: SpendSourceMode
): Promise<Dv360BillsResult> {
  const empty = (note: string, ok = true): Dv360BillsResult => ({ cells: [], ok, note, unmatchedLines: 0, unmatchedCents: 0 })
  if (mode !== "line_month_view") {
    return empty("Five Stones bill (DV360) needs VW_PLATFORM_SPEND_LINE_MONTH; it is not shown on the pacing-facts fallback.", false)
  }
  if (!reportDv360Mbas.length) return empty(DV360_CHECK_NOTE)
  const raw = await loadBills(q, FIVE_STONES_CONTACT_SQL_REGEX)
  const lines = raw
    .flatMap((b) => parseFiveStonesDv360Bill(b, knownMbas))
    .filter((l) => inRangeMonth(l.month, q))
  const wanted = new Set(reportDv360Mbas)
  const bills = dv360BillCells(lines).filter((c) => wanted.has(c.mbaNumber))
  const unmatched = unmatchedDv360Lines(lines)
  const unmatchedCents = unmatched.reduce((sum, l) => sum + l.exGstCents, 0)
  try {
    const spend = await loadDv360MbaSpend([...new Set(bills.map((b) => b.mbaNumber))].sort(), q)
    return {
      cells: dv360CheckCells(bills, spend),
      ok: true,
      note: DV360_CHECK_NOTE,
      unmatchedLines: unmatched.length,
      unmatchedCents,
    }
  } catch (error) {
    console.warn("[fixed-cost-margin] DV360 MBA spend unavailable", error)
    return empty("Five Stones bill (DV360) is not shown: DV360 spend by MBA could not be read from Snowflake.", false)
  }
}

function inRangeMonth(month: string, q: FinanceFixedCostMarginQuery): boolean {
  return month >= q.from && month <= q.to
}

export async function fetchFinanceFixedCostMargin(
  q: FinanceFixedCostMarginQuery
): Promise<FinanceFixedCostMarginPayload> {
  const [rawPlan, invoiced, publisherRows, mbaClients] = await Promise.all([
    loadPlanCells(q),
    loadInvoicedKeys(q),
    loadPublishers(),
    loadMbaClients(),
  ])
  const resolvePublisher = createBillPublisherResolver(publisherRows)
  const basisByText = new Map<string, FixedCostPlanCell["costBasis"]>()
  const plan = rawPlan.map((c) => {
    let basis = basisByText.get(c.publisher)
    if (!basis) {
      basis = costBasisForPublisher(resolvePublisher(c.publisher))
      basisByText.set(c.publisher, basis)
    }
    return { ...c, costBasis: basis }
  })
  const platformLineIds = [
    ...new Set(plan.filter((c) => c.costBasis === "platform").map((c) => c.lineItemId.trim().toLowerCase()).filter(Boolean)),
  ].sort()
  const [{ cells, mode }, bills] = await Promise.all([
    loadPlatformSpend(platformLineIds, q),
    loadBillCosts(q, publisherRows, mbaClients),
  ])
  const dv360LineIds = new Set(cells.filter((c) => c.source === DV360_SPEND_SOURCE).map((c) => c.lineItemId))
  const reportDv360Mbas = [
    ...new Set(
      plan
        .filter((c) => dv360LineIds.has(c.lineItemId.trim().toLowerCase()))
        .map((c) => c.mbaNumber.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].sort()
  const dv360 = await loadDv360Bills(q, reportDv360Mbas, new Set(mbaClients.keys()), mode)
  const lines = composeFixedCostMargin({
    plan,
    spend: cells,
    invoiced,
    from: q.from,
    to: q.to,
    billCosts: bills.costs,
    dv360Bills: dv360.cells,
  })
  const dv360Check: FixedCostDv360Check = {
    ok: dv360.ok,
    note: dv360.note,
    rows: buildDv360CheckRows(lines, dv360.cells),
    unmatchedLines: dv360.unmatchedLines,
    unmatchedCents: dv360.unmatchedCents,
  }
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
    billSource: { ok: bills.ok, note: bills.note },
    lines,
    billLines: bills.views,
    billTotals: bills.totals,
    dv360Check,
    summary: summariseFixedCostMargin(lines),
    options: { publishers, platforms },
    notes: [...FIXED_COST_MARGIN_NOTES],
  }
}
