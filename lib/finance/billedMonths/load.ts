/**
 * Billed months at publish (S2 A): the reads. Called only with the switch on.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { isFinancePeriodsLockEnforced } from "@/lib/finance/periods/flag"
import { rowsOf } from "@/lib/xero/dbRows"

import { invoicedMonths, type BillingCell, type InvoicedMonth } from "./billedMonths"

export type BilledMonthsExec = { execute: (q: SQL) => Promise<unknown> }

type BilledMonthsBaseRow = BillingCell & { source: "computed" | "override" }

export type BilledMonthsBase = {
  versionId: number
  /** `legacy_schedules.billingSchedule` of the published tip. */
  schedule: unknown
  rows: BilledMonthsBaseRow[]
}

type Rec = Record<string, unknown>
const str = (v: unknown) => (v == null ? null : String(v))

/** The published tip (pointer and stamp), its billing rows, and the MBA's invoiced months. */
export async function loadBilledMonthsBase(
  exec: BilledMonthsExec,
  args: { mbaNumber: string },
): Promise<{ base: BilledMonthsBase | null; invoiced: InvoicedMonth[] }> {
  const mba = String(args.mbaNumber ?? "").trim()
  const tip = rowsOf<Rec>(
    await exec.execute(sql`
      SELECT v.id, v.legacy_schedules -> 'billingSchedule' AS schedule
      FROM media_plan_masters m
      JOIN media_plan_versions v ON v.id = m.published_version_id AND v.published_at IS NOT NULL
      WHERE lower(m.mba_number) = lower(${mba})
      LIMIT 1
    `),
  )[0]
  if (!tip) return { base: null, invoiced: [] }

  const records = rowsOf<Rec>(
    await exec.execute(sql`
      SELECT invoice_key, mba_number, billing_month, approved_at, exported_at,
             matched_xero_invoice_id, billed, billed_at
      FROM finance_billing_records
      WHERE lower(mba_number) = lower(${mba})
         OR lower(invoice_key) LIKE ${`media:${mba.toLowerCase()}:%`}
    `),
  ).map((r) => ({
    invoiceKey: str(r.invoice_key),
    mbaNumber: str(r.mba_number),
    billingMonth: str(r.billing_month),
    approvedAt: str(r.approved_at),
    exportedAt: str(r.exported_at),
    matchedXeroInvoiceId: str(r.matched_xero_invoice_id),
    billed: r.billed === true,
    billedAt: str(r.billed_at),
  }))
  const enforced = isFinancePeriodsLockEnforced()
  const periods = enforced
    ? rowsOf<Rec>(await exec.execute(sql`SELECT period_month, status FROM finance_periods`)).map((p) => ({
        month: String(p.period_month),
        status: String(p.status),
      }))
    : []
  const invoiced = invoicedMonths({ mbaNumber: mba, records, periods, financePeriodsLockEnforced: enforced })
  if (invoiced.length === 0) return { base: null, invoiced }

  const versionId = Number(tip.id)
  const rows = rowsOf<Rec>(
    await exec.execute(sql`
      SELECT line_item_id, component, to_char(month, 'YYYY-MM') AS month, amount_cents, source
      FROM schedule_months
      WHERE version_id = ${versionId} AND basis = 'billing'
    `),
  ).map((r) => ({
    lineItemId: String(r.line_item_id ?? ""),
    component: String(r.component ?? ""),
    month: String(r.month ?? ""),
    amountCents: Number(r.amount_cents) || 0,
    source: r.source === "override" ? ("override" as const) : ("computed" as const),
  }))
  return { base: { versionId, schedule: tip.schedule ?? null, rows }, invoiced }
}
