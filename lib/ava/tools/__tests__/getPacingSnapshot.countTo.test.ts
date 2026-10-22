/** Ava get_pacing_snapshot counts to Melbourne yesterday (P1). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { resolveAdminPacingDays } from "../../../pacing/countTo.js"

const skip = mockModuleSkip()

const calls: Array<{ channel: string; args: unknown[] }> = []

function cached(channel: string, rows: unknown[] = []) {
  return async (...args: unknown[]) => {
    calls.push({ channel, args })
    return rows
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/xano/ava", {
    namedExports: { getAvaXanoSummary: async () => "plan" },
  })
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      getCachedSearchPacingRows: cached("search", [
        {
          mbaNumber: "jayco001",
          clientName: "Jayco",
          campaignName: "Annual",
          lineItemId: "jayco001se1",
          lineItemStatus: "on-track",
          spendToDateLineTotal: 2_100,
          totalLineItemBudget: 3_100,
        },
      ]),
      getCachedSocialPacingRows: cached("social"),
      getCachedProgrammaticPacingRows: cached("programmatic"),
      getCachedAdServingPacingRows: cached("adServing"),
      getCachedDirectPacingRows: cached("direct"),
    },
  })
}

test("cached reads and the summary carry the count-to day", { skip }, async () => {
  const { getPacingSnapshotTool } = await import("../getPacingSnapshot.js")
  const { asOfDate, countToDate } = resolveAdminPacingDays()
  calls.length = 0
  const result = await getPacingSnapshotTool.execute(
    { mbaNumber: "jayco001" },
    { roles: ["admin"] } as never,
  )
  assert.equal(result.isError, false)
  assert.equal(calls.length, 5)
  for (const call of calls) {
    assert.equal(call.args[0], asOfDate, call.channel)
    assert.equal(call.args.at(-1), countToDate, call.channel)
  }
  const body = JSON.parse(String(result.content)) as { asOfDate: string; countedTo?: string; rowCount: number }
  assert.equal(body.asOfDate, asOfDate)
  assert.equal(body.countedTo, countToDate)
  assert.equal(body.rowCount, 1)
})
