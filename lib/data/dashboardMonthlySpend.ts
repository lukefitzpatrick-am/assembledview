/**
 * Postgres port of Xano dashboards `dashboard_monthly_publisher_spend` /
 * `dashboard_monthly_client_spend` (finance-hub schedule-spend treemaps).
 *
 * Delivery-basis schedule_months on each master's published tip, grouped by
 * month × publisher (line_items.publisher) or month × client (masters.mp_client_name).
 * FY filtering stays in lib/api/dashboard/global.ts (unchanged).
 */

import { sql } from "drizzle-orm"
import { roundMoney2 } from "@/lib/format/money"

/** Exact Xano list row for `dashboard_monthly_publisher_spend`. */
export type DashboardMonthlyPublisherSpendRow = {
  month: string
  publisher: string
  amount: number
}

/** Exact Xano list row for `dashboard_monthly_client_spend`. */
export type DashboardMonthlyClientSpendRow = {
  month: string
  client: string
  amount: number
}

/**
 * Joined delivery cell before GROUP BY — fixture / in-memory aggregate input.
 * `month` is first-of-month ISO date (`YYYY-MM-DD`).
 */
export type DashboardMonthlySpendSourceRow = {
  month: string
  amountCents: number
  publisher: string | null
  client: string | null
}

const UNSPECIFIED = "Unspecified"

function labelOrUnspecified(raw: string | null | undefined): string {
  if (typeof raw !== "string") return UNSPECIFIED
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : UNSPECIFIED
}

/** Normalise month to `YYYY-MM-DD` string (first of month when parseable). */
export function normaliseDashboardMonthKey(raw: unknown): string | null {
  if (raw == null) return null
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    const y = raw.getUTCFullYear()
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0")
    return `${y}-${m}-01`
  }
  const s = String(raw).trim()
  if (!s) return null
  // Date / timestamp → date part
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  return null
}

function centsToAmount(cents: number): number {
  return roundMoney2(cents / 100)
}

function parseAmountDollars(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function executeRows(result: unknown): Record<string, unknown>[] {
  const withRows = result as { rows?: Record<string, unknown>[] }
  if (Array.isArray(withRows?.rows)) return withRows.rows
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  return []
}

/**
 * Pure aggregate mirroring the Postgres GROUP BY for publisher spend.
 * Positive totals only; empty publisher → `"Unspecified"`.
 */
export function aggregateDashboardMonthlyPublisherSpend(
  rows: DashboardMonthlySpendSourceRow[]
): DashboardMonthlyPublisherSpendRow[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const month = normaliseDashboardMonthKey(row.month)
    if (!month) continue
    const cents = Number(row.amountCents)
    if (!Number.isFinite(cents) || cents <= 0) continue
    const publisher = labelOrUnspecified(row.publisher)
    const key = `${month}\0${publisher}`
    map.set(key, (map.get(key) ?? 0) + cents)
  }
  return [...map.entries()]
    .map(([key, cents]) => {
      const [month, publisher] = key.split("\0")
      return { month, publisher, amount: centsToAmount(cents) }
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => a.month.localeCompare(b.month) || a.publisher.localeCompare(b.publisher))
}

/**
 * Pure aggregate mirroring the Postgres GROUP BY for client spend.
 * Positive totals only; empty client → `"Unspecified"`.
 */
export function aggregateDashboardMonthlyClientSpend(
  rows: DashboardMonthlySpendSourceRow[]
): DashboardMonthlyClientSpendRow[] {
  const map = new Map<string, number>()
  for (const row of rows) {
    const month = normaliseDashboardMonthKey(row.month)
    if (!month) continue
    const cents = Number(row.amountCents)
    if (!Number.isFinite(cents) || cents <= 0) continue
    const client = labelOrUnspecified(row.client)
    const key = `${month}\0${client}`
    map.set(key, (map.get(key) ?? 0) + cents)
  }
  return [...map.entries()]
    .map(([key, cents]) => {
      const [month, client] = key.split("\0")
      return { month, client, amount: centsToAmount(cents) }
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => a.month.localeCompare(b.month) || a.client.localeCompare(b.client))
}

/**
 * Coerce SQL aggregate rows to the Xano list shape.
 * `month` / `publisher` stay strings (DI-10); `amount` becomes a number.
 */
export function shapeDashboardMonthlyPublisherSpendSqlRows(
  rows: Record<string, unknown>[]
): DashboardMonthlyPublisherSpendRow[] {
  const out: DashboardMonthlyPublisherSpendRow[] = []
  for (const row of rows) {
    const month = normaliseDashboardMonthKey(row.month)
    if (!month) continue
    const publisher = labelOrUnspecified(
      row.publisher == null ? null : String(row.publisher)
    )
    const amount = parseAmountDollars(row.amount)
    if (amount == null || amount <= 0) continue
    out.push({ month, publisher, amount: roundMoney2(amount) })
  }
  return out.sort(
    (a, b) => a.month.localeCompare(b.month) || a.publisher.localeCompare(b.publisher)
  )
}

/**
 * Coerce SQL aggregate rows to the Xano list shape.
 * `month` / `client` stay strings (DI-10); `amount` becomes a number.
 */
export function shapeDashboardMonthlyClientSpendSqlRows(
  rows: Record<string, unknown>[]
): DashboardMonthlyClientSpendRow[] {
  const out: DashboardMonthlyClientSpendRow[] = []
  for (const row of rows) {
    const month = normaliseDashboardMonthKey(row.month)
    if (!month) continue
    const client = labelOrUnspecified(row.client == null ? null : String(row.client))
    const amount = parseAmountDollars(row.amount)
    if (amount == null || amount <= 0) continue
    out.push({ month, client, amount: roundMoney2(amount) })
  }
  return out.sort(
    (a, b) => a.month.localeCompare(b.month) || a.client.localeCompare(b.client)
  )
}

/**
 * Published tip = masters.published_version_id → versions.id (never max(version)).
 * Delivery basis; all schedule components; dollars at the boundary.
 */
export async function fetchDashboardMonthlyPublisherSpendFromPostgres(): Promise<
  DashboardMonthlyPublisherSpendRow[]
> {
  const { getDb } = await import("@/db")
  const db = getDb()
  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM-DD') AS month,
      COALESCE(NULLIF(BTRIM(li.publisher), ''), ${UNSPECIFIED}) AS publisher,
      ROUND((SUM(sm.amount_cents)::numeric / 100), 2) AS amount
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON v.id = m.published_version_id
    INNER JOIN schedule_months sm
      ON sm.version_id = v.id
     AND sm.basis = 'delivery'
    INNER JOIN line_items li
      ON li.version_id = v.id
     AND li.line_item_id = sm.line_item_id
    GROUP BY 1, 2
    HAVING SUM(sm.amount_cents) > 0
    ORDER BY 1, 2
  `)
  return shapeDashboardMonthlyPublisherSpendSqlRows(executeRows(result))
}

export async function fetchDashboardMonthlyClientSpendFromPostgres(): Promise<
  DashboardMonthlyClientSpendRow[]
> {
  const { getDb } = await import("@/db")
  const db = getDb()
  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', sm.month)::date, 'YYYY-MM-DD') AS month,
      COALESCE(NULLIF(BTRIM(m.mp_client_name), ''), ${UNSPECIFIED}) AS client,
      ROUND((SUM(sm.amount_cents)::numeric / 100), 2) AS amount
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON v.id = m.published_version_id
    INNER JOIN schedule_months sm
      ON sm.version_id = v.id
     AND sm.basis = 'delivery'
    GROUP BY 1, 2
    HAVING SUM(sm.amount_cents) > 0
    ORDER BY 1, 2
  `)
  return shapeDashboardMonthlyClientSpendSqlRows(executeRows(result))
}
