/**
 * CS-B — PATCH /api/mediaplans/mba/[mba_number]/status
 * Auth matches sibling MBA mutations: parseMbaNumber + checkClientMbaAccess.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const checkClientMbaAccessMock = mock.fn(
  async (_req: unknown, _mba: string) =>
    ({ ok: true, isClient: false }) as
      | { ok: true; isClient: boolean }
      | { ok: false; response: Response }
)

const writeCampaignStatusMock = mock.fn(
  async (_mba: string, status: string) => ({ mbaNumber: "hema001", status })
)

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: checkClientMbaAccessMock,
    },
  })
  await mock.module!("@/lib/data/writeCampaignStatus", {
    namedExports: {
      writeCampaignStatus: writeCampaignStatusMock,
      CampaignStatusWriteError: class CampaignStatusWriteError extends Error {
        constructor(
          public readonly code: string,
          message: string
        ) {
          super(message)
          this.name = "CampaignStatusWriteError"
        }
      },
    },
  })
}

function patchRequest(mba: string, body: unknown) {
  return new NextRequest(`http://localhost/api/mediaplans/mba/${mba}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

test("PATCH mba status — foreign MBA blocked before write", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  writeCampaignStatusMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: false,
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))

  const { PATCH } = await import(
    "../../../app/api/mediaplans/mba/[mba_number]/status/route.js"
  )
  const res = await PATCH(patchRequest("hema001", { status: "booked" }), {
    params: Promise.resolve({ mba_number: "hema001" }),
  })
  assert.equal(res.status, 403)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 1)
  assert.equal(checkClientMbaAccessMock.mock.calls[0]!.arguments[1], "hema001")
  assert.equal(writeCampaignStatusMock.mock.calls.length, 0)
})

test("PATCH mba status — own MBA passes local gate then writes", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  writeCampaignStatusMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))
  writeCampaignStatusMock.mock.mockImplementation(async (_mba, status) => ({
    mbaNumber: "hema001",
    status,
  }))

  const { PATCH } = await import(
    "../../../app/api/mediaplans/mba/[mba_number]/status/route.js"
  )
  const res = await PATCH(patchRequest("hema001", { status: "booked" }), {
    params: Promise.resolve({ mba_number: "hema001" }),
  })
  assert.equal(res.status, 200)
  assert.equal(checkClientMbaAccessMock.mock.calls.length, 1)
  assert.equal(writeCampaignStatusMock.mock.calls.length, 1)
  assert.equal(writeCampaignStatusMock.mock.calls[0]!.arguments[0], "hema001")
  assert.equal(writeCampaignStatusMock.mock.calls[0]!.arguments[1], "booked")
})

test("PATCH mba status — rejects a value outside SELECTABLE_CAMPAIGN_STATUSES", { skip }, async () => {
  checkClientMbaAccessMock.mock.resetCalls()
  writeCampaignStatusMock.mock.resetCalls()
  checkClientMbaAccessMock.mock.mockImplementation(async () => ({
    ok: true,
    isClient: false,
  }))

  const { PATCH } = await import(
    "../../../app/api/mediaplans/mba/[mba_number]/status/route.js"
  )
  const res = await PATCH(patchRequest("hema001", { status: "draft" }), {
    params: Promise.resolve({ mba_number: "hema001" }),
  })
  assert.equal(res.status, 422)
  assert.equal(writeCampaignStatusMock.mock.calls.length, 0)
})
