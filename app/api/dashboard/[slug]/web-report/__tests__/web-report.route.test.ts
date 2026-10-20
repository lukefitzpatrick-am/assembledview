/**
 * GET /api/dashboard/[slug]/web-report
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getSessionMock = mock.fn(async (_req?: unknown) => null as null | { user: Record<string, unknown> })
const loadMock = mock.fn(async (_input?: unknown) => null as unknown)
const publishedMock = mock.fn(async (_slug?: string) => true)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth0", {
    namedExports: {
      auth0: { getSession: getSessionMock },
    },
  })
  await mock.module!("@/lib/webReport/visibility", {
    namedExports: { isWebReportPublished: publishedMock },
  })
  await mock.module!("@/lib/webReport/loadPage", {
    namedExports: {
      loadWebReportResponse: loadMock,
      WebReportRangeError: class WebReportRangeError extends Error {},
    },
  })
}

const ROLE_CLAIM = "https://assembledview.com/roles"

function clientUser(slugs: string[]) {
  return {
    sub: "client-web",
    email: "client-web@example.com",
    [ROLE_CLAIM]: ["client"],
    app_metadata: {
      role: "client",
      client_slug: slugs[0] ?? "",
      client_slugs: slugs,
    },
  }
}

function enableFlag() {
  process.env.FEATURE_WEB_SEARCH = "1"
}

function disableFlag() {
  delete process.env.FEATURE_WEB_SEARCH
}

async function getReport(slug: string, query = "") {
  const { GET } = await import("../route.js")
  return GET(new NextRequest(`http://localhost/api/dashboard/${slug}/web-report${query}`), {
    params: Promise.resolve({ slug }),
  })
}

test("GET web-report — another client is 404 and the loader is not called", { skip }, async () => {
  enableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["other-client"]) }))
  loadMock.mock.resetCalls()

  const res = await getReport("golf-australia")
  assert.equal(res.status, 404)
  assert.equal(loadMock.mock.calls.length, 0)
  disableFlag()
})

test("GET web-report — flag off is 404 for the client's own slug", { skip }, async () => {
  disableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["golf-australia"]) }))
  loadMock.mock.resetCalls()

  const res = await getReport("golf-australia")
  assert.equal(res.status, 404)
  assert.equal(loadMock.mock.calls.length, 0)
})

test("GET web-report — the client's own slug loads the report", { skip }, async () => {
  enableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["golf-australia"]) }))
  loadMock.mock.resetCalls()
  loadMock.mock.mockImplementation(async () => ({ clientName: "Golf Australia", connected: true }))

  const res = await getReport("golf-australia", "?from=2026-09-01&to=2026-09-30")
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.clientName, "Golf Australia")
  assert.equal(loadMock.mock.calls.length, 1)
  disableFlag()
})

test("GET web-report — a client's own unpublished report is 404", { skip }, async () => {
  enableFlag()
  getSessionMock.mock.resetCalls()
  getSessionMock.mock.mockImplementation(async () => ({ user: clientUser(["golf-australia"]) }))
  publishedMock.mock.mockImplementation(async () => false)
  loadMock.mock.resetCalls()

  const res = await getReport("golf-australia")
  assert.equal(res.status, 404)
  assert.equal(loadMock.mock.calls.length, 0)
  publishedMock.mock.mockImplementation(async () => true)
  disableFlag()
})
