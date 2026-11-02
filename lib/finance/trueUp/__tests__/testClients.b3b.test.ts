/**
 * B3b (Luke, 2 Nov 2026): the true-up leaves out test and internal clients
 * (clients.is_test_client, 0112) and plans with no client. Plans with no
 * client are counted and listed as skipped, never hidden. A normal client is
 * unaffected. Covers the report, the loader SQL, the page and email lines,
 * AVA's query_true_up on an older saved run, and the admin client form.
 */
import assert from "node:assert/strict"
import test from "node:test"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"

import {
  buildTrueUpReport,
  financialYearStart,
  isTrueUpSkippedOwner,
  trueUpSkipReason,
  type TrueUpPlanSqlRow,
  type TrueUpScheduleSqlRow,
} from "../compute.js"
import { buildTrueUpCsv, trueUpCsvHeader } from "../csv.js"
import { trueUpPlansSql } from "../load.js"
import { buildTrueUpRunEmail, compactRunRows } from "../monthlyRunModel.js"
import { trueUpSkippedLines } from "../viewModel.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"
import {
  shapeTrueUpForModel,
  trueUpExclusionsFromOwners,
  type TrueUpRunRecord,
} from "@/lib/ava/tools/queryTrueUp"
import { buildEditClientDefaults, buildEditClientPayload, clientEditSchema } from "@/lib/clients/editClientFormSchema"
import { normalizeClientWritePayload } from "@/lib/data/writeClients"

const AS_OF = "2026-09"

/** Copy golf025's schedule onto another MBA: it then needs action like golf025 does. */
function scheduleFor(mba: string): TrueUpScheduleSqlRow[] {
  return SCHEDULE.filter((s) => s.mba_number === "golf025").map((s) => ({ ...s, mba_number: mba }))
}

const TEST_PLANS: TrueUpPlanSqlRow[] = [
  { master_id: 901, mba_number: "krusty003", client_id: 53, is_test_client: true, mp_client_name: "Krusty Krab", campaign_name: "Demo", campaign_status: "booked", campaign_end_date: "2026-12-31", version_id: 9901, version_number: 1 },
  { master_id: 902, mba_number: "assembled001", client_id: 57, is_test_client: true, mp_client_name: "Assembled Media", campaign_name: "LinkedIn Lead Gen", campaign_status: "booked", campaign_end_date: "2026-12-31", version_id: 9902, version_number: 1 },
  { master_id: 903, mba_number: "mb15cmv2xy4x5", client_id: null, is_test_client: false, mp_client_name: "", campaign_name: "No client", campaign_status: "approved", campaign_end_date: "2026-12-31", version_id: 9903, version_number: 1 },
]

function report(plans: TrueUpPlanSqlRow[], schedule: TrueUpScheduleSqlRow[]) {
  return buildTrueUpReport({
    asOfMonth: AS_OF,
    fromMonth: financialYearStart(AS_OF),
    plans,
    schedule,
    invoices: INVOICES,
    matchedRecords: MATCHED_RECORDS,
  })
}

const baseline = report(PLANS.map((p) => ({ ...p, is_test_client: false })), SCHEDULE)
const withTests = report(
  [...PLANS.map((p) => ({ ...p, is_test_client: false })), ...TEST_PLANS],
  [...SCHEDULE, ...scheduleFor("krusty003"), ...scheduleFor("assembled001"), ...scheduleFor("mb15cmv2xy4x5")],
)

test("test and internal clients are not report rows and not in the needs-action count", () => {
  const mbas = withTests.rows.map((r) => r.mbaNumber)
  assert.ok(!mbas.includes("krusty003"))
  assert.ok(!mbas.includes("assembled001"))
  assert.equal(withTests.totals.mbasNeedingAction, baseline.totals.mbasNeedingAction)
  assert.deepEqual(withTests.totals.gapByComponent, baseline.totals.gapByComponent)
  assert.deepEqual(
    withTests.totals.skipped.testClients.map((s) => s.mbaNumber),
    ["assembled001", "krusty003"],
  )
  // Without the flag the same plan would need action (proves the skip is doing the work).
  const unflagged = report(
    [...PLANS, { ...TEST_PLANS[0]!, is_test_client: false }],
    [...SCHEDULE, ...scheduleFor("krusty003")],
  )
  assert.ok(unflagged.rows.some((r) => r.mbaNumber === "krusty003"))
  assert.equal(unflagged.totals.mbasNeedingAction, baseline.totals.mbasNeedingAction + 1)
})

test("a plan with no client is counted and listed as skipped, not hidden", () => {
  assert.ok(!withTests.rows.some((r) => r.mbaNumber === "mb15cmv2xy4x5"))
  assert.deepEqual(withTests.totals.skipped.noClient, [
    { mbaNumber: "mb15cmv2xy4x5", clientName: "", campaignName: "No client" },
  ])
  assert.deepEqual(trueUpSkippedLines(withTests.totals.skipped), [
    "Skipped: test or internal clients (2)",
    "Skipped: no client (1): mb15cmv2xy4x5",
  ])
  const email = buildTrueUpRunEmail(withTests, { appBaseUrl: "https://av.example", source: "cron" })
  assert.match(email.html, /Skipped: test or internal clients \(2\)/)
  assert.match(email.html, /Skipped: no client \(1\): mb15cmv2xy4x5/)
  assert.doesNotMatch(email.html, /krusty003|assembled001/)
})

test("a normal client is unaffected", () => {
  assert.deepEqual(withTests.rows, baseline.rows)
  assert.deepEqual(baseline.totals.skipped, { testClients: [], noClient: [] })
  assert.deepEqual(trueUpSkippedLines(baseline.totals.skipped), [
    "Skipped: test or internal clients (0)",
    "Skipped: no client (0)",
  ])
  // A report saved before 0112 has no skipped block: the lines still render.
  assert.deepEqual(trueUpSkippedLines(undefined), ["Skipped: test or internal clients (0)", "Skipped: no client (0)"])
})

test("the loader reads is_test_client through a left join (a plan with no client still loads)", () => {
  const text = new PgDialect().sqlToQuery(trueUpPlansSql() as SQL).sql
  assert.match(text, /LEFT JOIN clients c\s+ON c\.id = m\.client_id/)
  assert.match(text, /coalesce\(c\.is_test_client, false\) AS is_test_client/)
  assert.doesNotMatch(text, /\b(INSERT|UPDATE|DELETE)\b/i)
})

test("AVA: an older saved run drops test-client and no-client rows and lists the no-client MBAs", () => {
  // Run saved before 0112: its rows still hold the test and no-client plans.
  const oldRun: TrueUpRunRecord = {
    id: 1,
    createdAt: "2026-11-02T00:00:00Z",
    asOfMonth: "2026-10-01",
    fromMonth: "2026-07-01",
    source: "cron",
    xeroSyncedAt: null,
    provisionalInvoices: 0,
    mbasNeedingAction: 3,
    totals: {},
    rows: compactRunRows(
      report(
        [...PLANS.map((p) => ({ ...p, is_test_client: false })), ...TEST_PLANS.map((p) => ({ ...p, is_test_client: false, client_id: p.client_id ?? 99 }))],
        [...SCHEDULE, ...scheduleFor("krusty003"), ...scheduleFor("assembled001"), ...scheduleFor("mb15cmv2xy4x5")],
      ),
    ),
  }
  const exclude = trueUpExclusionsFromOwners([
    { mbaNumber: "krusty003", clientId: 53, isTestClient: true },
    { mbaNumber: "ASSEMBLED001", clientId: 57, isTestClient: true },
    { mbaNumber: "mb15cmv2xy4x5", clientId: null, isTestClient: null },
    { mbaNumber: "golf025", clientId: 19, isTestClient: false },
  ])
  const out = shapeTrueUpForModel(oldRun, [], { openOnly: false }, exclude)
  const mbas = out.rows.map((r) => String(r.mba).toLowerCase())
  assert.ok(!mbas.includes("krusty003") && !mbas.includes("assembled001") && !mbas.includes("mb15cmv2xy4x5"))
  assert.ok(mbas.includes("golf025"))
  assert.deepEqual(out.skipped, { testOrInternalClients: 2, noClient: { count: 1, mbas: ["mb15cmv2xy4x5"] } })
  assert.equal(out.run.mbasNeedingAction, baseline.totals.mbasNeedingAction)

  // A run saved after 0112 carries skipped in its totals.
  const newRun: TrueUpRunRecord = { ...oldRun, totals: withTests.totals, rows: compactRunRows(withTests) }
  const fresh = shapeTrueUpForModel(newRun, [], { openOnly: false })
  assert.deepEqual(fresh.skipped, { testOrInternalClients: 2, noClient: { count: 1, mbas: ["mb15cmv2xy4x5"] } })
})

test("client form: Test or internal client is off by default, admin only, and saves", () => {
  const defaults = buildEditClientDefaults({ id: 53, mp_client_name: "Krusty Krab", mbaidentifier: "krusty" })
  assert.equal(defaults.is_test_client, false)
  assert.equal(buildEditClientDefaults({ id: 53, mbaidentifier: "krusty", is_test_client: true }).is_test_client, true)

  const values = clientEditSchema.parse({ ...defaults, clientname_input: "Krusty Krab", is_test_client: true })
  const admin = buildEditClientPayload(values, { isAdmin: true, initialClientBrain: "" })
  assert.equal(admin.is_test_client, true)
  const notAdmin = buildEditClientPayload(values, { isAdmin: false, initialClientBrain: "" })
  assert.equal("is_test_client" in notAdmin, false)

  // The write path keeps the column, including false (unticking).
  assert.equal(normalizeClientWritePayload({ is_test_client: true }, { requireIdentity: false }).is_test_client, true)
  assert.equal(normalizeClientWritePayload({ is_test_client: false }, { requireIdentity: false }).is_test_client, false)
})

test("B3b fix: the CSV keeps skipped plans visible (no-client MBAs listed, test clients counted)", () => {
  const rows = buildTrueUpCsv(withTests).trim().split("\r\n")
  const width = trueUpCsvHeader().length
  const skipped = rows.filter((r) => r.startsWith("skipped,"))
  for (const r of skipped) assert.ok(r.split(",").length >= width, r)
  assert.ok(skipped.some((r) => r.endsWith(",Skipped: test or internal clients (2)")))
  assert.ok(skipped.some((r) => r.endsWith(",Skipped: no client (1): mb15cmv2xy4x5")))
  assert.ok(skipped.some((r) => r.startsWith("skipped,,mb15cmv2xy4x5,") && r.endsWith(",Skipped: no client. No client")))
  // Test-client plans are a count only: their MBA numbers are nowhere in the CSV.
  assert.ok(!rows.some((r) => /krusty003|assembled001/.test(r)))
  // A report with nothing skipped still prints the two zero lines.
  const base = buildTrueUpCsv(baseline).trim().split("\r\n").filter((r) => r.startsWith("skipped,"))
  assert.equal(base.length, 2)
})

test("B3b fix: one skip rule (no positive client id, else the test flag) for the report and AVA", () => {
  for (const id of [null, undefined, "", 0, -3, "x"]) {
    assert.equal(trueUpSkipReason({ clientId: id, isTestClient: true }), "no_client", String(id))
  }
  assert.equal(trueUpSkipReason({ clientId: 53, isTestClient: true }), "test_client")
  assert.equal(trueUpSkipReason({ clientId: "53", isTestClient: "t" }), "test_client")
  assert.equal(trueUpSkipReason({ clientId: 19, isTestClient: false }), null)
  assert.equal(trueUpSkipReason({ clientId: 19, isTestClient: null }), null)
  assert.equal(isTrueUpSkippedOwner({ clientId: 0, isTestClient: false }), true)
  // AVA now agrees with the report on a 0 client id (it used to keep it).
  const ex = trueUpExclusionsFromOwners([{ mbaNumber: "zero001", clientId: 0, isTestClient: false }])
  assert.ok(ex.noClientMbas.has("zero001"))
  const report0 = report(
    [...PLANS.map((p) => ({ ...p, is_test_client: false })), { ...TEST_PLANS[2]!, mba_number: "zero001", client_id: 0 }],
    [...SCHEDULE, ...scheduleFor("zero001")],
  )
  assert.deepEqual(report0.totals.skipped.noClient.map((s) => s.mbaNumber), ["zero001"])
})
