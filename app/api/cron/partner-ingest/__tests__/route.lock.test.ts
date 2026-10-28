/**
 * Partner ingest cron route: a run that finds the lock held returns 409 and
 * loads nothing (DATA-7). Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const jobMock = mock.fn(async (): Promise<Record<string, unknown>> => ({ failed: 0 }))
const logMock = mock.fn((_line: string) => {})

if (typeof mock.module === "function") {
  await mock.module("@/lib/partner-ingest/runPartnerIngestJob", {
    namedExports: { runPartnerIngestJob: jobMock },
  })
  await mock.module("@/lib/log", {
    namedExports: { logJob: logMock },
  })
}

const SECRET = "test-cron-secret"

function request(): Request {
  return new Request("http://localhost/api/cron/partner-ingest", {
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

function configure() {
  process.env.CRON_SECRET = SECRET
  process.env.PARTNER_INGEST_TENANT_ID = "t"
  process.env.PARTNER_INGEST_CLIENT_ID = "c"
  process.env.PARTNER_INGEST_CLIENT_SECRET = "s"
  jobMock.mock.resetCalls()
  logMock.mock.resetCalls()
}

test("route: lock held returns 409 already_running", { skip }, async () => {
  configure()
  jobMock.mock.mockImplementation(async () => ({ filesSeen: 0, loaded: 0, failed: 0, alreadyRunning: true }))
  const { GET } = await import("../route")
  const res = await GET(request())
  assert.equal(res.status, 409)
  const body = (await res.json()) as { status: string; wrote: boolean }
  assert.equal(body.status, "already_running")
  assert.equal(body.wrote, false)
  assert.equal(jobMock.mock.callCount(), 1)
  assert.match(String(logMock.mock.calls[0]?.arguments[0]), /partner_ingest_already_running/)
})

test("route: a normal run still returns the summary with 200", { skip }, async () => {
  configure()
  jobMock.mock.mockImplementation(async () => ({ filesSeen: 1, loaded: 1, failed: 0 }))
  const { GET } = await import("../route")
  const res = await GET(request())
  assert.equal(res.status, 200)
  const body = (await res.json()) as { loaded: number; alreadyRunning?: boolean }
  assert.equal(body.loaded, 1)
  assert.equal(body.alreadyRunning, undefined)
})

test("route: a lock error (database down) is a 500 and nothing else runs", { skip }, async () => {
  configure()
  jobMock.mock.mockImplementation(async () => {
    throw new Error("connect ECONNREFUSED")
  })
  const { GET } = await import("../route")
  const res = await GET(request())
  assert.equal(res.status, 500)
  const body = (await res.json()) as { status: string; message: string }
  assert.equal(body.status, "error")
  assert.match(body.message, /ECONNREFUSED/)
})
