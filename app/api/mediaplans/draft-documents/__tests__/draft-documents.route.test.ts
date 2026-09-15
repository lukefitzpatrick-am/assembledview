/**
 * POST /api/mediaplans/draft-documents — render only, never persist.
 * Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"

const skip = mockModuleSkip()

const requireRoleMock = mock.fn(
  async (_req: unknown, _roles: string[]) =>
    ({
      session: { user: { email: "luke@assembledmedia.com.au" } },
      roles: ["admin"] as const,
      clientSlug: null,
      grantedByAllowlist: false,
    }) as
      | {
          session: { user: { email: string } }
          roles: readonly ["admin"]
          clientSlug: null
          grantedByAllowlist: boolean
        }
      | { response: NextResponse }
)

const checkAccessMock = mock.fn(
  async (_req: unknown, _mba: string) => ({ ok: true as const, isClient: false })
)

const getDbMock = mock.fn(() => {
  throw new Error("draft-documents must not touch the database")
})

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireRole: requireRoleMock,
    },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkAccessMock,
    },
  })
  await mock.module!("@/db", {
    namedExports: {
      getDb: getDbMock,
      schema: {},
    },
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    mbaNumber: "draft001",
    versionNumber: 1,
    mode: "publish",
    campaignName: "Draft Campaign",
    lineItems: [
      {
        lineItemId: "search-1",
        channel: "search",
        mediaType: "search",
        rate: 1,
        enteredAmount: 1000,
        buyType: "cpc",
        bursts: [
          {
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            budget: 1000,
          },
        ],
      },
    ],
    feeLoading: { feesearch: 10 },
    kind: "mba_pdf",
    clientAddress: { name: "Acme" },
    ...overrides,
  }
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/mediaplans/draft-documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function reset() {
  requireRoleMock.mock.resetCalls()
  checkAccessMock.mock.resetCalls()
  getDbMock.mock.resetCalls()
  requireRoleMock.mock.mockImplementation(async () => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  checkAccessMock.mock.mockImplementation(async () => ({
    ok: true as const,
    isClient: false,
  }))
}

test("route source never writes versions, lines, or Blob", () => {
  const src = readFileSync(
    new URL("../route.ts", import.meta.url),
    "utf8"
  )
  assert.equal(src.includes("savePlanVersion"), false)
  assert.equal(src.includes("@vercel/blob"), false)
  assert.equal(src.includes("media_plan_versions"), false)
  assert.equal(src.includes("approved_slice") || src.includes("approvedSlice"), false)
})

test("POST draft-documents — missing role is 403", { skip }, async () => {
  reset()
  requireRoleMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  }))
  const { POST } = await import("../route.js")
  const res = await POST(postRequest(validBody()))
  assert.equal(res.status, 403)
  const json = await res.json()
  assert.equal(json.error, "Forbidden")
  assert.equal(getDbMock.mock.calls.length, 0)
})

test("POST draft-documents — invalid body is 400 with save error shape", { skip }, async () => {
  reset()
  const { POST } = await import("../route.js")
  const res = await POST(postRequest({ kind: "mba_pdf" }))
  assert.equal(res.status, 400)
  const json = await res.json()
  assert.equal(json.error, "Validation failed")
  assert.ok(json.issues)
  assert.equal(getDbMock.mock.calls.length, 0)
})

test("POST draft-documents — valid body is 200 DRAFT file and does not write", { skip }, async () => {
  reset()
  const { POST } = await import("../route.js")
  const res = await POST(postRequest(validBody()))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("X-Document-State"), "draft")
  const disp = res.headers.get("Content-Disposition") ?? ""
  assert.match(disp, /DRAFT-MBA_/)
  assert.match(disp, /not-for-client\.pdf/)
  const buf = Buffer.from(await res.arrayBuffer())
  assert.ok(buf.length > 100)
  assert.ok(buf.toString("latin1").includes("DRAFT - NOT FOR CLIENT"))
  assert.equal(getDbMock.mock.calls.length, 0)
})
