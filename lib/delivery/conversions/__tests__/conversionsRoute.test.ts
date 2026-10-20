import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

let access: { ok: true; isClient: boolean } = { ok: true, isClient: true }
let config: unknown = null
const queryMock = mock.fn(async (_args?: unknown) => [
  { lineItemId: "curatif004sm1", date: "2026-10-05", platform: "meta_ads", eventKey: "purchase", conversions: 4, conversionValue: 400 },
  { lineItemId: "curatif004sm1", date: "2026-10-05", platform: "meta_ads", eventKey: "omni_purchase", conversions: 4, conversionValue: 400 },
])

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: async () => access },
  })
  await mock.module!("@/lib/clients/conversionSettingsRepo", {
    namedExports: { readConversionConfigForMba: async () => config },
  })
  await mock.module!("@/lib/snowflake/conversions", {
    namedExports: { queryConversionRows: queryMock },
  })
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/pacing/conversions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const ON = {
  clientId: 1,
  settings: { enabled: true, headline: "purchases", showRevenue: true },
  events: [{ platform: "meta_ads", eventKey: "purchase", label: null, category: "purchase", includeValue: true }],
}

test("client user asking for a line outside the MBA gets 403", { skip }, async () => {
  access = { ok: true, isClient: true }
  config = ON
  const { POST } = await import("@/app/api/pacing/conversions/route")
  const res = await POST(req({ mbaNumber: "curatif004", lineItemIds: ["curatif004sm1", "hema007sm1"] }))
  assert.equal(res.status, 403)
})

test("switch off returns enabled false and does not query Snowflake", { skip }, async () => {
  access = { ok: true, isClient: false }
  config = { ...ON, settings: { ...ON.settings, enabled: false } }
  queryMock.mock.resetCalls()
  const { POST } = await import("@/app/api/pacing/conversions/route")
  const res = await POST(req({ mbaNumber: "curatif004", lineItemIds: ["curatif004sm1"] }))
  assert.deepEqual(await res.json(), { ok: true, enabled: false })
  assert.equal(queryMock.mock.callCount(), 0)
})

test("switch on returns chosen events only, to yesterday at the latest", { skip }, async () => {
  access = { ok: true, isClient: true }
  config = ON
  queryMock.mock.resetCalls()
  const { POST } = await import("@/app/api/pacing/conversions/route")
  const res = await POST(
    req({ mbaNumber: "curatif004", lineItemIds: ["curatif004sm1"], startDate: "2026-10-01", endDate: "2099-12-31" }),
  )
  const body = (await res.json()) as {
    headline: string
    trackedPlatforms: string[]
    valuePlatforms: string[]
    throughDate: string
    lines: Array<{ lineItemId: string; daily: Array<{ purchases: number; revenue: number }> }>
  }
  assert.equal(body.headline, "purchases")
  assert.deepEqual(body.trackedPlatforms, ["meta_ads"])
  assert.deepEqual(body.valuePlatforms, ["meta_ads"])
  assert.ok(body.throughDate < "2099-12-31")
  assert.equal(body.lines[0]!.daily[0]!.purchases, 4)
  assert.equal(body.lines[0]!.daily[0]!.revenue, 400)
  const arg = queryMock.mock.calls[0]!.arguments[0] as { endDate: string }
  assert.equal(arg.endDate, body.throughDate)
})
