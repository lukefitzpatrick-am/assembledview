/**
 * GET /api/dashboard/[slug]/[mba_number]/creative
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const loadMock = mock.fn(async (_input?: unknown) => [] as unknown[])

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/creative/performance/getCreativePerformance", {
    namedExports: {
      getCreativePerformance: loadMock,
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function clientUser(slugs: string[]) {
  return {
    sub: "client-other",
    email: "client-other@example.com",
    [ROLE_CLAIM]: ["client"],
    app_metadata: {
      role: "client",
      client_slug: slugs[0] ?? "",
      client_slugs: slugs,
    },
  }
}

function adminUser() {
  return {
    sub: "admin-creative",
    email: "admin-creative@example.com",
    [ROLE_CLAIM]: ["admin"],
    app_metadata: { role: "admin" },
  }
}

function enableFlag() {
  process.env.FEATURE_CREATIVE_PERFORMANCE = "1"
}

function disableFlag() {
  delete process.env.FEATURE_CREATIVE_PERFORMANCE
}

async function getCreative(slug: string, mba: string) {
  const { GET } = await import("../route.js")
  return GET(
    new NextRequest(
      `http://localhost/api/dashboard/${slug}/${mba}/creative?from=2026-09-01&to=2026-09-30&sort=ctr`,
    ),
    { params: Promise.resolve({ slug, mba_number: mba }) },
  )
}

test("GET creative — flag off is 404 for an admin", { skip }, async () => {
  disableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: adminUser() }))
  loadMock.mock.resetCalls()

  const res = await getCreative("golf-australia", "GOLF025")
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "not found")
  assert.equal(loadMock.mock.calls.length, 0)
})

test("GET creative — a client of another client gets 404", { skip }, async () => {
  enableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({
    user: clientUser(["hema-maps"]),
  }))
  loadMock.mock.resetCalls()

  const res = await getCreative("golf-australia", "GOLF025")
  assert.equal(res.status, 404)
  const body = await res.json()
  assert.equal(body.error, "not found")
  assert.equal(loadMock.mock.calls.length, 0)
  disableFlag()
})

test("GET creative — a missing view is 503 and a warning", { skip }, async () => {
  enableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: adminUser() }))
  loadMock.mock.resetCalls()
  loadMock.mock.mockImplementation(async () => {
    throw new Error(
      "SQL compilation error: Object 'ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY' does not exist or not authorized.",
    )
  })

  const warnings: unknown[][] = []
  const errors: unknown[][] = []
  const origWarn = console.warn
  const origError = console.error
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  try {
    const res = await getCreative("golf-australia", "GOLF025")
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.deepEqual(body, { error: "Creative data not set up yet" })
    assert.equal(warnings.length, 1)
    assert.equal(errors.length, 0)
    assert.match(String(warnings[0]?.[0]), /view not available/)
  } finally {
    console.warn = origWarn
    console.error = origError
    disableFlag()
  }
})
