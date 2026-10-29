/**
 * True-up report route: finance admins only, 404 while TRUE_UP is off,
 * months validated, CSV on request. Read only.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const requireFinanceAdminMock = mock.fn(
  async (): Promise<{ roles: string[] } | { response: NextResponse }> => ({ roles: ["admin"] }),
)

const loadMock = mock.fn(async (args: { asOfMonth: string; fromMonth: string }) => ({
  asOfMonth: args.asOfMonth,
  fromMonth: args.fromMonth,
  generatedAt: null,
  xeroSyncedAt: null,
  thresholdCents: 100,
  provisionalInvoices: 0,
  totals: {
    gapByComponent: { fee: 0, adserving: 0, production: 0, media: 0 },
    chargeByComponent: { fee: 0, adserving: 0, production: 0, media: 0 },
    creditByComponent: { fee: 0, adserving: 0, production: 0, media: 0 },
    mbasByStatus: { matches: 0, billed_ahead: 0, gap: 0, no_invoice: 0, ended: 0, schedule_incomplete: 0 },
    mbasNeedingAction: 0,
  },
  rows: [],
  unattributed: [],
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: requireFinanceAdminMock },
  })
  await mock.module("@/lib/finance/trueUp/load", {
    namedExports: { loadTrueUp: loadMock, todaySydneyIso: () => "2026-11-02" },
  })
}

const { GET } = await import("../route")

const req = (qs = "") => new NextRequest(`http://localhost/api/finance/reports/true-up${qs}`)

test("non finance admin is refused before anything loads", { skip }, async () => {
  process.env.TRUE_UP = "on"
  loadMock.mock.resetCalls()
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => ({
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
  const res = await GET(req())
  assert.equal(res.status, 403)
  assert.equal(loadMock.mock.callCount(), 0)
})

test("404 while TRUE_UP is off", { skip }, async () => {
  process.env.TRUE_UP = "off"
  loadMock.mock.resetCalls()
  const res = await GET(req())
  assert.equal(res.status, 404)
  assert.equal(loadMock.mock.callCount(), 0)
})

test("defaults: last month, from the July that starts the financial year", { skip }, async () => {
  process.env.TRUE_UP = "on"
  loadMock.mock.resetCalls()
  const res = await GET(req())
  assert.equal(res.status, 200)
  assert.deepEqual(loadMock.mock.calls[0]!.arguments[0], { asOfMonth: "2026-10", fromMonth: "2026-07" })
})

test("bad months and a reversed range are refused", { skip }, async () => {
  process.env.TRUE_UP = "on"
  assert.equal((await GET(req("?asOf=2026-13"))).status, 400)
  assert.equal((await GET(req("?asOf=2026-08&from=2026-09"))).status, 400)
})

test("CSV download", { skip }, async () => {
  process.env.TRUE_UP = "on"
  const res = await GET(req("?asOf=2026-09&format=csv"))
  assert.equal(res.status, 200)
  assert.match(res.headers.get("content-type") ?? "", /text\/csv/)
  assert.match(res.headers.get("content-disposition") ?? "", /true-up-2026-09\.csv/)
  const body = await res.text()
  assert.match(body, /^row,client,mba,version,month/)
})
