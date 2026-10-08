/**
 * Admin report routes: role gate, and generate now writes the row from a mocked generator.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type AdminGate =
  | { session: { user: { email: string; sub: string } } }
  | { response: NextResponse }

type GenerateResult = {
  buffer: Buffer
  fileName: string
  blobPathname?: string
  commentaryGenerated: boolean
  commentary: string | null
  periodMonth: string
  skipped?: string
}

const requireAdminMock = mock.fn(async (): Promise<AdminGate> => ({
  session: { user: { email: "admin@assembledmedia.com.au", sub: "admin-1" } },
}))

const generateMock = mock.fn(
  async (_input: {
    mbaNumber: string
    period: { kind: string; start?: string; end?: string }
    store: boolean
    withCommentary: boolean
  }): Promise<GenerateResult> => ({
    buffer: Buffer.from("deck"),
    fileName: "Penfold-report.pptx",
    blobPathname: "exports/reports/PENFOLD013/Penfold-report.pptx",
    commentaryGenerated: true,
    commentary: "Ready",
    periodMonth: "2025-12",
  }),
)

const loadMock = mock.fn(async () => ({
  id: "run-1",
  mbaNumber: "PENFOLD013",
  periodStart: "2025-12-01",
  periodEnd: "2025-12-31",
}))

const markMock = mock.fn(async () => {})
const listMock = mock.fn(async () => [])
const enqueueMock = mock.fn(
  async (_period: { periodStart: string; periodEnd: string }) => ({
    periodStart: "2025-12-01",
    periodEnd: "2025-12-31",
    selected: 1,
    queued: 1,
    alreadyPresent: 0,
  }),
)
const saveGeneratedMock = mock.fn(
  async (
    _id: string,
    _fields: { blobPathname: string; fileName: string; commentaryGenerated: boolean },
  ) => {},
)
const saveSkippedMock = mock.fn(async (_id: string, _reason: string) => {})
const saveFailedMock = mock.fn(async (_id: string, _error: string) => {})

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireAdmin: requireAdminMock },
  })
  await mock.module("@/lib/reports/campaignReport/generateCampaignReportForMba", {
    namedExports: { generateCampaignReportForMba: generateMock },
  })
  await mock.module("@/lib/reports/adminReportRunsStore", {
    namedExports: {
      listAdminReportRuns: listMock,
      loadReportRunForGenerate: loadMock,
      markReportRunGenerating: markMock,
      enqueueAdminReportRuns: enqueueMock,
    },
  })
  await mock.module("@/lib/reports/reportsWorkerStore", {
    namedExports: {
      saveGeneratedReportRun: saveGeneratedMock,
      saveSkippedReportRun: saveSkippedMock,
      saveFailedReportRun: saveFailedMock,
    },
  })
}

const { GET } = await import("../route")
const { POST: enqueuePost } = await import("../enqueue/route")
const { POST: generatePost, maxDuration } = await import("../runs/[id]/generate/route")

function denied(status: number, error: string) {
  return { response: NextResponse.json({ error }, { status }) }
}

function resetMocks() {
  requireAdminMock.mock.resetCalls()
  generateMock.mock.resetCalls()
  loadMock.mock.resetCalls()
  markMock.mock.resetCalls()
  listMock.mock.resetCalls()
  enqueueMock.mock.resetCalls()
  saveGeneratedMock.mock.resetCalls()
  saveSkippedMock.mock.resetCalls()
  saveFailedMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@assembledmedia.com.au", sub: "admin-1" } },
  }))
  generateMock.mock.mockImplementation(async () => ({
    buffer: Buffer.from("deck"),
    fileName: "Penfold-report.pptx",
    blobPathname: "exports/reports/PENFOLD013/Penfold-report.pptx",
    commentaryGenerated: true,
    commentary: "Ready",
    periodMonth: "2025-12",
  }))
  loadMock.mock.mockImplementation(async () => ({
    id: "run-1",
    mbaNumber: "PENFOLD013",
    periodStart: "2025-12-01",
    periodEnd: "2025-12-31",
  }))
}

test("report routes return the admin gate response", { skip }, async () => {
  resetMocks()
  requireAdminMock.mock.mockImplementation(async () => denied(401, "Unauthorized"))

  const list = await GET(new NextRequest("http://localhost/api/admin/reports?period=2025-12"))
  assert.equal(list.status, 401)
  assert.equal(listMock.mock.calls.length, 0)

  requireAdminMock.mock.mockImplementation(async () => denied(403, "Forbidden"))
  const queued = await enqueuePost(
    new NextRequest("http://localhost/api/admin/reports/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period: "2025-12" }),
    }),
  )
  assert.equal(queued.status, 403)
  assert.equal(enqueueMock.mock.calls.length, 0)

  const generated = await generatePost(
    new NextRequest("http://localhost/api/admin/reports/runs/run-1/generate", { method: "POST" }),
    { params: Promise.resolve({ id: "run-1" }) },
  )
  assert.equal(generated.status, 403)
  assert.equal(generateMock.mock.calls.length, 0)
  assert.equal(saveGeneratedMock.mock.calls.length, 0)
})

test("generate now updates the row from the mocked generator", { skip }, async () => {
  resetMocks()
  assert.equal(maxDuration, 300)

  const response = await generatePost(
    new NextRequest("http://localhost/api/admin/reports/runs/run-1/generate", { method: "POST" }),
    { params: Promise.resolve({ id: "run-1" }) },
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, "generated")
  assert.equal(markMock.mock.calls.length, 1)
  assert.deepEqual(generateMock.mock.calls[0]?.arguments[0], {
    mbaNumber: "PENFOLD013",
    period: { kind: "custom", start: "2025-12-01", end: "2025-12-31" },
    store: true,
    withCommentary: true,
  })
  assert.deepEqual(saveGeneratedMock.mock.calls[0]?.arguments, [
    "run-1",
    {
      blobPathname: "exports/reports/PENFOLD013/Penfold-report.pptx",
      fileName: "Penfold-report.pptx",
      commentaryGenerated: true,
    },
  ])
  assert.equal(saveSkippedMock.mock.calls.length, 0)
  assert.equal(saveFailedMock.mock.calls.length, 0)
})

test("generate now writes a skip reason when the generator skips", { skip }, async () => {
  resetMocks()
  generateMock.mock.mockImplementation(async () => ({
    buffer: Buffer.alloc(0),
    fileName: "",
    commentaryGenerated: false,
    commentary: null,
    periodMonth: "2025-12",
    skipped: "No published lines in the period",
  }))

  const response = await generatePost(
    new NextRequest("http://localhost/api/admin/reports/runs/run-1/generate", { method: "POST" }),
    { params: Promise.resolve({ id: "run-1" }) },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(saveSkippedMock.mock.calls[0]?.arguments, [
    "run-1",
    "No published lines in the period",
  ])
  assert.equal(saveGeneratedMock.mock.calls.length, 0)
})

test("queue for the month inserts for the chosen month and does not generate", { skip }, async () => {
  resetMocks()
  const response = await enqueuePost(
    new NextRequest("http://localhost/api/admin/reports/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ period: "2025-12" }),
    }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(enqueueMock.mock.calls[0]?.arguments[0], {
    periodStart: "2025-12-01",
    periodEnd: "2025-12-31",
  })
  assert.equal(generateMock.mock.calls.length, 0)
})
