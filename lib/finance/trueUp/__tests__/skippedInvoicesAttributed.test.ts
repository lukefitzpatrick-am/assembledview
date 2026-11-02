/**
 * B3b fix (reviewer's scratch test): a skipped plan with invoices keeps them
 * attributed to its MBA, so they never show up as "Invoice lines with no MBA",
 * for both the test-client flag and a null client.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { buildTrueUpReport, financialYearStart, type TrueUpPlanSqlRow } from "../compute.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"
const AS_OF = "2026-09"
const r = (plans: TrueUpPlanSqlRow[]) => buildTrueUpReport({ asOfMonth: AS_OF, fromMonth: financialYearStart(AS_OF), plans, schedule: SCHEDULE, invoices: INVOICES, matchedRecords: MATCHED_RECORDS })
test("a skipped plan (test flag or no client) keeps its invoices attributed: unattributed unchanged", () => {
  const base = r(PLANS.map((p) => ({ ...p, is_test_client: false })))
  const withInv = base.rows.filter((x) => x.months.some((m) => m.invoiceNumbers.length > 0)).map((x) => x.mbaNumber)
  const target = withInv[0]!
  const flagged = r(PLANS.map((p) => ({ ...p, is_test_client: String(p.mba_number).toLowerCase() === target.toLowerCase() })))
  const nulled = r(PLANS.map((p) => ({ ...p, is_test_client: false, client_id: String(p.mba_number).toLowerCase() === target.toLowerCase() ? null : p.client_id })))
  assert.equal(flagged.unattributed.length, base.unattributed.length)
  assert.equal(nulled.unattributed.length, base.unattributed.length)
  assert.ok(!flagged.rows.some((x) => x.mbaNumber === target))
  assert.deepEqual(flagged.totals.skipped.testClients.map((s) => s.mbaNumber), [target])
  assert.deepEqual(nulled.totals.skipped.noClient.map((s) => s.mbaNumber), [target])
  assert.equal(flagged.totals.mbasNeedingAction <= base.totals.mbasNeedingAction, true)
})
