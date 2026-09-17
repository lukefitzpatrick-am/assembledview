import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const pending = {
  id: 11,
  mbaNumber: "GOLF001",
  versionNumber: 4,
  status: "generating" as const,
  beats: {
    planned: "Nothing to report yet.",
    happened: "Nothing to report yet.",
    vsPlan: "Nothing to report yet.",
    best: "Nothing to report yet.",
    worst: "Nothing to report yet.",
    upcoming: "Nothing to report yet.",
  },
  bodyMarkdown: "md",
  sources: null,
  errorMessage: null,
  generatedAt: "2026-09-17T00:00:00.000Z",
  generatedByEmail: "luke@assembledmedia.com.au",
  editedAt: null,
  editedByEmail: null,
  publishedAt: null,
  publishedByEmail: null,
}

const startMock = mock.fn(async () => ({ ...pending }))
const runJobMock = mock.fn(async () => ({ ...pending, status: "draft" as const }))
const afterMock = mock.fn((work: () => unknown) => {
  void work()
})

if (supportsMockModule()) {
  await mock.module!("next/server", {
    namedExports: {
      NextRequest,
      NextResponse,
      after: afterMock,
    },
  })
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: async () => ({
        session: { user: { email: "luke@assembledmedia.com.au", sub: "u1" } },
      }),
      requireRole: async () => ({
        session: { user: { email: "luke@assembledmedia.com.au", sub: "u1" } },
      }),
    },
  })
  await mock.module!("@/lib/campaign-read/generate", {
    namedExports: {
      startCampaignReadGeneration: startMock,
      runCampaignReadJob: runJobMock,
    },
  })
}

test("POST generate returns 202 generating and after() continues the job", { skip }, async () => {
  startMock.mock.resetCalls()
  runJobMock.mock.resetCalls()
  afterMock.mock.resetCalls()
  process.env.AVA_ENGINE = "on"
  process.env.ANTHROPIC_API_KEY = "test-key"
  const { POST } = await import("../../../app/api/campaign-reads/generate/route.js")
  const req = new NextRequest("http://localhost/api/campaign-reads/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mbaNumber: "GOLF001", versionNumber: 4 }),
  })
  const res = await POST(req)
  assert.equal(res.status, 202)
  const body = await res.json()
  assert.equal(body.item.id, 11)
  assert.equal(body.item.status, "generating")
  assert.equal(startMock.mock.calls.length, 1)
  assert.equal(afterMock.mock.calls.length, 1)
  assert.equal(typeof afterMock.mock.calls[0]!.arguments[0], "function")
  assert.equal(runJobMock.mock.calls.length, 1)
})
