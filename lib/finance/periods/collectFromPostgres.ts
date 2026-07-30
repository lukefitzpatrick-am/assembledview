/**
 * Collect billable media rows for a period from Postgres schedule_months
 * (billing basis only) on published tips.
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import type { MediaMonthAgg, SowMonthAgg, RetainerClient } from "@/lib/finance/periods/buildCandidates"
import { toPeriodMonthDate } from "@/lib/finance/periods/monthKey"

export async function collectMediaMonthAggs(periodMonth: string): Promise<MediaMonthAgg[]> {
  const db = getDb()
  const monthDate = toPeriodMonthDate(periodMonth)

  // Published tip = master.version_number matches version.version_number (not max)
  const rows = await db.execute(sql`
    SELECT
      m.mba_number AS mba_number,
      m.client_id AS client_id,
      v.id AS version_id,
      COALESCE(SUM(sm.amount_cents), 0)::bigint AS amount_cents,
      jsonb_agg(
        jsonb_build_object(
          'line_item_id', sm.line_item_id,
          'component', sm.component,
          'amount_cents', sm.amount_cents
        )
        ORDER BY sm.line_item_id, sm.component
      ) AS line_items_json
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON v.master_id = m.id
     AND v.version_number = m.version_number
    INNER JOIN schedule_months sm
      ON sm.version_id = v.id
     AND sm.basis = 'billing'
     AND sm.month = ${monthDate}::date
    GROUP BY m.mba_number, m.client_id, v.id
    HAVING COALESCE(SUM(sm.amount_cents), 0) <> 0
  `)

  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[])
  return (Array.isArray(list) ? list : []).map((r) => ({
    mbaNumber: String(r.mba_number ?? ""),
    clientId: r.client_id == null ? null : Number(r.client_id),
    versionId: Number(r.version_id),
    amountCents: Number(r.amount_cents) || 0,
    lineItemsJson: r.line_items_json ?? [],
  }))
}

export async function collectRetainerClients(): Promise<RetainerClient[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      id,
      COALESCE(mp_client_name, '') AS name,
      mbaidentifier,
      COALESCE(monthlyretainer, 0) AS monthlyretainer,
      retainer_end_month
    FROM clients
    WHERE COALESCE(monthlyretainer, 0) > 0
  `)
  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[])
  return (Array.isArray(list) ? list : []).map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    mbaIdentifier: r.mbaidentifier == null ? null : String(r.mbaidentifier),
    monthlyRetainer: Number(r.monthlyretainer) || 0,
    retainerEndMonth: r.retainer_end_month == null ? null : String(r.retainer_end_month),
  }))
}

/**
 * SOW schedules — best-effort from scope_of_work.months jsonb when present.
 * Amount for period month extracted from months[].month / amount.
 */
export async function collectSowMonthAggs(periodMonth: string): Promise<SowMonthAgg[]> {
  const db = getDb()
  const key = periodMonth.slice(0, 7)
  try {
    const rows = await db.execute(sql`
      SELECT
        id AS sow_id,
        clients_id AS client_id,
        months
      FROM scope_of_work
      WHERE months IS NOT NULL
    `)
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[])
    const out: SowMonthAgg[] = []
    for (const r of Array.isArray(list) ? list : []) {
      const months = r.months
      if (!Array.isArray(months)) continue
      let cents = 0
      const lines: unknown[] = []
      for (const m of months) {
        if (!m || typeof m !== "object") continue
        const rec = m as Record<string, unknown>
        const raw = String(rec.month ?? rec.monthYear ?? rec.billing_month ?? "")
        const mk = raw.includes("-") ? raw.slice(0, 7) : raw
        if (mk !== key && !raw.startsWith(key)) continue
        const amount = Number(rec.amount ?? rec.total ?? rec.exGst ?? 0)
        if (!Number.isFinite(amount) || amount === 0) continue
        cents += Math.round(amount * 100)
        lines.push(rec)
      }
      if (cents === 0) continue
      out.push({
        sowId: Number(r.sow_id),
        clientId: r.client_id == null ? null : Number(r.client_id),
        amountCents: cents,
        lineItemsJson: lines,
      })
    }
    return out
  } catch (err) {
    console.warn("[PC5] collectSowMonthAggs failed", err)
    return []
  }
}
