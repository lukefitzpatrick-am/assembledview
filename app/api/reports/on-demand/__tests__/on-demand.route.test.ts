/**
 * On-demand detail level. Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const enqueueMock = mock.fn(async (_input: { detailLevel: string }) => ({
  runId: "run-1",
  status: "queued",
}))

const findLatestMock = mock.fn(
  async (_mba: string, _start: string, _end: string, detailLevel: string) => {
    if (detailLevel === "line_item") {
      return {
        id: "line-run",
        status: "generated",
        fileName: "line.pptx",
        blobPathname: "exports/reports/curatif004/line.pptx",
        error: null,
        createdAt: new Date().toISOString(),
        detailLevel: "line_item",
      }
    }
    return null
  },
)

if (typeof mock.module === "function") {
  const nextServer = await import("next/server")
  await mock.module("next/server", {
    namedExports: {
      after: () => {},
      NextRequest: nextServer.NextRequest,
      NextResponse: nextServer.NextResponse,
    },
  })
  await mock.module("@/lib/requireRole", {
    namedExports: {
      requireRole: async () => ({
        session: { user: { email: "admin@assembledmedia.com.au", sub: "admin-1" } },
      }),
    },
  })
  await mock.module("@/lib/auth/checkClientMbaAccess", {
    namedExports: {
      checkClientMbaAccess: async () => ({ ok: true as const }),
    },
  })
  await mock.module("@/lib/reports/campaignReport/rateLimit", {
    namedExports: {
      checkCampaignReportRateLimit: () => ({ ok: true as const }),
    },
  })
  await mock.module("@/lib/reports/deckJobs/onDemandDeckStore", {
    namedExports: {
      enqueueOnDemandDeckRow: enqueueMock,
      findLatestOnDemandDeck: findLatestMock,
    },
  })
  await mock.module("@/lib/reports/deckJobs/runOnDemandDeck", {
    namedExports: {
      runOnDemandDeck: async () => ({ status: "generated" }),
    },
  })
  await mock.module("@/lib/log", {
    namedExports: {
      logJob: () => {},
    },
  })
}

const { GET, POST } = await import("../route")

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/reports/on-demand", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

test("missing detailLevel is channel and reaches the insert", { skip }, async () => {
  enqueueMock.mock.resetCalls()
  const response = await POST(post({ mbaNumber: "curatif004", period: { kind: "this_month" } }))
  assert.equal(response.status, 200)
  assert.equal(enqueueMock.mock.calls.length, 1)
  const input = enqueueMock.mock.calls[0]?.arguments[0] as { detailLevel?: string }
  assert.equal(input.detailLevel, "channel")
})

test("a bad detailLevel is 400", { skip }, async () => {
  enqueueMock.mock.resetCalls()
  const response = await POST(
    post({ mbaNumber: "curatif004", period: { kind: "this_month" }, detailLevel: "placement" }),
  )
  assert.equal(response.status, 400)
  const body = (await response.json()) as { error?: string }
  assert.match(body.error ?? "", /detailLevel must be channel, line_item, or ad_group/)
  assert.equal(enqueueMock.mock.calls.length, 0)
})

test("line_item detailLevel reaches the insert", { skip }, async () => {
  enqueueMock.mock.resetCalls()
  const response = await POST(
    post({ mbaNumber: "curatif004", period: { kind: "this_month" }, detailLevel: "line_item" }),
  )
  assert.equal(response.status, 200)
  const input = enqueueMock.mock.calls[0]?.arguments[0] as { detailLevel?: string }
  assert.equal(input.detailLevel, "line_item")
})

test("a channel lookup does not receive the line_item row", { skip }, async () => {
  findLatestMock.mock.resetCalls()
  const response = await GET(
    new NextRequest("http://localhost/api/reports/on-demand?mbaNumber=curatif004&kind=this_month"),
  )
  assert.equal(response.status, 200)
  const body = (await response.json()) as { run: unknown }
  assert.equal(body.run, null)
  const level = findLatestMock.mock.calls[0]?.arguments[3]
  assert.equal(level, "channel")
})
