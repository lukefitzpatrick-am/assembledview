import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { drizzle } from "drizzle-orm/postgres-js"

import { queueMonthlyReportRuns } from "@/lib/reports/queueMonthlyReportRuns"
import { MONTHLY_CAMPAIGN_REPORT_KIND } from "@/lib/reports/selectMonthlyReportMbas"

const EXPECTED =
  'on conflict ("kind","mba_number","period_start") where kind <> \'on_demand_deck\' do nothing'

test("monthly insert SQL names the on-demand exclusion", () => {
  const db = drizzle.mock()
  const query = queueMonthlyReportRuns(db, [
    {
      kind: MONTHLY_CAMPAIGN_REPORT_KIND,
      mbaNumber: "curatif004",
      clientId: null,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      status: "queued",
    },
  ])
  const text = query.toSQL().sql.replace(/\s+/g, " ").toLowerCase()
  assert.ok(
    text.includes(EXPECTED),
    `expected conflict predicate in:\n${text}`,
  )
})

test("both monthly inserts use the shared conflict predicate", () => {
  const cron = readFileSync(
    path.join(process.cwd(), "app/api/cron/reports-enqueue/route.ts"),
    "utf8",
  )
  const admin = readFileSync(
    path.join(process.cwd(), "lib/reports/adminReportRunsStore.ts"),
    "utf8",
  )
  assert.match(cron, /queueMonthlyReportRuns\(/)
  assert.match(admin, /queueMonthlyReportRuns\(/)
  assert.doesNotMatch(cron, /onConflictDoNothing\(/)
  assert.doesNotMatch(admin, /onConflictDoNothing\(/)
})
