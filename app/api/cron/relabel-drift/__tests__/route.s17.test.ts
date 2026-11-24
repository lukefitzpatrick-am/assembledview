/**
 * S17: the relabel-drift cron runs the Data quality sweep after the drift
 * check. Its own answer is unchanged: the switch off, a sweep that throws, and
 * a failed drift check (the sweep gets null, so relabel items stay) all
 * answer as before. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const SNAPSHOT = {
  asOfDate: "2026-11-24",
  legacyCount: 1,
  driftCount: 1,
  findings: [{ kind: "drift", code: "drift", message: "drift: relabel #4", mbaNumber: "OK0001", relabelId: 4, relabelLineItemId: "ok0001-1" }],
  durationMs: 12,
  generatedAt: "2026-11-23T20:15:00.000Z",
}
const SUMMARY = {
  status: "ok",
  asOfDate: "2026-11-24",
  legacyCount: 1,
  driftCount: 1,
  findingCount: 1,
  durationMs: 12,
  generatedAt: "2026-11-23T20:15:00.000Z",
}

let driftImpl: () => Promise<unknown> = async () => SNAPSHOT
let sweepImpl: (drift: unknown) => Promise<unknown> = async () => null
const sweepMock = mock.fn((drift: unknown) => sweepImpl(drift))
const jobs: string[] = []

if (supportsMockModule()) {
  await mock.module!("@/lib/pacing/relabel/listRelabelDrift", {
    namedExports: { runRelabelDriftCheck: () => driftImpl() },
  })
  await mock.module!("@/lib/dataQuality/sources.server", {
    namedExports: { runDataQualitySweep: sweepMock },
  })
  await mock.module!("@/lib/log", {
    namedExports: { logJob: (line: string) => void jobs.push(line) },
  })
}

const authed = () => new Request("http://localhost/api/cron/relabel-drift", { headers: { authorization: "Bearer s17-secret" } })

async function call(req = authed()) {
  process.env.CRON_SECRET = "s17-secret"
  sweepMock.mock.resetCalls()
  jobs.length = 0
  const errors: unknown[][] = []
  const error = console.error
  console.error = (...args: unknown[]) => void errors.push(args)
  try {
    const { GET } = await import("../route.js")
    const res = await GET(req)
    return { status: res.status, body: await res.json(), errors }
  } finally {
    console.error = error
  }
}

const events = () => jobs.map((j) => JSON.parse(j).event)

test("no secret: 401, and neither the check nor the sweep runs", { skip }, async () => {
  const out = await call(new Request("http://localhost/api/cron/relabel-drift"))
  assert.equal(out.status, 401)
  assert.equal(sweepMock.mock.calls.length, 0)
})

test("switch off (the sweep answers null): the summary as before, no sweep log", { skip }, async () => {
  sweepImpl = async () => null
  const out = await call()
  assert.equal(out.status, 200)
  assert.deepEqual(out.body, SUMMARY)
  assert.deepEqual(sweepMock.mock.calls[0]!.arguments, [SNAPSHOT.findings])
  assert.deepEqual(events(), ["relabel_drift_check"])
})

test("on: the sweep result is logged and the answer is unchanged", { skip }, async () => {
  sweepImpl = async () => ({ publish: { written: 2, dismissed: 0, resolved: 1 }, relabelDrift: null })
  const out = await call()
  assert.deepEqual(out.body, SUMMARY)
  assert.deepEqual(events(), ["data_quality_sweep", "relabel_drift_check"])
})

test("a sweep that throws is logged; the cron still answers its summary", { skip }, async () => {
  sweepImpl = async () => {
    throw new Error("sweep boom")
  }
  const out = await call()
  assert.equal(out.status, 200)
  assert.deepEqual(out.body, SUMMARY)
  assert.ok(out.errors.some((e) => String(e[0]).includes("data quality sweep failed")))
  assert.deepEqual(events(), ["relabel_drift_check"])
})

test("a failed drift check: the sweep gets null (relabel items stay) and the 500 body is as before", { skip }, async () => {
  driftImpl = async () => {
    throw new Error("snowflake down")
  }
  sweepImpl = async () => null
  try {
    const out = await call()
    assert.equal(out.status, 500)
    assert.deepEqual(out.body, { status: "error", message: "snowflake down" })
    assert.deepEqual(sweepMock.mock.calls[0]!.arguments, [null])
  } finally {
    driftImpl = async () => SNAPSHOT
  }
})
