/**
 * S14 A (switch `billing_above_plan_hold`, needs migration 0121): a media
 * record above plan is held at Send to accounts, the one path from the app to
 * Xero, until a finance reason covers it. Called only with the switch on.
 */
import "server-only"

import { sql, type SQL } from "drizzle-orm"

import {
  centsAbovePlan,
  planBillingTotalCents,
  type AbovePlanHold,
  type AbovePlanReason,
} from "@/lib/finance/abovePlan"
import { billedSentSql } from "@/lib/finance/billedSent"
import type { AccountsPackRow } from "@/lib/finance/sendToAccounts"
import { toCents } from "@/lib/money"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { rowsOf } from "@/lib/xero/dbRows"

export type AbovePlanExec = { execute: (q: SQL) => Promise<unknown> }

const mbaKey = (v: unknown) => String(v ?? "").trim().toLowerCase()

/**
 * Splits pack rows into the ones that may go and the ones held above plan. A
 * row goes when it is not above plan, or its latest reason covers at least
 * the amount above plan now. SOW and retainer rows have no plan here and go.
 */
export async function splitAbovePlanHolds(
  exec: AbovePlanExec,
  input: { rows: AccountsPackRow[]; records: BillingRecord[]; versions: Record<string, unknown>[] },
): Promise<{ rows: AccountsPackRow[]; held: AbovePlanHold[] }> {
  const media = input.rows.filter((r) => r.billingType === "media")
  if (media.length === 0) return { rows: input.rows, held: [] }

  const mbas = [...new Set(media.map((r) => mbaKey(r.mbaNumber)))]
  const billed = rowsOf<{ mba: string; billing_month: string; cents: string | number }>(
    await exec.execute(sql`
      SELECT lower(btrim(b.mba_number)) AS mba, b.billing_month, sum(b.cents) AS cents
      FROM (${billedSentSql(sql`lower(btrim(finance_billing_records.mba_number)) IN (${sql.join(
        mbas.map((m) => sql`${m}`),
        sql`, `,
      )})`)}) b
      GROUP BY 1, 2`),
  )
  const reasons = rowsOf<{ record_id: string | number; reason: string; covers_cents: string | number; by_name: string | null; at: string }>(
    await exec.execute(sql`
      SELECT DISTINCT ON (finance_billing_record_id) finance_billing_record_id AS record_id, reason,
        covers_cents, created_by_name AS by_name, created_at::text AS at
      FROM billing_above_plan_reasons
      WHERE finance_billing_record_id IN (${sql.join(
        media.map((r) => sql`${r.persistedId}`),
        sql`, `,
      )})
      ORDER BY finance_billing_record_id, id DESC`),
  )

  const billedMonth = new Map<string, number>()
  const billedTotal = new Map<string, number>()
  for (const b of billed) {
    const cents = Number(b.cents)
    billedMonth.set(`${b.mba}|${b.billing_month}`, (billedMonth.get(`${b.mba}|${b.billing_month}`) ?? 0) + cents)
    billedTotal.set(b.mba, (billedTotal.get(b.mba) ?? 0) + cents)
  }
  const reasonById = new Map(
    reasons.map((r) => [
      Number(r.record_id),
      { reason: r.reason, coversCents: Number(r.covers_cents), byName: r.by_name, at: r.at },
    ]),
  )
  const recordByKey = new Map(input.records.map((r) => [String(r.invoice_key ?? "").trim(), r]))
  const versionById = new Map(input.versions.map((v) => [Number(v.id), v]))

  const go: AccountsPackRow[] = []
  const held: AbovePlanHold[] = []
  for (const row of input.rows) {
    if (row.billingType !== "media") {
      go.push(row)
      continue
    }
    const mba = mbaKey(row.mbaNumber)
    const version = versionById.get(Number(recordByKey.get(row.invoiceKey)?.media_plan_version_id))
    const toBillCents = toCents(row.total)
    // The pack total is the billing-month function's figure for this record.
    const planMonthCents = toBillCents
    // No plan version found: a plan of $0, so the whole record is held (fail closed).
    const planTotalCents = version ? planBillingTotalCents(version) : 0
    const billedMonthCents = billedMonth.get(`${mba}|${row.billingMonth}`) ?? 0
    const billedTotalCents = billedTotal.get(mba) ?? 0
    const abovePlanCents = centsAbovePlan({ toBillCents, planMonthCents, planTotalCents, billedMonthCents, billedTotalCents })
    const reason = reasonById.get(row.persistedId) ?? null
    if (abovePlanCents === 0 || (reason && reason.coversCents >= abovePlanCents)) {
      go.push(row)
      continue
    }
    held.push({
      invoiceKey: row.invoiceKey,
      persistedId: row.persistedId,
      clientName: row.clientName,
      mbaNumber: row.mbaNumber,
      billingMonth: row.billingMonth,
      toBillCents,
      planMonthCents,
      planTotalCents,
      billedMonthCents,
      billedTotalCents,
      abovePlanCents,
      reason,
    })
  }
  return { rows: go, held }
}

/** Stores a finance reason covering `coversCents` above plan. Append only. */
export async function insertAbovePlanReason(
  exec: AbovePlanExec,
  input: { recordId: number; reason: string; coversCents: number; by: number; byName: string },
): Promise<void> {
  await exec.execute(sql`
    INSERT INTO billing_above_plan_reasons (finance_billing_record_id, reason, covers_cents, created_by, created_by_name)
    VALUES (${input.recordId}, ${input.reason}, ${input.coversCents}, ${input.by}, ${input.byName})`)
}
