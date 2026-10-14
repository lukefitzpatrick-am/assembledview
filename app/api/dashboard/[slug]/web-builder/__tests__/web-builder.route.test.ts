/**
 * POST /api/dashboard/[slug]/web-builder
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const migrationMock = mock.fn(async () => false)
const resolveMock = mock.fn(async (_slug?: string) => null as null | { clientId: number; clientName: string })
const saveMock = mock.fn(async (_input?: unknown) => ({ version: 1 }))
const restoreMock = mock.fn(async (_input?: unknown) => null as null | { version: number; layout: unknown[] })
const previewMock = mock.fn(async (_input?: unknown) => null)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/webReport/builder/repo", {
    namedExports: {
      BuilderMigrationError: class BuilderMigrationError extends Error {},
      loadBuilderPreview: previewMock,
      migration0098Applied: migrationMock,
      resolveBuilderClient: resolveMock,
      restorePublishedVersion: restoreMock,
      savePublishedReport: saveMock,
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function user(role: "admin" | "client") {
  return {
    sub: role,
    email: `${role}@example.com`,
    [ROLE_CLAIM]: [role],
    app_metadata: { role },
  }
}

const validSave = {
  action: "save",
  layout: [{ elementId: "notes", settings: { text: "Note" } }],
  ga4PropertyRef: "123",
  gscSiteRef: "https://example.com/",
  brandTerms: ["Example"],
  defaultPeriod: "last_month",
}

async function post(body: unknown) {
  const { POST } = await import("../route.js")
  return POST(
    new NextRequest("http://localhost/api/dashboard/golf-australia/web-builder", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ slug: "golf-australia" }) },
  )
}

test("POST web-builder — a client is 404 and nothing is saved", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("client") }))
  saveMock.mock.resetCalls()
  const res = await post(validSave)
  assert.equal(res.status, 404)
  assert.equal(saveMock.mock.calls.length, 0)
})

test("POST web-builder — save is refused before migration 0098", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  migrationMock.mock.mockImplementation(async () => false)
  saveMock.mock.resetCalls()
  const res = await post(validSave)
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error, "Builder needs migration 0098")
  assert.equal(saveMock.mock.calls.length, 0)
})

test("POST web-builder — save creates a version", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  migrationMock.mock.mockImplementation(async () => true)
  saveMock.mock.resetCalls()
  saveMock.mock.mockImplementation(async () => ({ version: 3 }))
  const res = await post(validSave)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.version, 3)
  assert.equal(body.message, "Saved for Golf Australia · version 3")
  assert.equal(saveMock.mock.calls.length, 1)
  const saved = saveMock.mock.calls[0]?.arguments[0] as { layout: { elementId: string }[]; defaultPeriod: string }
  assert.equal(saved.layout[0]?.elementId, "notes")
  assert.equal(saved.defaultPeriod, "last_month")
})

test("POST web-builder — restore returns that version", { skip }, async () => {
  getSessionMock.mock.mockImplementation(async () => ({ user: user("admin") }))
  resolveMock.mock.mockImplementation(async () => ({ clientId: 7, clientName: "Golf Australia" }))
  migrationMock.mock.mockImplementation(async () => true)
  restoreMock.mock.resetCalls()
  restoreMock.mock.mockImplementation(async () => ({
    version: 2,
    layout: [{ elementId: "queries", settings: { mode: "all", topN: 15 } }],
  }))
  const res = await post({ action: "restore", version: 2 })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.version, 2)
  assert.equal(body.layout[0].elementId, "queries")
  assert.equal(restoreMock.mock.calls.length, 1)
})
