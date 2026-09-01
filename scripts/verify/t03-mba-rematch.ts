/**
 * T0-3 report-only: run the Xero reference matcher over every
 * xero_ar_invoices row with mba_number IS NULL.
 *
 * PRINTS ONLY. Writes nothing — no UPDATE, no exception resolve.
 *
 * Usage:
 *   npx tsx --import ./scripts/test-shims/register-server-only.mjs scripts/verify/t03-mba-rematch.ts
 */

import { sql } from "drizzle-orm"

import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

type ArRow = {
  id: number
  reference_raw: string | null
  issue_date: string | null
}

function isFy26(issueDate: string | null): boolean {
  if (!issueDate) return false
  return issueDate >= "2025-07-01" && issueDate < "2026-07-01"
}

async function main() {
  const { closeDb, getDb } = await import("../../db")
  const { rowsOf } = await import("../../lib/xero/dbRows")
  const { matchMbaAgainstMasters } = await import("../../lib/xero/matchMba")
  const { loadMbaMasters, loadScopeOfWorkRefs } = await import(
    "../../lib/xero/applyMatchMba"
  )

  const db = getDb()
  try {
    const [masters, scopes, unmatched] = await Promise.all([
      loadMbaMasters(),
      loadScopeOfWorkRefs(),
      rowsOf<ArRow>(
        await db.execute(sql`
          SELECT id, reference_raw, issue_date::text AS issue_date
          FROM xero_ar_invoices
          WHERE mba_number IS NULL
          ORDER BY id
        `),
      ),
    ])

    let wouldMba = 0
    let wouldSow = 0
    let stillUnmatched = 0
    let fy26Total = 0
    let fy26Mba = 0
    let fy26Sow = 0
    let fy26Still = 0
    const stillRefs: string[] = []

    for (const row of unmatched) {
      const fy26 = isFy26(row.issue_date)
      if (fy26) fy26Total++
      const result = matchMbaAgainstMasters(
        row.reference_raw ?? "",
        masters,
        scopes,
      )
      if (result.matched && result.kind === "mba") {
        wouldMba++
        if (fy26) fy26Mba++
        continue
      }
      if (result.matched && result.kind === "sow") {
        wouldSow++
        if (fy26) fy26Sow++
        continue
      }
      stillUnmatched++
      if (fy26) fy26Still++
      if (stillRefs.length < 20) {
        stillRefs.push(row.reference_raw?.trim() || "(blank)")
      }
    }

    console.log("t03-mba-rematch — print only, no writes")
    console.log(`masters loaded: ${masters.length}`)
    console.log(`scopes loaded: ${scopes.length}`)
    console.log(`total unmatched (mba_number IS NULL): ${unmatched.length}`)
    console.log(`would-match-MBA: ${wouldMba}`)
    console.log(`would-match-SOW: ${wouldSow}`)
    console.log(`still-unmatched: ${stillUnmatched}`)
    console.log("")
    console.log("FY26 (issue_date 2025-07-01 .. 2026-06-30):")
    console.log(`  unmatched: ${fy26Total}`)
    console.log(`  would-match-MBA: ${fy26Mba}`)
    console.log(`  would-match-SOW: ${fy26Sow}`)
    console.log(`  still-unmatched: ${fy26Still}`)
    console.log("")
    console.log("sample of 20 still-unmatched references:")
    for (const ref of stillRefs) {
      console.log(`  ${ref}`)
    }
  } finally {
    await closeDb()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
