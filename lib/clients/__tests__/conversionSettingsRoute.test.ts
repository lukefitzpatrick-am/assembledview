import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

let roleResult: unknown = { session: { user: { email: "admin@example.com" } } }
const requireRoleMock = mock.fn(async () => roleResult)
const saveMock = mock.fn(async (input: Record<string, unknown>) => ({
  clientId: input.clientId,
  settings: input.settings,
  events: input.events,
}))
const readMock = mock.fn(async (clientId: number) => ({
  clientId,
  settings: { enabled: false, headline: "conversions", showRevenue: false },
  events: [],
}))

class NotReady extends Error {
  readonly code = "CONVERSION_SETTINGS_NOT_READY"
}

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", { namedExports: { requireRole: requireRoleMock } })
  await mock.module!("@/lib/clients/fetchClientById", {
    namedExports: { fetchClientById: async (id: number) => (Number(id) === 7 ? { id: 7 } : null) },
  })
  await mock.module!("@/lib/clients/conversionSettingsRepo", {
    namedExports: {
      ConversionSettingsNotReadyError: NotReady,
      readClientConversionConfig: readMock,
      saveClientConversionConfig: saveMock,
    },
  })
}

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/clients/7/conversion-settings", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  })
}
const params = (id = "7") => ({ params: Promise.resolve({ id }) })

test("401 when signed out", { skip }, async () => {
  roleResult = { response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) }
  const { GET } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await GET(req("GET"), params())
  assert.equal(res.status, 401)
})

test("403 for a non-admin", { skip }, async () => {
  roleResult = { response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) }
  const { PUT } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await PUT(req("PUT", { enabled: true }), params())
  assert.equal(res.status, 403)
  assert.equal(saveMock.mock.callCount(), 0)
})

test("PUT round trip saves the parsed settings and events", { skip }, async () => {
  roleResult = { session: { user: { email: "admin@example.com" } } }
  saveMock.mock.resetCalls()
  const { PUT } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await PUT(
    req("PUT", {
      enabled: true,
      headline: "purchases",
      showRevenue: true,
      events: [{ platform: "meta_ads", eventKey: "purchase", category: "purchase", includeValue: true }],
    }),
    params(),
  )
  assert.equal(res.status, 200)
  assert.equal(saveMock.mock.callCount(), 1)
  const arg = saveMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(arg.clientId, 7)
  assert.equal(arg.updatedBy, "admin@example.com")
  const body = (await res.json()) as { settings: { headline: string }; events: unknown[] }
  assert.equal(body.settings.headline, "purchases")
  assert.equal(body.events.length, 1)
})

test("duplicate keys are a 400 and nothing is saved", { skip }, async () => {
  roleResult = { session: { user: { email: "admin@example.com" } } }
  saveMock.mock.resetCalls()
  const { PUT } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await PUT(
    req("PUT", {
      enabled: true,
      headline: "purchases",
      showRevenue: false,
      events: [
        { platform: "meta_ads", eventKey: "purchase", category: "purchase" },
        { platform: "meta_ads", eventKey: "omni_purchase", category: "purchase" },
      ],
    }),
    params(),
  )
  assert.equal(res.status, 400)
  assert.equal(saveMock.mock.callCount(), 0)
})

test("unknown client is a 404", { skip }, async () => {
  roleResult = { session: { user: { email: "admin@example.com" } } }
  const { GET } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await GET(req("GET"), params("99"))
  assert.equal(res.status, 404)
})

test("tables not applied yet is a 503", { skip }, async () => {
  roleResult = { session: { user: { email: "admin@example.com" } } }
  readMock.mock.mockImplementationOnce(async () => {
    throw new NotReady("missing")
  })
  const { GET } = await import("@/app/api/clients/[id]/conversion-settings/route")
  const res = await GET(req("GET"), params())
  assert.equal(res.status, 503)
})
