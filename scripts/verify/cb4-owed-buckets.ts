/**
 * CB-4 report-only: live AR ageing vs the 1 Sep 2026 quoted buckets.
 * PRINT ONLY. No writes.
 */
import { sql } from "drizzle-orm"

import { closeDb, getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"
import { loadEnvLocal } from "../migration/_shared"

loadEnvLocal()

function fmt(n: number): string {
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function main() {
  const db = getDb()
  const today = rowsOf<{ sydney_today: string }>(
    await db.execute(sql`SELECT (timezone('Australia/Sydney', now()))::date::text AS sydney_today`),
  )[0]?.sydney_today
  console.log(`Sydney today: ${today}`)

  const variants = [
    { label: "all outstanding AUTHORISED", extra: sql`` },
    {
      label: "issue_date >= 2025-07-01 (FY26+)",
      extra: sql`AND issue_date >= '2025-07-01'`,
    },
    {
      label: "FY26 issue_date 2025-07-01..2026-06-30",
      extra: sql`AND issue_date >= '2025-07-01' AND issue_date <= '2026-06-30'`,
    },
  ] as const

  for (const v of variants) {
    const rows = rowsOf<{
      bucket: string
      n: number
      amount_due: string
      sub_total: string
    }>(
      await db.execute(sql`
        WITH today AS (
          SELECT (timezone('Australia/Sydney', now()))::date AS d
        ),
        live AS (
          SELECT
            due_date,
            amount_due::numeric AS amount_due,
            sub_total::numeric AS sub_total
          FROM xero_ar_invoices, today
          WHERE upper(coalesce(status, '')) = 'AUTHORISED'
            AND coalesce(amount_due, 0)::numeric > 0
            AND upper(coalesce(status, '')) NOT IN ('VOIDED', 'DELETED')
            ${v.extra}
        )
        SELECT
          CASE
            WHEN due_date IS NULL OR due_date >= (SELECT d FROM today) THEN 'not_yet_due'
            WHEN ((SELECT d FROM today) - due_date) BETWEEN 1 AND 14 THEN 'd1_14'
            WHEN ((SELECT d FROM today) - due_date) BETWEEN 15 AND 30 THEN 'd15_30'
            WHEN ((SELECT d FROM today) - due_date) BETWEEN 31 AND 60 THEN 'd31_60'
            ELSE 'd60_plus'
          END AS bucket,
          count(*)::int AS n,
          coalesce(sum(amount_due), 0)::text AS amount_due,
          coalesce(sum(sub_total), 0)::text AS sub_total
        FROM live
        GROUP BY 1
        ORDER BY 1
      `),
    )
    console.log(`\n=== ${v.label} ===`)
    let n = 0
    let due = 0
    let sub = 0
    for (const r of rows) {
      const nd = Number(r.amount_due)
      const ns = Number(r.sub_total)
      n += r.n
      due += nd
      sub += ns
      console.log(`  ${r.bucket.padEnd(12)} ${String(r.n).padStart(3)}  due ${fmt(nd)}  sub ${fmt(ns)}`)
    }
    console.log(`  TOTAL        ${String(n).padStart(3)}  due ${fmt(due)}  sub ${fmt(sub)}`)
  }

  const { fetchOwedLedger, normalizeOwedQuery } = await import(
    "@/lib/finance/sections/owedQuery"
  )
  const ledger = await fetchOwedLedger(normalizeOwedQuery({}))
  console.log(`\n=== fetchOwedLedger (ex-GST cents) asOf=${ledger.asOf} ===`)
  const order = ["not_yet_due", "d1_14", "d15_30", "d31_60", "d60_plus"] as const
  for (const id of order) {
    const b = ledger.buckets[id]
    console.log(
      `  ${id.padEnd(12)} ${String(b.count).padStart(3)}  ${fmt(b.amountCents / 100)}`
    )
  }
  console.log(
    `  TOTAL        ${String(ledger.totals.count).padStart(3)}  ${fmt(ledger.totals.outstandingCents / 100)}`
  )
  console.log(
    `  coverage ${ledger.coverage.resolvedCount}/${ledger.coverage.totalCount} resolved (${ledger.coverage.resolvedPct}%) · unresolved ${fmt(ledger.coverage.unresolvedAmountCents / 100)}`
  )

  await closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
