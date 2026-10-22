/** The pacing digest counts to Melbourne yesterday on both paths (P1). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { p6FixtureRows } from "../../../pacing/portfolio/__tests__/p6Fixture.js"
import { buildPacingDigestEmailHtml } from "../email.js"

const skip = mockModuleSkip()

// 21 Oct 2026 22:30 UTC is 22 Oct 09:30 in Melbourne.
const NOW = new Date("2026-10-21T22:30:00Z")

const cacheCalls: Array<{ channel: string; args: unknown[] }> = []
let snapshotRows: Array<Record<string, unknown>> = []

function cached(channel: string) {
  return async (...args: unknown[]) => {
    cacheCalls.push({ channel, args })
    return []
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: () => "all",
      getCachedSearchPacingRows: cached("search"),
      getCachedSocialPacingRows: cached("social"),
      getCachedProgrammaticPacingRows: cached("programmatic"),
      getCachedAdServingPacingRows: cached("adServing"),
      getCachedDirectPacingRows: cached("direct"),
    },
  })
  await mock.module!("@/lib/pacing/portfolio/portfolioSnapshotStore", {
    namedExports: {
      readPortfolioSnapshot: async () => ({
        asOfDate: "2026-10-22",
        scopeKey: "all",
        liveOnly: true,
        rows: snapshotRows,
        counts: { live: 0, behind: 0, on_track: 0, ahead: 0, over_pacing: 0, attention: 0 },
        generatedAt: "2026-10-21T21:00:00.000Z",
        durationMs: 1,
      }),
    },
  })
  await mock.module!("@/lib/pacing/relabel/notify", {
    namedExports: { addMelbourneDays: (day: string) => day },
  })
  await mock.module!("@/lib/pacing/relabel/listRelabelDrift", {
    namedExports: { listRelabelDrift: async () => [] },
  })
  await mock.module!("@/lib/pacing/relabel/repo", {
    namedExports: { listRelabelLogForDay: async () => [] },
  })
}

test("a snapshot built before P1 is skipped; the caches are read with the count-to day", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  snapshotRows = p6FixtureRows() as unknown as Array<Record<string, unknown>>
  cacheCalls.length = 0
  const payload = await buildPacingDigest(NOW)
  assert.equal(payload.asOfDate, "2026-10-22")
  assert.equal(payload.countToDate, "2026-10-21")
  assert.equal(cacheCalls.length, 5)
  for (const call of cacheCalls) {
    assert.equal(call.args[0], "2026-10-22", call.channel)
    assert.equal(call.args.at(-1), "2026-10-21", call.channel)
  }
  assert.match(buildPacingDigestEmailHtml(payload), /counted to 2026-10-21/)
})

test("a snapshot counted to the count-to day is used as is", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  snapshotRows = p6FixtureRows().map((row) => ({ ...row, countToDate: "2026-10-21" }))
  cacheCalls.length = 0
  const payload = await buildPacingDigest(NOW)
  assert.equal(cacheCalls.length, 0)
  assert.equal(payload.countToDate, "2026-10-21")
  assert.ok(payload.rows.length > 0)
})
