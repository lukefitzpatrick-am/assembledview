/**
 * Billing partner pack routes. Non-admins are refused before a pack is built
 * or stamped sent.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const requireFinanceAdminMock = mock.fn(
  async (): Promise<
    { session: { user: { email: string } }; roles: string[]; clientSlug: null; grantedByAllowlist: false } | { response: NextResponse }
  > => ({
    session: { user: { email: "luke@assembledmedia.com.au" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }),
)

const PACK_ID = "11111111-1111-4111-8111-111111111111"

const buildMock = mock.fn(async (_input: {
  billingMonth: string
  versionIds?: number[]
  createdBy: string
}) => ({
  packId: PACK_ID,
  fileName: "AA pack November 2026 2026-10-19.zip",
  buffer: Buffer.from("zip-bytes"),
}))

const markMock = mock.fn(async (_input: { packId: string; sentBy: string }) => ({
  packId: PACK_ID,
  status: "sent" as const,
  sentAt: "2026-10-19T07:00:00.000Z",
  sentBy: "luke@assembledmedia.com.au",
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: requireFinanceAdminMock },
  })
  await mock.module("@/lib/finance/billingPartner/buildPack", {
    namedExports: { buildBillingPartnerPack: buildMock },
  })
  await mock.module("@/lib/finance/billingPartner/packStore", {
    namedExports: { markPackSent: markMock },
  })
}

const { POST } = await import("../packs/route")
const { POST: markSent } = await import("../packs/[id]/sent/route")

function forbid() {
  requireFinanceAdminMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
}

function allow() {
  requireFinanceAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "Luke@assembledmedia.com.au" } },
    roles: ["admin"],
    clientSlug: null,
    grantedByAllowlist: false,
  }))
}

test("non-admin is refused on build and mark sent", { skip }, async () => {
  buildMock.mock.resetCalls()
  markMock.mock.resetCalls()
  forbid()
  const buildResponse = await POST(
    new NextRequest("http://localhost/api/finance/billing-partner/packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ billingMonth: "2026-11", versionIds: [11, 22] }),
    }),
  )
  const sentResponse = await markSent(
    new NextRequest(`http://localhost/api/finance/billing-partner/packs/${PACK_ID}/sent`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: PACK_ID }) },
  )
  assert.equal(buildResponse.status, 403)
  assert.equal(sentResponse.status, 403)
  assert.equal(buildMock.mock.calls.length, 0)
  assert.equal(markMock.mock.calls.length, 0)
  allow()
})

test("an admin build returns the zip and a mark-sent call stamps the pack", { skip }, async () => {
  buildMock.mock.resetCalls()
  markMock.mock.resetCalls()
  allow()
  const buildResponse = await POST(
    new NextRequest("http://localhost/api/finance/billing-partner/packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ billingMonth: "2026-11", versionIds: [11, 22] }),
    }),
  )
  assert.equal(buildResponse.status, 200)
  assert.equal(buildResponse.headers.get("Content-Type"), "application/zip")
  assert.match(buildResponse.headers.get("Content-Disposition") ?? "", /AA pack November 2026/)
  assert.equal(buildResponse.headers.get("X-Billing-Partner-Pack-Id"), PACK_ID)
  const buildArgs = buildMock.mock.calls[0]?.arguments[0]
  assert.ok(buildArgs)
  assert.equal(buildArgs.billingMonth, "2026-11")
  assert.deepEqual(buildArgs.versionIds, [11, 22])
  assert.equal(buildArgs.createdBy, "luke@assembledmedia.com.au")

  const sentResponse = await markSent(
    new NextRequest(`http://localhost/api/finance/billing-partner/packs/${PACK_ID}/sent`, { method: "POST" }),
    { params: Promise.resolve({ id: PACK_ID }) },
  )
  assert.equal(sentResponse.status, 200)
  const body = (await sentResponse.json()) as { status: string; sentBy: string }
  assert.equal(body.status, "sent")
  assert.equal(body.sentBy, "luke@assembledmedia.com.au")
  const sentArgs = markMock.mock.calls[0]?.arguments[0]
  assert.ok(sentArgs)
  assert.equal(sentArgs.packId, PACK_ID)
  assert.equal(sentArgs.sentBy, "luke@assembledmedia.com.au")
})
