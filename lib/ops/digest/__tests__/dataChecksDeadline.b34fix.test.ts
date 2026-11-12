/**
 * B34fix: one overall deadline (45 s) around the pacing digest data checks, so
 * a slow switch read or Snowflake query can never stall the digest.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL } from "../../../pacing/relabel/labelMapActive.js"
import {
  CM360_DRIFT_COUNTS_SQL,
  CM360_DRIFT_OUT_OF_WINDOW_SQL,
  DATA_CHECKS_DEADLINE_MS,
  loadPacingDigestDataChecks,
  runPacingDigestDataChecks,
  type DataCheckQuery,
} from "../dataChecks.js"
import { cm360DriftLines, labelMapDuplicateLines } from "../email.js"

/** Far longer than any deadline used here; resolves so nothing is left pending. */
const SLOW_MS = 3_000
/** Test deadline. */
const DEADLINE_MS = 60
/** The run must end well before SLOW_MS. */
const FINISHED_BY_MS = 1_500

function slow<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SLOW_MS))
}

type Speeds = { counts?: "fast" | "slow"; outOfWindow?: "fast" | "slow"; duplicates?: "fast" | "slow" }

function query(speeds: Speeds, outOfWindowRows = 0): DataCheckQuery {
  return async (sqlText: string) => {
    if (sqlText === CM360_DRIFT_COUNTS_SQL) {
      const rows = [{ TOTAL_ROWS: outOfWindowRows, IN_WINDOW_ROWS: 0, OUT_OF_WINDOW_ROWS: outOfWindowRows }]
      return speeds.counts === "slow" ? slow(rows) : rows
    }
    if (sqlText === CM360_DRIFT_OUT_OF_WINDOW_SQL) {
      const rows = [{ DATE_DAY: "2026-08-09", ENTITY_KEY: "k", LINE_ITEM_ID: "l", DRIFT_KIND: "values_differ" }]
      return speeds.outOfWindow === "slow" ? slow(rows) : rows
    }
    if (sqlText === LABEL_MAP_DUPLICATE_ACTIVE_KEYS_SQL) {
      return speeds.duplicates === "slow" ? slow([]) : []
    }
    throw new Error(`unexpected SQL ${sqlText}`)
  }
}

async function quiet<T>(fn: () => Promise<T>): Promise<{ out: T; ms: number; warnings: string[] }> {
  const warn = console.warn
  const warnings: string[] = []
  console.warn = (...a: unknown[]) => void warnings.push(a.map(String).join(" "))
  const started = Date.now()
  try {
    const out = await fn()
    return { out, ms: Date.now() - started, warnings }
  } finally {
    console.warn = warn
  }
}

test("the overall deadline is 45 seconds and is the default", () => {
  assert.equal(DATA_CHECKS_DEADLINE_MS, 45_000)
  assert.equal(runPacingDigestDataChecks.length, 1, "deadlineMs is optional (defaults to DATA_CHECKS_DEADLINE_MS)")
})

test("fast checks are not touched by the deadline and the timer is cleared", async () => {
  // Runs before any slow timer exists, so the open Timeout count is stable.
  const timeouts = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length
  const before = timeouts()
  const out = await runPacingDigestDataChecks(query({}))
  assert.equal(out.cm360Drift.status, "ok")
  assert.equal(out.labelMapDuplicates.status, "ok")
  const loaded = await loadPacingDigestDataChecks({ isOn: async () => true, query: query({}) })
  assert.equal(loaded?.cm360Drift.status, "ok")
  assert.equal(await loadPacingDigestDataChecks({ isOn: async () => false, query: query({}) }), null)
  assert.equal(timeouts(), before, "no 45 s deadline timer is left running")
})

test("a drift query past the deadline is 'check not available' and the other check keeps its result", async () => {
  const { out, ms, warnings } = await quiet(() => runPacingDigestDataChecks(query({ counts: "slow" }), DEADLINE_MS))
  assert.ok(ms < FINISHED_BY_MS, `returned after ${ms} ms`)
  assert.equal(out.cm360Drift.status, "unavailable")
  assert.equal(out.cm360Drift.status === "unavailable" && out.cm360Drift.reason, "deadline")
  assert.deepEqual(out.labelMapDuplicates, { status: "ok", duplicateKeys: 0, sample: [] })
  assert.match(cm360DriftLines(out.cm360Drift), /check not available \(the checks ran out of time; see the cron log\)/)
  assert.ok(warnings.some((w) => w.includes("CM360 drift check still running")))
})

test("the deadline covers the drift check's second (sample) read too", async () => {
  const { out, ms } = await quiet(() =>
    runPacingDigestDataChecks(query({ outOfWindow: "slow" }, 15), DEADLINE_MS),
  )
  assert.ok(ms < FINISHED_BY_MS, `returned after ${ms} ms`)
  assert.equal(out.cm360Drift.status === "unavailable" && out.cm360Drift.reason, "deadline")
})

test("both checks past the deadline: both 'check not available', one deadline for both", async () => {
  const { out, ms } = await quiet(() =>
    runPacingDigestDataChecks(query({ counts: "slow", duplicates: "slow" }), DEADLINE_MS),
  )
  assert.ok(ms < FINISHED_BY_MS, `returned after ${ms} ms`)
  assert.equal(out.cm360Drift.status === "unavailable" && out.cm360Drift.reason, "deadline")
  assert.equal(out.labelMapDuplicates.status === "unavailable" && out.labelMapDuplicates.reason, "deadline")
  assert.match(labelMapDuplicateLines(out.labelMapDuplicates), /check not available \(the checks ran out of time/)
})

test("loader: the switch read and the checks share one deadline", async () => {
  // A switch read that uses 400 of 500 ms leaves the checks 100 ms, not a fresh 500.
  const { out, ms } = await quiet(() =>
    loadPacingDigestDataChecks({
      isOn: () => new Promise((resolve) => setTimeout(() => resolve(true), 400)),
      query: query({ counts: "slow", duplicates: "slow" }),
      deadlineMs: 500,
    }),
  )
  assert.ok(ms >= 490 && ms < 700, `returned after ${ms} ms (one 500 ms deadline)`)
  assert.ok(out)
  assert.equal(out.cm360Drift.status === "unavailable" && out.cm360Drift.reason, "deadline")
  assert.equal(out.labelMapDuplicates.status === "unavailable" && out.labelMapDuplicates.reason, "deadline")
})

test("loader: a switch read still running at the deadline counts as off (no section, no reads)", async () => {
  let reads = 0
  const { out, ms, warnings } = await quiet(() =>
    loadPacingDigestDataChecks({
      isOn: () => slow(true),
      query: async () => {
        reads++
        return []
      },
      deadlineMs: DEADLINE_MS,
    }),
  )
  assert.ok(ms < FINISHED_BY_MS, `returned after ${ms} ms`)
  assert.equal(out, null)
  assert.equal(reads, 0)
  assert.ok(warnings.some((w) => w.includes("treating as off")))
})
