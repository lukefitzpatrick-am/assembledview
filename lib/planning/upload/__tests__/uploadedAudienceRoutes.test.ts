/**
 * PL1-C route gates. Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const UNAUTH = {
  response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
}

const ADMIN = {
  session: {
    user: {
      email: "admin@assembledmedia.com.au",
      sub: "auth0|admin",
      name: "Admin",
    },
  },
  roles: ["admin"] as string[],
  clientSlug: null,
  grantedByAllowlist: false,
}

const requireRoleMock = mock.fn(async () => UNAUTH as typeof UNAUTH | typeof ADMIN)

const checkUploadRateLimitMock = mock.fn(() => ({ ok: true, remaining: 9 }))

const getUploadMock = mock.fn(async (_id?: number): Promise<{
  id: number
  parse_json: unknown
  wave_code: string | null
  filter_label: string | null
}> => {
  throw new Error("getUpload not stubbed")
})
const getUploadedAudienceMock = mock.fn(async () => {
  throw new Error("getUploadedAudience not stubbed")
})
const createUploadMock = mock.fn(async () => {
  throw new Error("createUpload not stubbed")
})
const createUploadedAudienceMock = mock.fn(async () => {
  throw new Error("createUploadedAudience not stubbed")
})
const markUploadSavedMock = mock.fn(async () => {
  throw new Error("markUploadSaved not stubbed")
})
const listUploadedAudiencesMock = mock.fn(async () => [] as unknown[])

const parseRoyMorganWorkbookMock = mock.fn(async () => {
  throw new Error("parse not stubbed")
})
const storePlanningUploadBlobMock = mock.fn(async () => "planning/audience-uploads/x")
const mapRoyMorganToChannelsMock = mock.fn(() => ({
  mapped: [] as unknown[],
  unmatchedRows: [] as unknown[],
  uncoveredLeafIds: [] as string[],
  duplicateChannelIds: [] as string[],
  scoreableCount: 0,
}))
const getCachedPlanningMetaMock = mock.fn(async () => ({ channels: [] }))
const buildUploadedAudienceResponseMock = mock.fn(() => ({
  wave_id: "UPLOAD",
  reach_basis: "total",
  audience_wc: 0,
  unweighted_n: 0,
  universe_wc: 0,
  suppressed_cells: 0,
  channels: [],
}))

class UploadedAudienceError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "UploadedAudienceError"
    this.status = status
  }
}

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: { requireRole: requireRoleMock },
  })
  await mock.module!("@/lib/planning/upload/uploadRateLimit", {
    namedExports: { checkUploadRateLimit: checkUploadRateLimitMock },
  })
  await mock.module!("@/lib/planning/upload/uploadedAudienceRepo", {
    namedExports: {
      UploadedAudienceError,
      createUpload: createUploadMock,
      getUpload: getUploadMock,
      markUploadSaved: markUploadSavedMock,
      createUploadedAudience: createUploadedAudienceMock,
      listUploadedAudiences: listUploadedAudiencesMock,
      getUploadedAudience: getUploadedAudienceMock,
      archiveUploadedAudience: mock.fn(async () => {
        throw new Error("unused")
      }),
    },
  })
  await mock.module!("@/lib/planning/upload/parseRoyMorganWorkbook", {
    namedExports: { parseRoyMorganWorkbook: parseRoyMorganWorkbookMock },
  })
  await mock.module!("@/lib/planning/upload/storePlanningUploadBlob", {
    namedExports: { storePlanningUploadBlob: storePlanningUploadBlobMock },
  })
  await mock.module!("@/lib/planning/upload/mapRoyMorganToChannels", {
    namedExports: { mapRoyMorganToChannels: mapRoyMorganToChannelsMock },
  })
  await mock.module!("@/lib/planning/metaCache", {
    namedExports: { getCachedPlanningMeta: getCachedPlanningMetaMock },
  })
  await mock.module!("@/lib/planning/upload/buildUploadedAudienceResponse", {
    namedExports: { buildUploadedAudienceResponse: buildUploadedAudienceResponseMock },
  })
}

async function loadRoutes() {
  const uploads = await import("../../../../app/api/planning/uploads/route.js")
  const save = await import("../../../../app/api/planning/uploads/[id]/audiences/route.js")
  const rebuild = await import("../../../../app/api/planning/audience/uploaded/route.js")
  const list = await import("../../../../app/api/planning/uploaded-audiences/route.js")
  return {
    postUpload: uploads.POST,
    postSave: save.POST,
    postRebuild: rebuild.POST,
    getList: list.GET,
  }
}

function jsonPost(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function multipartPost(path: string, file: File | null): NextRequest {
  const fd = new FormData()
  if (file) fd.append("file", file)
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: fd })
}

test("unauthenticated POST /api/planning/uploads → 401", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => UNAUTH)
  const { postUpload } = await loadRoutes()
  const res = await postUpload(multipartPost("/api/planning/uploads", null))
  assert.equal(res.status, 401)
  const body = (await res.json()) as { error?: string }
  assert.equal(body.error, "Unauthorized")
})

test("unauthenticated POST /api/planning/uploads/[id]/audiences → 401", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => UNAUTH)
  const { postSave } = await loadRoutes()
  const res = await postSave(jsonPost("/api/planning/uploads/1/audiences", {}), {
    params: Promise.resolve({ id: "1" }),
  })
  assert.equal(res.status, 401)
})

test("unauthenticated POST /api/planning/audience/uploaded → 401", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => UNAUTH)
  const { postRebuild } = await loadRoutes()
  const res = await postRebuild(jsonPost("/api/planning/audience/uploaded", {}))
  assert.equal(res.status, 401)
})

test("unauthenticated GET /api/planning/uploaded-audiences → 401", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => UNAUTH)
  const { getList } = await loadRoutes()
  const res = await getList(
    new NextRequest("http://localhost/api/planning/uploaded-audiences")
  )
  assert.equal(res.status, 401)
})

test("admin POST /api/planning/uploads with no file → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { postUpload } = await loadRoutes()
  const res = await postUpload(multipartPost("/api/planning/uploads", null))
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.ok(typeof body.error === "string" && body.error.length > 0)
})

test("admin POST /api/planning/uploads with .csv → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { postUpload } = await loadRoutes()
  const res = await postUpload(
    multipartPost("/api/planning/uploads", new File(["abc"], "bad.csv", { type: "text/csv" }))
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /xlsx|xlsm/i)
})

test("admin POST /api/planning/uploads/[id]/audiences missing name → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { postSave } = await loadRoutes()
  const res = await postSave(
    jsonPost("/api/planning/uploads/1/audiences", {
      sheet_name: "Run",
      block_id: "b1",
      definition: { states: ["NAT"] },
    }),
    { params: Promise.resolve({ id: "1" }) }
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /name/i)
})

test("admin POST /api/planning/uploads/[id]/audiences scoreableCount 0 → 422", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  getUploadMock.mock.mockImplementation(async () => ({
    id: 1,
    parse_json: {
      fileName: "t.xlsx",
      sheets: [
        {
          sheetName: "Run",
          waveCode: "JAN26A_NAT",
          surveyPeriod: null,
          filter: null,
          weights: null,
          blocks: [
            {
              blockId: "b1",
              columnName: "Audience",
              isBase: false,
              labelCol: 1,
              metrics: ["wc"],
              unweightedN: 10,
              popn000: 100,
              filter: null,
              rows: [],
            },
          ],
          skipped: [],
        },
      ],
      warnings: [],
    },
    wave_code: "JAN26A_NAT",
    filter_label: null,
  }))
  mapRoyMorganToChannelsMock.mock.mockImplementation(() => ({
    mapped: [],
    unmatchedRows: [],
    uncoveredLeafIds: ["tv"],
    duplicateChannelIds: [],
    scoreableCount: 0,
  }))
  createUploadedAudienceMock.mock.resetCalls()
  const { postSave } = await loadRoutes()
  const res = await postSave(
    jsonPost("/api/planning/uploads/1/audiences", {
      sheet_name: "Run",
      block_id: "b1",
      name: "Test",
      clients_id: null,
      overrides: {},
      options: { inheritRollupIds: [], benchmarkOnlyIds: [] },
      definition: { states: ["NAT"], ageBands: [], gender: null },
    }),
    { params: Promise.resolve({ id: "1" }) }
  )
  assert.equal(res.status, 422)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /scoreable/i)
  assert.equal(createUploadedAudienceMock.mock.calls.length, 0)
})

test("admin POST /api/planning/audience/uploaded missing id → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { postRebuild } = await loadRoutes()
  const res = await postRebuild(jsonPost("/api/planning/audience/uploaded", { reach_basis: "total" }))
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /uploaded_audience_id/i)
})

test("admin GET /api/planning/uploaded-audiences?clients_id=-1 → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { getList } = await loadRoutes()
  const res = await getList(
    new NextRequest("http://localhost/api/planning/uploaded-audiences?clients_id=-1")
  )
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /clients_id/i)
})
