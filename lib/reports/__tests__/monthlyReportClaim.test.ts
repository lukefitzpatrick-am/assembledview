import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const source = readFileSync(
  path.join(process.cwd(), "lib/reports/reportsWorkerStore.ts"),
  "utf8",
)

function claimSql(): string {
  const start = source.indexOf("export async function claimNextReportRun")
  const end = source.indexOf("export async function saveGeneratedReportRun")
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test("monthly claim never returns on_demand_deck", () => {
  const claim = claimSql()
  assert.match(claim, /kind <> 'on_demand_deck'/)
  assert.doesNotMatch(claim, /kind = 'on_demand_deck'/)
})

function resetStuckSql(): string {
  const start = source.indexOf("export async function resetStuckReportRuns")
  const end = source.indexOf("export async function claimNextReportRun")
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

test("resetStuckReportRuns excludes on_demand_deck", () => {
  const stuck = resetStuckSql()
  assert.match(stuck, /kind <> 'on_demand_deck'/)
})
