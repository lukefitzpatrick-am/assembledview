/**
 * Finance Costs summary — delivery-basis booked publisher cost + xero_ap_bills.
 *
 * Booked cost (CP-3): published tip schedule_months basis=delivery, **media only**,
 * client-pays media excluded; statuses approved|booked|completed. Fee + adserving
 * are separate labelled figures. Draft/planned/cancelled → coverage.excludedByStatusCents.
 * Publisher identity: per-channel accessor (publisherIdentitySql), not bare li.publisher.
 */

import { sql, type SQL } from "drizzle-orm"
import { getDb } from "@/db"
import { getCurrentBillingMonth } from "@/lib/finance/months"
import {
  AP_ATTRIBUTION_RULE_TEXT,
  attributeApBillToPublisher,
  buildPublisherNameIndex,
} from "@/lib/finance/sections/costsAttribution"
import {
  FINANCE_STATUS_EXCLUDED_SQL,
  FINANCE_STATUS_INCLUDED_SQL,
  PAYABLES_MEDIA_ONLY_BASIS_CAPTION,
  formatExcludedByStatusCaption,
  type ExcludedByStatusCents,
} from "@/lib/finance/sections/financeCampaignStatus"
import { normalizeSummaryQuery } from "@/lib/finance/sections/summaryQuery"
import {
  PUBLISHER_IDENTITY_SQL,
  UNSPECIFIED_PUBLISHER,
} from "@/lib/finance/sections/publisherIdentitySql"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import {
  CAMPAIGN_LEVEL_NO_LINE_DETAIL,
  IS_SERVICE_LINE_SQL,
  LINE_DETAIL_COVERAGE_NOTE,
  lineDimOrCampaignLevelSql,
} from "@/lib/finance/sections/serviceLineBucket"
import { costsDeltaCents, xeroApExGstCents } from "@/lib/finance/sections/costsApAmount"
import { normalizeContactKey } from "@/lib/xero/normalizeContact"

export type FinanceCostsQuery = {
  fy: number
  from: string
  to: string
  clientIds: number[]
  /** Optional channel filter (line_channel enum text values). */
  channels: string[]
  /** Optional publisher identity substring filter (case-insensitive). */
  publishers: string[]
}

export type CostsApBillRow = {
  id: number
  invoiceNumber: string | null
  status: string | null
  activityMonth: string
  dueDate: string | null
  totalCents: number
  amountDueCents: number
  contactName: string | null
  pdfUrl: string | null
  attributionMethod: "name" | "unattributed"
  heuristic: boolean
  publisherLabel: string | null
}

export type CostsPublisherMonthRow = {
  publisher: string
  month: string
  bookedCents: number
  apBilledCents: number
  amountDueCents: number
  deltaCents: number
  channel: string | null
  bills: CostsApBillRow[]
}

export type FinanceCostsSummaryPayload = {
  scope: {
    fy: number
    from: string
    to: string
    clients: number[]
    channels: string[]
    publishers: string[]
    currentMonth: string
  }
  kpis: {
    bookedCostFytdCents: number
    /** Delivery fee (included statuses) — not in booked-cost headline. */
    feeCents: number
    /** Delivery adserving (included statuses) — not in booked-cost headline. */
    adservingCents: number
    apBilledFytdCents: number
    unbilledAccrualCents: number
    basis: string
  }
  coverage: {
    bookedWithPublisherIdentityPct: number
    bookedInMonthsWithAnyApBillPct: number
    bookedTotalCents: number
    bookedWithIdentityCents: number
    bookedInApMonthsCents: number
    lineDetailPct: number
    lineDetailCents: number
    campaignLevelCents: number
    orphanLineCents: number
    clientPaysExcludedCents: number
    excludedByStatusCents: ExcludedByStatusCents
    lineDetailNote: string
    excludedByStatusCaption: string
    note: string
  }
  byMonth: Array<{
    month: string
    bookedCents: number
    apBilledCents: number
    amountDueCents: number
  }>
  byPublisher: Array<{
    publisher: string
    bookedCents: number
    apBilledCents: number
  }>
  publisherMonths: CostsPublisherMonthRow[]
  unattributedBills: CostsApBillRow[]
  topPublishers: Array<{ publisher: string; bookedCents: number }>
  attributionRule: string
  _debugSql?: { bookedByPublisherMonth: string }
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

function clientFilterSql(clientIds: number[]): SQL {
  if (!clientIds.length) return sql`TRUE`
  return sql`m.client_id = ANY(ARRAY[${sql.join(
    clientIds.map((id) => sql`${id}::bigint`),
    sql`, `
  )}])`
}

function channelFilterSql(channels: string[]): SQL {
  if (!channels.length) return sql`TRUE`
  return sql`li.channel::text = ANY(ARRAY[${sql.join(
    channels.map((c) => sql`${c}`),
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

function asDollarsToCents(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(String(v))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function monthKeyFromDate(v: unknown): string {
  if (v == null) return ""
  const s = String(v)
  return s.length >= 7 ? s.slice(0, 7) : s
}

function pdfUrlFromJson(v: unknown): string | null {
  if (v == null) return null
  let obj: unknown = v
  if (typeof v === "string") {
    try {
      obj = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (obj && typeof obj === "object" && "url" in obj) {
    const url = (obj as { url?: unknown }).url
    return typeof url === "string" && url.trim() ? url : null
  }
  return null
}

export function normalizeCostsQuery(input: {
  fy?: number
  from?: string
  to?: string
  clients?: number[]
  channels?: string[]
  publishers?: string[]
  today?: Date
}): FinanceCostsQuery {
  const base = normalizeSummaryQuery({
    fy: input.fy,
    from: input.from,
    to: input.to,
    clients: input.clients,
    today: input.today,
  })
  const channels = (input.channels ?? [])
    .map((c) => c.trim())
    .filter(Boolean)
  const publishers = (input.publishers ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
  return { ...base, channels, publishers }
}

export function bookedByPublisherMonthSqlText(q: FinanceCostsQuery): string {
  const from = monthStartDate(q.from)
  const toEx = monthEndExclusive(q.to)
  const clients =
    q.clientIds.length > 0 ? `AND m.client_id = ANY(ARRAY[${q.clientIds.join(",")}])` : ""
  const channels =
    q.channels.length > 0
      ? `AND li.channel::text = ANY(ARRAY[${q.channels.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")}])`
      : ""
  const publisherDim = lineDimOrCampaignLevelSql(
    `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNSPECIFIED_PUBLISHER}')`
  )
  const channelDim = lineDimOrCampaignLevelSql("li.channel::text")
  return `
SELECT
  to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
  ${publisherDim} AS publisher,
  ${channelDim} AS channel,
  SUM(sm.amount_cents) AS booked_cents
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
  ${channels}
GROUP BY 1, 2, 3
`.trim()
}

function publisherFilterPass(label: string, filters: string[]): boolean {
  if (!filters.length) return true
  const lower = label.toLowerCase()
  return filters.some((f) => lower.includes(f.toLowerCase()))
}

export async function fetchFinanceCostsSummary(
  input: FinanceCostsQuery
): Promise<FinanceCostsSummaryPayload> {
  const db = getDb()
  const q = input
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const currentMonth = getCurrentBillingMonth()
  const clientSql = clientFilterSql(q.clientIds)
  const channelSql = channelFilterSql(q.channels)
  const lineJoin = sql.raw(SCHEDULE_LINE_JOIN_SQL)

  const publisherDimSql = lineDimOrCampaignLevelSql(
    `COALESCE(${PUBLISHER_IDENTITY_SQL.trim()}, '${UNSPECIFIED_PUBLISHER}')`
  )
  const channelDimSql = lineDimOrCampaignLevelSql("li.channel::text")
  const statusIncluded = sql.raw(FINANCE_STATUS_INCLUDED_SQL)
  const statusExcluded = sql.raw(FINANCE_STATUS_EXCLUDED_SQL)
  const isService = sql.raw(IS_SERVICE_LINE_SQL)

  const bookedAgg = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM') AS month,
      ${sql.raw(publisherDimSql)} AS publisher,
      ${sql.raw(channelDimSql)} AS channel,
      SUM(sm.amount_cents)::bigint AS booked_cents
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
      AND ${channelSql}
    GROUP BY 1, 2, 3
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

  const coverageMetaAgg = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE
        WHEN NOT (${isService}) AND li.id IS NOT NULL
          AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
        THEN sm.amount_cents ELSE 0 END), 0) AS line_detail_cents,
      COALESCE(SUM(CASE
        WHEN ${isService} AND COALESCE(li.client_pays_for_media, FALSE) = FALSE
        THEN sm.amount_cents ELSE 0 END), 0) AS campaign_level_cents,
      COALESCE(SUM(CASE
        WHEN NOT (${isService}) AND li.id IS NULL THEN sm.amount_cents ELSE 0 END), 0)
        AS orphan_line_cents,
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

  let bookedRows = executeRows(bookedAgg).map((row) => ({
    month: String(row.month ?? ""),
    publisher: String(row.publisher ?? UNSPECIFIED_PUBLISHER),
    channel: row.channel == null ? null : String(row.channel),
    bookedCents: asBigInt(row.booked_cents),
  }))

  if (q.publishers.length) {
    bookedRows = bookedRows.filter((r) => publisherFilterPass(r.publisher, q.publishers))
  }

  const apAgg = await db.execute(sql`
    SELECT
      b.id,
      b.invoice_number,
      b.status,
      to_char(date_trunc('month', COALESCE(b.activity_month, b.issue_date))::date, 'YYYY-MM') AS activity_month,
      b.due_date,
      b.sub_total,
      b.total,
      b.amount_due,
      b.pdf_file,
      c.name AS contact_name
    FROM xero_ap_bills b
    LEFT JOIN xero_contacts c ON c.xero_contact_id = b.xero_contact_id
    WHERE COALESCE(b.activity_month, b.issue_date) >= ${fromDate}::date
      AND COALESCE(b.activity_month, b.issue_date) < ${toExclusive}::date
      AND COALESCE(UPPER(b.status), '') NOT IN ('DELETED', 'VOIDED')
  `)

  const publishersResult = await db.execute(sql`
    SELECT id, publisher_name
    FROM publishers
    WHERE NULLIF(BTRIM(publisher_name), '') IS NOT NULL
  `)
  const publisherIndex = buildPublisherNameIndex(
    executeRows(publishersResult).map((row) => ({
      id: asBigInt(row.id),
      publisherName: String(row.publisher_name ?? ""),
    }))
  )

  const bookedLabelsByKey = new Map<string, string>()
  for (const row of bookedRows) {
    if (row.publisher === UNSPECIFIED_PUBLISHER) continue
    const key = normalizeContactKey(row.publisher)
    if (key && !bookedLabelsByKey.has(key)) bookedLabelsByKey.set(key, row.publisher)
  }

  const attributedBills: CostsApBillRow[] = []
  const unattributedBills: CostsApBillRow[] = []

  for (const row of executeRows(apAgg)) {
    const contactName = row.contact_name == null ? null : String(row.contact_name)
    const attr = attributeApBillToPublisher(contactName, publisherIndex, bookedLabelsByKey)
    const bill: CostsApBillRow = {
      id: asBigInt(row.id),
      invoiceNumber: row.invoice_number == null ? null : String(row.invoice_number),
      status: row.status == null ? null : String(row.status),
      activityMonth: String(row.activity_month ?? monthKeyFromDate(row.due_date)),
      dueDate: row.due_date == null ? null : String(row.due_date).slice(0, 10),
      totalCents: xeroApExGstCents(row.sub_total),
      amountDueCents: asDollarsToCents(row.amount_due),
      contactName,
      pdfUrl: pdfUrlFromJson(row.pdf_file),
      attributionMethod: attr.method,
      heuristic: attr.heuristic,
      publisherLabel: attr.publisherLabel,
    }

    if (q.publishers.length && attr.method === "name" && attr.publisherLabel) {
      if (!publisherFilterPass(attr.publisherLabel, q.publishers)) continue
    } else if (q.publishers.length && attr.method === "unattributed") {
      // Keep unattributed when filtering publishers so they are never silently dropped
      // from the global unattributed bucket when no publisher filter — when filter is on,
      // still keep them visible in Unattributed group.
    }

    if (attr.method === "unattributed") {
      unattributedBills.push(bill)
    } else {
      attributedBills.push(bill)
    }
  }

  const feeAdsRow = executeRows(feeAdsAgg)[0] ?? {}
  const feeCents = asBigInt(feeAdsRow.fee_cents)
  const adservingCents = asBigInt(feeAdsRow.adserving_cents)
  const coverageMeta = executeRows(coverageMetaAgg)[0] ?? {}
  const lineDetailCents = asBigInt(coverageMeta.line_detail_cents)
  const campaignLevelCents = asBigInt(coverageMeta.campaign_level_cents)
  const orphanLineCents = asBigInt(coverageMeta.orphan_line_cents)
  const clientPaysExcludedCents = asBigInt(coverageMeta.client_pays_excluded_cents)
  const excludedRow = executeRows(excludedByStatusAgg)[0] ?? {}
  const excludedByStatusCents: ExcludedByStatusCents = {
    media: asBigInt(excludedRow.media_cents),
    fee: asBigInt(excludedRow.fee_cents),
    adserving: asBigInt(excludedRow.adserving_cents),
  }

  // Aggregate booked by month / publisher
  const bookedByMonth = new Map<string, number>()
  const bookedByPublisher = new Map<string, number>()
  const bookedByPubMonth = new Map<string, CostsPublisherMonthRow>()
  let bookedTotalCents = 0
  let bookedWithIdentityCents = 0

  for (const row of bookedRows) {
    bookedTotalCents += row.bookedCents
    if (
      row.publisher !== UNSPECIFIED_PUBLISHER &&
      row.publisher !== CAMPAIGN_LEVEL_NO_LINE_DETAIL
    ) {
      bookedWithIdentityCents += row.bookedCents
    }
    bookedByMonth.set(row.month, (bookedByMonth.get(row.month) ?? 0) + row.bookedCents)
    bookedByPublisher.set(
      row.publisher,
      (bookedByPublisher.get(row.publisher) ?? 0) + row.bookedCents
    )
    const key = `${row.publisher}\0${row.month}`
    const existing = bookedByPubMonth.get(key)
    if (existing) {
      existing.bookedCents += row.bookedCents
    } else {
      bookedByPubMonth.set(key, {
        publisher: row.publisher,
        month: row.month,
        bookedCents: row.bookedCents,
        apBilledCents: 0,
        amountDueCents: 0,
        deltaCents: 0,
        channel: row.channel,
        bills: [],
      })
    }
  }

  const apByMonth = new Map<string, { billed: number; due: number }>()
  const apByPublisher = new Map<string, number>()

  const attachBill = (publisherLabel: string, bill: CostsApBillRow) => {
    const month = bill.activityMonth
    const m = apByMonth.get(month) ?? { billed: 0, due: 0 }
    m.billed += bill.totalCents
    m.due += bill.amountDueCents
    apByMonth.set(month, m)
    apByPublisher.set(publisherLabel, (apByPublisher.get(publisherLabel) ?? 0) + bill.totalCents)

    const key = `${publisherLabel}\0${month}`
    let cell = bookedByPubMonth.get(key)
    if (!cell) {
      cell = {
        publisher: publisherLabel,
        month,
        bookedCents: 0,
        apBilledCents: 0,
        amountDueCents: 0,
        deltaCents: 0,
        channel: null,
        bills: [],
      }
      bookedByPubMonth.set(key, cell)
    }
    cell.apBilledCents += bill.totalCents
    cell.amountDueCents += bill.amountDueCents
    cell.bills.push(bill)
  }

  for (const bill of attributedBills) {
    const label = bill.publisherLabel ?? "Unknown"
    if (q.publishers.length && !publisherFilterPass(label, q.publishers)) continue
    attachBill(label, bill)
  }

  // Unattributed AP still counts toward month AP totals (for trend / KPIs)
  for (const bill of unattributedBills) {
    const month = bill.activityMonth
    const m = apByMonth.get(month) ?? { billed: 0, due: 0 }
    m.billed += bill.totalCents
    m.due += bill.amountDueCents
    apByMonth.set(month, m)
  }

  for (const cell of bookedByPubMonth.values()) {
    cell.deltaCents = costsDeltaCents(cell.bookedCents, cell.apBilledCents)
    cell.bills.sort((a, b) => (a.invoiceNumber ?? "").localeCompare(b.invoiceNumber ?? ""))
  }

  const monthsWithAp = new Set(
    [...apByMonth.entries()].filter(([, v]) => v.billed !== 0).map(([m]) => m)
  )
  let bookedInApMonthsCents = 0
  for (const [month, cents] of bookedByMonth) {
    if (monthsWithAp.has(month)) bookedInApMonthsCents += cents
  }

  const pct = (num: number, den: number) =>
    den <= 0 ? 0 : Math.round((num / den) * 1000) / 10

  const allMonths = new Set<string>([...bookedByMonth.keys(), ...apByMonth.keys()])
  const byMonth = [...allMonths]
    .sort()
    .map((month) => ({
      month,
      bookedCents: bookedByMonth.get(month) ?? 0,
      apBilledCents: apByMonth.get(month)?.billed ?? 0,
      amountDueCents: apByMonth.get(month)?.due ?? 0,
    }))

  const allPublishers = new Set<string>([
    ...bookedByPublisher.keys(),
    ...apByPublisher.keys(),
  ])
  const byPublisher = [...allPublishers]
    .map((publisher) => ({
      publisher,
      bookedCents: bookedByPublisher.get(publisher) ?? 0,
      apBilledCents: apByPublisher.get(publisher) ?? 0,
    }))
    .sort((a, b) => b.bookedCents - a.bookedCents || b.apBilledCents - a.apBilledCents)

  const publisherMonths = [...bookedByPubMonth.values()].sort((a, b) => {
    const p = a.publisher.localeCompare(b.publisher)
    if (p !== 0) return p
    return a.month.localeCompare(b.month)
  })

  const topPublishers = byPublisher
    .filter((p) => p.bookedCents > 0)
    .slice(0, 8)
    .map((p) => ({ publisher: p.publisher, bookedCents: p.bookedCents }))

  const apBilledFytdCents =
    [...apByMonth.values()].reduce((s, v) => s + v.billed, 0)

  return {
    scope: {
      fy: q.fy,
      from: q.from,
      to: q.to,
      clients: q.clientIds,
      channels: q.channels,
      publishers: q.publishers,
      currentMonth,
    },
    kpis: {
      bookedCostFytdCents: bookedTotalCents,
      feeCents,
      adservingCents,
      apBilledFytdCents,
      unbilledAccrualCents: bookedTotalCents - apBilledFytdCents,
      basis: PAYABLES_MEDIA_ONLY_BASIS_CAPTION,
    },
    coverage: {
      bookedWithPublisherIdentityPct: pct(bookedWithIdentityCents, bookedTotalCents),
      bookedInMonthsWithAnyApBillPct: pct(bookedInApMonthsCents, bookedTotalCents),
      bookedTotalCents,
      bookedWithIdentityCents,
      bookedInApMonthsCents,
      lineDetailPct: pct(lineDetailCents, bookedTotalCents),
      lineDetailCents,
      campaignLevelCents,
      orphanLineCents,
      clientPaysExcludedCents,
      excludedByStatusCents,
      lineDetailNote: LINE_DETAIL_COVERAGE_NOTE,
      excludedByStatusCaption: formatExcludedByStatusCaption(excludedByStatusCents.media),
      note:
        "Identity % = booked media $ with FN0 publisher accessor non-null (excludes Unspecified, campaign-level synthetics, and orphans). AP-month % = booked $ falling in months that have any AP bill (not publisher-matched). Orphan schedule keys (no line_items) are in the headline but not fully attributed — see orphanLineCents.",
    },
    byMonth,
    byPublisher,
    publisherMonths,
    unattributedBills: unattributedBills.sort((a, b) =>
      a.activityMonth.localeCompare(b.activityMonth)
    ),
    topPublishers,
    attributionRule: AP_ATTRIBUTION_RULE_TEXT,
    _debugSql: {
      bookedByPublisherMonth: bookedByPublisherMonthSqlText(q),
    },
  }
}
