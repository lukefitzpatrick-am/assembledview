/** B34: data checks in the pacing digest (Tue and Fri 09:30 AEDT; switch pacing_digest_data_checks). */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL } from "../../../pacing/relabel/labelMapActive.js"
import {
  CM360_DRIFT_COUNTS_SQL,
  CM360_DRIFT_OUT_OF_WINDOW_SQL,
  loadPacingDigestDataChecks,
  runPacingDigestDataChecks,
  type DataCheckQuery,
  type PacingDigestDataChecks,
} from "../dataChecks.js"
import { buildPacingDigestEmailHtml, cm360DriftLines, labelMapDuplicateLines } from "../email.js"
import type { PacingDigestPayload } from "../buildPacingDigest.js"
import { addDaysISO } from "@/lib/dates/civil"

const MISSING = new Error(
  "SQL compilation error:\nObject 'ASSEMBLEDVIEW.MART.VW_PACING_FACT_CM360_DRIFT' does not exist or not authorized.",
)

type Answers = {
  counts?: Record<string, unknown> | Error
  outOfWindow?: Array<Record<string, unknown>>
  duplicates?: Array<Record<string, unknown>> | Error
}

function fakeQuery(a: Answers): DataCheckQuery & { calls: string[] } {
  const calls: string[] = []
  const q = (async (sqlText: string) => {
    if (sqlText === CM360_DRIFT_COUNTS_SQL) {
      calls.push("counts")
      if (a.counts instanceof Error) throw a.counts
      return [a.counts ?? { TOTAL_ROWS: 0, IN_WINDOW_ROWS: 0, OUT_OF_WINDOW_ROWS: 0 }]
    }
    if (sqlText === CM360_DRIFT_OUT_OF_WINDOW_SQL) {
      calls.push("outOfWindow")
      return a.outOfWindow ?? []
    }
    if (sqlText === LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL) {
      calls.push("duplicates")
      if (a.duplicates instanceof Error) throw a.duplicates
      return a.duplicates ?? []
    }
    throw new Error(`unexpected SQL ${sqlText}`)
  }) as DataCheckQuery & { calls: string[] }
  q.calls = calls
  return q
}

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = warn
  }
}

function payloadWith(dataChecks?: PacingDigestDataChecks): PacingDigestPayload {
  return {
    asOfDate: "2026-11-13",
    countToDate: "2026-11-12",
    builtAt: "2026-11-12T20:00:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: { "at-risk": [], behind: [], on: [], ahead: [], "no-data": [] },
    counts: { atRisk: 0, behind: 0, on: 0, ahead: 0, noData: 0, total: 0 },
    relabels: { day: "2026-11-12", events: [], drift: [] },
    ...(dataChecks ? { dataChecks } : {}),
  }
}

test("the SQL reads the CD1 view's window column and the LM1 key", () => {
  assert.match(CM360_DRIFT_COUNTS_SQL, /FROM ASSEMBLEDVIEW\.MART\.VW_PACING_FACT_CM360_DRIFT/)
  assert.match(CM360_DRIFT_COUNTS_SQL, /COUNT_IF\(IN_REFRESH_WINDOW\)/)
  assert.match(CM360_DRIFT_COUNTS_SQL, /COUNT_IF\(NOT IN_REFRESH_WINDOW\)/)
  assert.match(CM360_DRIFT_OUT_OF_WINDOW_SQL, /WHERE NOT IN_REFRESH_WINDOW/)
  assert.match(CM360_DRIFT_OUT_OF_WINDOW_SQL, /LIMIT 10/)
  assert.match(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL, /LOWER\(TRIM\(CHANNEL\)\)/)
  assert.match(LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL, /LOWER\(TRIM\(CAST\(PLATFORM_LINE_ITEM_ID AS VARCHAR\)\)\)/)
})

test("B34fix: the in and out of window counts cannot be swapped (alias pins and a row evaluation)", async () => {
  const sql = CM360_DRIFT_COUNTS_SQL.replace(/\s+/g, " ")
  assert.match(sql, /COUNT_IF\(IN_REFRESH_WINDOW\) AS IN_WINDOW_ROWS\b/)
  assert.match(sql, /COUNT_IF\(NOT IN_REFRESH_WINDOW\) AS OUT_OF_WINDOW_ROWS\b/)
  assert.match(sql, /COUNT\(\*\) AS TOTAL_ROWS\b/)
  // Evaluate the SELECT list over view rows: 2 inside the window, 5 outside.
  const viewRows = [true, true, false, false, false, false, false].map((w) => ({ IN_REFRESH_WINDOW: w }))
  const counts: Record<string, number> = {}
  const item = /(COUNT\(\*\)|COUNT_IF\((NOT )?IN_REFRESH_WINDOW\)) AS (\w+)/g
  for (let m = item.exec(sql); m; m = item.exec(sql)) {
    const [, expr, not, alias] = m
    counts[alias!] =
      expr === "COUNT(*)" ? viewRows.length : viewRows.filter((r) => (not ? !r.IN_REFRESH_WINDOW : r.IN_REFRESH_WINDOW)).length
  }
  assert.deepEqual(counts, { TOTAL_ROWS: 7, IN_WINDOW_ROWS: 2, OUT_OF_WINDOW_ROWS: 5 })
  const evaluated: DataCheckQuery = async (q) => (q === CM360_DRIFT_COUNTS_SQL ? [counts] : [])
  const checks = await runPacingDigestDataChecks(evaluated)
  assert.ok(checks.cm360Drift.status === "ok")
  assert.equal(checks.cm360Drift.inWindowRows, 2)
  assert.equal(checks.cm360Drift.outOfWindowRows, 5)
  const html = cm360DriftLines(checks.cm360Drift)
  assert.match(html, /2 rows are inside the 14-day refresh window/)
  assert.match(html, /5 rows are outside it and will not fix themselves/)
})

test("view missing: drift is 'check not available', duplicates still run, the email says so", async () => {
  const q = fakeQuery({ counts: MISSING })
  const checks = await quiet(() => runPacingDigestDataChecks(q))
  assert.equal(checks.cm360Drift.status, "unavailable")
  assert.equal(checks.cm360Drift.status === "unavailable" && checks.cm360Drift.reason, "missing_view")
  assert.deepEqual(checks.labelMapDuplicates, { status: "ok", duplicateKeys: 0, sample: [] })
  const html = cm360DriftLines(checks.cm360Drift)
  assert.match(html, /CM360 drift \(PACING_FACT vs CM360\): check not available/)
  assert.match(html, /VW_PACING_FACT_CM360_DRIFT does not exist yet; run the CD1 migration/)
  const email = buildPacingDigestEmailHtml(payloadWith(checks))
  assert.match(email, /Data checks/)
  assert.match(email, /check not available/)
})

test("any other failure is 'check not available' (query failed), for each check", async () => {
  const q = fakeQuery({ counts: new Error("timeout"), duplicates: new Error("warehouse suspended") })
  const checks = await quiet(() => runPacingDigestDataChecks(q))
  assert.equal(checks.cm360Drift.status === "unavailable" && checks.cm360Drift.reason, "error")
  assert.equal(checks.labelMapDuplicates.status === "unavailable" && checks.labelMapDuplicates.reason, "error")
  assert.match(labelMapDuplicateLines(checks.labelMapDuplicates), /Label map duplicates: check not available \(the query failed; see the cron log\)/)
})

test("0 drift rows and 0 duplicate keys: one 'none' line each, no sample query", async () => {
  const q = fakeQuery({})
  const checks = await runPacingDigestDataChecks(q)
  assert.deepEqual(q.calls.sort(), ["counts", "duplicates"])
  assert.match(cm360DriftLines(checks.cm360Drift), /: none\. PACING_FACT matches CM360/)
  assert.match(labelMapDuplicateLines(checks.labelMapDuplicates), /: none\./)
})

test("rows inside the window only: counted, no list", async () => {
  const q = fakeQuery({ counts: { TOTAL_ROWS: 3, IN_WINDOW_ROWS: 3, OUT_OF_WINDOW_ROWS: 0 } })
  const checks = await runPacingDigestDataChecks(q)
  assert.ok(!q.calls.includes("outOfWindow"))
  const html = cm360DriftLines(checks.cm360Drift)
  assert.match(html, /3 rows\./)
  assert.match(html, /3 rows are inside the 14-day refresh window/)
  assert.match(html, /0 rows are outside it/)
  assert.doesNotMatch(html, /<li>/)
})

test("rows in and out of the window: the out-of-window rows are called out by name", async () => {
  const q = fakeQuery({
    counts: { TOTAL_ROWS: "17", IN_WINDOW_ROWS: "2", OUT_OF_WINDOW_ROWS: "15" },
    outOfWindow: [
      {
        DATE_DAY: new Date("2026-08-09T00:00:00Z"),
        ENTITY_KEY: "bic-7plus-bvod-1920x1080--30sec",
        LINE_ITEM_ID: "bicau002bv2",
        DRIFT_KIND: "values_differ",
        FACT_IMPRESSIONS: 191748,
        SOURCE_IMPRESSIONS: 47937,
        IMPRESSIONS_RATIO: 4,
      },
      { DATE_DAY: "2026-08-08", ENTITY_KEY: "x<y>", LINE_ITEM_ID: null, DRIFT_KIND: "missing_in_source" },
    ],
  })
  const checks = await runPacingDigestDataChecks(q)
  assert.ok(checks.cm360Drift.status === "ok")
  assert.equal(checks.cm360Drift.totalRows, 17)
  assert.equal(checks.cm360Drift.outOfWindowRows, 15)
  assert.equal(checks.cm360Drift.outOfWindowSample[0]!.dateDay, "2026-08-09")
  const html = cm360DriftLines(checks.cm360Drift)
  assert.match(html, /17 rows\./)
  assert.match(html, /2 rows are inside the 14-day refresh window/)
  assert.match(html, /15 rows are outside it and will not fix themselves/)
  assert.match(html, /<li>2026-08-09 · bicau002bv2 · bic-7plus-bvod-1920x1080--30sec · values_differ · impressions ratio 4<\/li>/)
  assert.match(html, /<li>2026-08-08 · no line · x&lt;y&gt; · missing_in_source<\/li>/)
  assert.match(html, /Showing the latest 2 of 15 outside the window\./)
})

test("one row each way uses the singular", () => {
  const html = cm360DriftLines({ status: "ok", totalRows: 1, inWindowRows: 1, outOfWindowRows: 0, outOfWindowSample: [] })
  assert.match(html, /1 row\./)
  assert.match(html, /1 row is inside/)
})

test("duplicate active label map keys are listed with their row counts", async () => {
  const q = fakeQuery({
    duplicates: [
      { CHANNEL_KEY: "ad serving - cm360", PLATFORM_KEY: "bic-7plus-bvod-1920x1080--30sec", ACTIVE_ROWS: 4 },
      { CHANNEL_KEY: "social - meta", PLATFORM_KEY: "1202", ACTIVE_ROWS: 2 },
    ],
  })
  const checks = await runPacingDigestDataChecks(q)
  assert.deepEqual(checks.labelMapDuplicates.status === "ok" && checks.labelMapDuplicates.duplicateKeys, 2)
  const html = labelMapDuplicateLines(checks.labelMapDuplicates)
  assert.match(html, /2 keys have more than one active LINE_ITEM_LABEL_MAP row/)
  assert.match(html, /<li>ad serving - cm360 · bic-7plus-bvod-1920x1080--30sec · 4 active rows<\/li>/)
  assert.match(html, /C-180/)
})

test("switch off: no checks run and the email has no Data checks section", async () => {
  const q = fakeQuery({})
  assert.equal(await loadPacingDigestDataChecks({ isOn: async () => false, query: q }), null)
  assert.deepEqual(q.calls, [])
  assert.equal(
    await quiet(() =>
      loadPacingDigestDataChecks({
        isOn: async () => {
          throw new Error("feature_switches unreadable")
        },
        query: q,
      }),
    ),
    null,
  )
  assert.doesNotMatch(buildPacingDigestEmailHtml(payloadWith()), /Data checks/)
})

// --- the builder: the digest still builds when the checks blow up ----------

let checksImpl: () => Promise<PacingDigestDataChecks | null> = async () => null
let unmatchedImpl: () => Promise<unknown> = async () => null
let dataQualityImpl: () => Promise<unknown> = async () => null

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/campaigns/pacingRowsCache", {
    namedExports: {
      pacingScopeKey: () => "all",
      getCachedSearchPacingRows: async () => [],
      getCachedSocialPacingRows: async () => [],
      getCachedProgrammaticPacingRows: async () => [],
      getCachedAdServingPacingRows: async () => [],
      getCachedDirectPacingRows: async () => [],
    },
  })
  await mock.module!("@/lib/pacing/portfolio/portfolioSnapshotStore", {
    namedExports: { readPortfolioSnapshot: async () => null },
  })
  await mock.module!("@/lib/pacing/relabel/listRelabelDrift", {
    namedExports: { listRelabelDrift: async () => [] },
  })
  await mock.module!("@/lib/pacing/relabel/repo", {
    namedExports: { listRelabelLogForDay: async () => [] },
  })
  await mock.module!("@/lib/ops/digest/loadDataChecks", {
    namedExports: { loadDigestDataChecks: () => checksImpl(), loadDigestUnmatched: () => unmatchedImpl(), loadDigestDataQuality: () => dataQualityImpl() },
  })
}

const skip = mockModuleSkip()
const NOW = new Date("2026-11-12T20:00:00Z")

test("builder: the checks' payload is attached when on", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  const checks: PacingDigestDataChecks = {
    cm360Drift: { status: "unavailable", reason: "missing_view", message: "x" },
    labelMapDuplicates: { status: "ok", duplicateKeys: 0, sample: [] },
  }
  checksImpl = async () => checks
  const payload = await buildPacingDigest(NOW)
  assert.deepEqual(payload.dataChecks, checks)
  checksImpl = async () => null
  assert.equal("dataChecks" in (await buildPacingDigest(NOW)), false)
})

test("builder: a throw from the checks still returns a digest, with no section", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  checksImpl = async () => {
    throw new Error("boom")
  }
  const err = console.error
  console.error = () => {}
  try {
    const payload = await buildPacingDigest(NOW)
    assert.equal(payload.dataChecks, undefined)
    assert.equal(payload.asOfDate, "2026-11-13")
  } finally {
    console.error = err
  }
})

test("S5 builder: the unmatched count is attached when on, absent when off, and a throw still sends the digest", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  const unmatched = { status: "ok", windowDays: 30, entities: 1, spend: 5, noteDue: 0, href: "" }
  unmatchedImpl = async () => unmatched
  assert.deepEqual((await buildPacingDigest(NOW)).unmatched, unmatched)
  unmatchedImpl = async () => null
  assert.equal("unmatched" in (await buildPacingDigest(NOW)), false)
  unmatchedImpl = async () => {
    throw new Error("boom")
  }
  const err = console.error
  console.error = () => {}
  try {
    const payload = await buildPacingDigest(NOW)
    assert.equal(payload.unmatched, undefined)
    assert.equal(payload.asOfDate, "2026-11-13")
  } finally {
    console.error = err
    unmatchedImpl = async () => null
  }
})

test("S17 builder: the Data quality section is attached when on; off or a throw leaves the payload and email as before", { skip }, async () => {
  const { buildPacingDigest } = await import("../buildPacingDigest.js")
  const { buildPacingDigestEmailHtml } = await import("../email.js")
  // The data_checks stage log line: no dataQuality key when off.
  const stageLog = async () => {
    const log = console.log
    const lines: string[] = []
    console.log = (line: unknown) => void lines.push(String(line))
    try {
      const built = await buildPacingDigest(NOW)
      const stage = lines.map((l) => { try { return JSON.parse(l) } catch { return null } })
        .find((l) => l?.event === "pacing_digest_stage" && l.stage === "data_checks")
      return { built, stage }
    } finally {
      console.log = log
    }
  }
  const { built: off, stage: offStage } = await stageLog()
  assert.equal("dataQuality" in off, false)
  assert.ok(offStage)
  assert.equal("dataQuality" in offStage, false)
  const dataQuality = { status: "ok", open: 1, overdue: 0, overdueAfterDays: 3, owners: [], href: "" }
  dataQualityImpl = async () => dataQuality
  const { built: on, stage: onStage } = await stageLog()
  assert.equal(onStage.dataQuality, "ok")
  assert.deepEqual(on.dataQuality, dataQuality)
  assert.equal(
    buildPacingDigestEmailHtml({ ...on, builtAt: off.builtAt, dataQuality: undefined }),
    buildPacingDigestEmailHtml(off),
  )
  dataQualityImpl = async () => {
    throw new Error("boom")
  }
  const err = console.error
  console.error = () => {}
  try {
    assert.equal("dataQuality" in (await buildPacingDigest(NOW)), false)
  } finally {
    console.error = err
    dataQualityImpl = async () => null
  }
})
