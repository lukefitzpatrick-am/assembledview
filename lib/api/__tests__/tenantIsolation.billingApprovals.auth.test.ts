/**
 * Tenant isolation for:
 *   GET  /api/billing-overrides
 *   POST /api/billing-overrides/replace_line
 *   POST /api/billing-overrides/reset_line
 *   POST /api/billing-overrides/refetch-anomaly
 *   POST /api/billing-overrides/working-dedupe-anomaly
 *   GET  /api/mba-line-approvals
 *   PATCH /api/mba-line-approvals
 *
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const getCurrentUserMock = mock.fn(async (_req?: unknown) => ({
  id: 1,
  name: "client@example.com",
  email: "client@example.com",
}))
const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: Response }
)
const resolveMbaNumberForVersionIdMock = mock.fn(
  async (_versionId: string | number) => null as string | null
)
const readBillingOverridesForVersionMock = mock.fn(async (_versionId: string | number) => [
  { id: 1, line_item_id: "BICAU002SE1", media_plan_version: 42 },
])
const replaceBillingOverrideLineMock = mock.fn(async () => ({ replaced: 1 }))
const resetBillingOverrideLineMock = mock.fn(async () => ({ deleted: 1 }))
const readMbaLineApprovalsMock = mock.fn(async () => ({
  ok: true as const,
  available: true,
  lines: [{ line_item_id: "BICAU002SE1", media_type: "search", approved: true }],
}))
const writeMbaLineApprovalsMock = mock.fn(async () => ({
  ok: true as const,
  data: { updated: 1 },
}))
const dbExecuteMock = mock.fn(async () => undefined)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/getCurrentUser", {
    namedExports: {
      getCurrentUser: getCurrentUserMock,
    },
  })
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
    },
  })
  await mock.module!("@/lib/data/resolveMbaNumberForVersionId", {
    namedExports: {
      resolveMbaNumberForVersionId: resolveMbaNumberForVersionIdMock,
    },
  })
  await mock.module!("@/lib/data/readFinance", {
    namedExports: {
      readBillingOverridesForVersion: readBillingOverridesForVersionMock,
    },
  })
  await mock.module!("@/lib/data/writeBillingOverrides", {
    namedExports: {
      BillingOverrideWriteError: class BillingOverrideWriteError extends Error {
        constructor(
          public readonly code: string,
          message: string
        ) {
          super(message)
          this.name = "BillingOverrideWriteError"
        }
      },
      replaceBillingOverrideLine: replaceBillingOverrideLineMock,
      resetBillingOverrideLine: resetBillingOverrideLineMock,
    },
  })
  await mock.module!("@/lib/data/readApprovals", {
    namedExports: {
      readMbaLineApprovals: readMbaLineApprovalsMock,
    },
  })
  await mock.module!("@/lib/data/writeApprovals", {
    namedExports: {
      writeMbaLineApprovals: writeMbaLineApprovalsMock,
    },
  })
  await mock.module!("@/db", {
    namedExports: {
      getDb: () => ({ execute: dbExecuteMock }),
      schema: {},
    },
  })
}

function allowOwnMba(ownMba: string) {
  checkClientMbaAccessMock.mock.mockImplementation(async (_req, mba) => {
    if (String(mba).toLowerCase() === ownMba.toLowerCase()) {
      return { ok: true, isClient: true }
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    }
  })
}

function allowAdmin() {
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))
}

function forbidAll() {
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
}

const replaceBody = {
  media_plan_version_id: 42,
  mba_number: "hema001",
  line_item_id: "hema001SE1",
  component: "media",
  months: [{ month: "2026-01", amount: 100 }],
  date_basis: "billing",
}

const resetBody = {
  media_plan_version_id: 42,
  mba_number: "hema001",
  line_item_id: "hema001SE1",
  component: "media",
}

const refetchAnomalyBody = {
  versionId: 42,
  mba: "hema001",
  reason: "empty_after_persist",
  replacedMedia: 1,
  replacedFee: 0,
  reset: 0,
}

const workingDedupeBody = {
  versionId: 42,
  mba: "hema001",
  collapses: [
    {
      mediaKey: "search",
      monthYear: "2026-01",
      canonicalId: "hema001::SE1",
      keptId: "hema001SE1",
      droppedIds: ["hema001SE1-dup"],
    },
  ],
}

test("GET /api/billing-overrides — client foreign version MBA → 403; read not called", { skip }, async () => {
  resolveMbaNumberForVersionIdMock.mock.resetCalls()
  resolveMbaNumberForVersionIdMock.mock.mockImplementation(async () => "hema001")
  readBillingOverridesForVersionMock.mock.resetCalls()
  forbidAll()

  const { GET } = await import("../../../app/api/billing-overrides/route.js")
  const res = await GET(
    new NextRequest("http://localhost/api/billing-overrides?media_plan_version_id=99")
  )
  assert.equal(res.status, 403)
  assert.equal(readBillingOverridesForVersionMock.mock.calls.length, 0)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "hema001")
})

test("GET /api/billing-overrides — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  resolveMbaNumberForVersionIdMock.mock.mockImplementation(async () => "BICAU002")
  readBillingOverridesForVersionMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { GET } = await import("../../../app/api/billing-overrides/route.js")
  const own = await GET(
    new NextRequest("http://localhost/api/billing-overrides?media_plan_version_id=42")
  )
  assert.equal(own.status, 200)
  assert.equal(readBillingOverridesForVersionMock.mock.calls.length, 1)
  const ownBody = await own.json()
  assert.equal(Array.isArray(ownBody.overrides), true)

  resolveMbaNumberForVersionIdMock.mock.mockImplementation(async () => "hema001")
  readBillingOverridesForVersionMock.mock.resetCalls()
  allowAdmin()
  const admin = await GET(
    new NextRequest("http://localhost/api/billing-overrides?media_plan_version_id=99")
  )
  assert.equal(admin.status, 200)
  assert.equal(readBillingOverridesForVersionMock.mock.calls.length, 1)
})

test("POST replace_line — client foreign MBA → 403; write not called", { skip }, async () => {
  replaceBillingOverrideLineMock.mock.resetCalls()
  forbidAll()

  const { POST } = await import("../../../app/api/billing-overrides/replace_line/route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/billing-overrides/replace_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(replaceBody),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(replaceBillingOverrideLineMock.mock.calls.length, 0)
})

test("POST replace_line — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  replaceBillingOverrideLineMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { POST } = await import("../../../app/api/billing-overrides/replace_line/route.js")
  const own = await POST(
    new NextRequest("http://localhost/api/billing-overrides/replace_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...replaceBody, mba_number: "BICAU002", line_item_id: "BICAU002SE1" }),
    })
  )
  assert.equal(own.status, 200)
  assert.equal(replaceBillingOverrideLineMock.mock.calls.length, 1)

  replaceBillingOverrideLineMock.mock.resetCalls()
  allowAdmin()
  const admin = await POST(
    new NextRequest("http://localhost/api/billing-overrides/replace_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(replaceBody),
    })
  )
  assert.equal(admin.status, 200)
  assert.equal(replaceBillingOverrideLineMock.mock.calls.length, 1)
})

test("POST reset_line — client foreign MBA → 403; write not called", { skip }, async () => {
  resetBillingOverrideLineMock.mock.resetCalls()
  forbidAll()

  const { POST } = await import("../../../app/api/billing-overrides/reset_line/route.js")
  const res = await POST(
    new NextRequest("http://localhost/api/billing-overrides/reset_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(resetBody),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(resetBillingOverrideLineMock.mock.calls.length, 0)
})

test("POST reset_line — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  resetBillingOverrideLineMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { POST } = await import("../../../app/api/billing-overrides/reset_line/route.js")
  const own = await POST(
    new NextRequest("http://localhost/api/billing-overrides/reset_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...resetBody, mba_number: "BICAU002", line_item_id: "BICAU002SE1" }),
    })
  )
  assert.equal(own.status, 200)
  assert.equal(resetBillingOverrideLineMock.mock.calls.length, 1)

  resetBillingOverrideLineMock.mock.resetCalls()
  allowAdmin()
  const admin = await POST(
    new NextRequest("http://localhost/api/billing-overrides/reset_line", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(resetBody),
    })
  )
  assert.equal(admin.status, 200)
  assert.equal(resetBillingOverrideLineMock.mock.calls.length, 1)
})

test("POST refetch-anomaly — client foreign MBA → 403; notify not written", { skip }, async () => {
  dbExecuteMock.mock.resetCalls()
  forbidAll()

  const { POST } = await import(
    "../../../app/api/billing-overrides/refetch-anomaly/route.js"
  )
  const res = await POST(
    new NextRequest("http://localhost/api/billing-overrides/refetch-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(refetchAnomalyBody),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(dbExecuteMock.mock.calls.length, 0)
})

test("POST refetch-anomaly — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  dbExecuteMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { POST } = await import(
    "../../../app/api/billing-overrides/refetch-anomaly/route.js"
  )
  const own = await POST(
    new NextRequest("http://localhost/api/billing-overrides/refetch-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...refetchAnomalyBody, mba: "BICAU002" }),
    })
  )
  assert.equal(own.status, 200)
  const ownBody = await own.json()
  assert.equal(ownBody.ok, true)

  dbExecuteMock.mock.resetCalls()
  allowAdmin()
  const admin = await POST(
    new NextRequest("http://localhost/api/billing-overrides/refetch-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(refetchAnomalyBody),
    })
  )
  assert.equal(admin.status, 200)
})

test("POST working-dedupe-anomaly — client foreign MBA → 403; notify not written", { skip }, async () => {
  dbExecuteMock.mock.resetCalls()
  forbidAll()

  const { POST } = await import(
    "../../../app/api/billing-overrides/working-dedupe-anomaly/route.js"
  )
  const res = await POST(
    new NextRequest("http://localhost/api/billing-overrides/working-dedupe-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workingDedupeBody),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(dbExecuteMock.mock.calls.length, 0)
})

test("POST working-dedupe-anomaly — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  allowOwnMba("BICAU002")

  const { POST } = await import(
    "../../../app/api/billing-overrides/working-dedupe-anomaly/route.js"
  )
  const own = await POST(
    new NextRequest("http://localhost/api/billing-overrides/working-dedupe-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...workingDedupeBody, mba: "BICAU002" }),
    })
  )
  assert.equal(own.status, 200)

  allowAdmin()
  const admin = await POST(
    new NextRequest("http://localhost/api/billing-overrides/working-dedupe-anomaly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workingDedupeBody),
    })
  )
  assert.equal(admin.status, 200)
})

test("GET /api/mba-line-approvals — client foreign MBA → 403; read not called", { skip }, async () => {
  readMbaLineApprovalsMock.mock.resetCalls()
  forbidAll()

  const { GET } = await import("../../../app/api/mba-line-approvals/route.js")
  const res = await GET(
    new NextRequest(
      "http://localhost/api/mba-line-approvals?mba_number=hema001&media_plan_version=1"
    )
  )
  assert.equal(res.status, 403)
  assert.equal(readMbaLineApprovalsMock.mock.calls.length, 0)
})

test("GET /api/mba-line-approvals — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  readMbaLineApprovalsMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { GET } = await import("../../../app/api/mba-line-approvals/route.js")
  const own = await GET(
    new NextRequest(
      "http://localhost/api/mba-line-approvals?mba_number=BICAU002&media_plan_version=1"
    )
  )
  assert.equal(own.status, 200)
  assert.equal(readMbaLineApprovalsMock.mock.calls.length, 1)

  readMbaLineApprovalsMock.mock.resetCalls()
  allowAdmin()
  const admin = await GET(
    new NextRequest(
      "http://localhost/api/mba-line-approvals?mba_number=hema001&media_plan_version=1"
    )
  )
  assert.equal(admin.status, 200)
  assert.equal(readMbaLineApprovalsMock.mock.calls.length, 1)
})

test("PATCH /api/mba-line-approvals — client foreign MBA → 403; write not called", { skip }, async () => {
  writeMbaLineApprovalsMock.mock.resetCalls()
  forbidAll()

  const { PATCH } = await import("../../../app/api/mba-line-approvals/route.js")
  const res = await PATCH(
    new NextRequest("http://localhost/api/mba-line-approvals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mba_number: "hema001",
        media_plan_version: 1,
        lines: [{ line_item_id: "hema001SE1", media_type: "search", approved: false }],
      }),
    })
  )
  assert.equal(res.status, 403)
  assert.equal(writeMbaLineApprovalsMock.mock.calls.length, 0)
})

test("PATCH /api/mba-line-approvals — client own MBA → 200; admin foreign → 200", { skip }, async () => {
  writeMbaLineApprovalsMock.mock.resetCalls()
  allowOwnMba("BICAU002")

  const { PATCH } = await import("../../../app/api/mba-line-approvals/route.js")
  const own = await PATCH(
    new NextRequest("http://localhost/api/mba-line-approvals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mba_number: "BICAU002",
        media_plan_version: 1,
        lines: [{ line_item_id: "BICAU002SE1", media_type: "search", approved: true }],
      }),
    })
  )
  assert.equal(own.status, 200)
  assert.equal(writeMbaLineApprovalsMock.mock.calls.length, 1)

  writeMbaLineApprovalsMock.mock.resetCalls()
  allowAdmin()
  const admin = await PATCH(
    new NextRequest("http://localhost/api/mba-line-approvals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mba_number: "hema001",
        media_plan_version: 1,
        lines: [{ line_item_id: "hema001SE1", media_type: "search", approved: false }],
      }),
    })
  )
  assert.equal(admin.status, 200)
  assert.equal(writeMbaLineApprovalsMock.mock.calls.length, 1)
})
