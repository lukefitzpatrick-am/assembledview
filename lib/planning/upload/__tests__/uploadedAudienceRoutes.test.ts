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
const getUploadedAudienceMock = mock.fn(async (_id?: number): Promise<Record<string, unknown>> => {
  throw new Error("getUploadedAudience not stubbed")
})
const createUploadMock = mock.fn(async () => {
  throw new Error("createUpload not stubbed")
})
const createUploadedAudienceMock = mock.fn(async (_input?: Record<string, unknown>) => {
  throw new Error("createUploadedAudience not stubbed")
})
const retainUploadThenCreateAudienceMock = mock.fn(
  async (_input?: Record<string, unknown>): Promise<{ id: number; name: string }> => {
    throw new Error("retainUploadThenCreateAudience not stubbed")
  }
)
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
const getCachedPlanningMetaMock = mock.fn(async (): Promise<{ channels: unknown[] }> => ({
  channels: [],
}))
const countSuppressedMappedCellsMock = mock.fn(() => 0)
const buildUploadedAudienceResponseMock = mock.fn(
  (_args?: Record<string, unknown>): {
    wave_id: string
    reach_basis: string
    audience_wc: number
    unweighted_n: number
    universe_wc: number
    suppressed_cells: number
    channels: unknown[]
  } => ({
    wave_id: "UPLOAD",
    reach_basis: "total",
    audience_wc: 0,
    unweighted_n: 0,
    universe_wc: 0,
    suppressed_cells: 0,
    channels: [],
  })
)

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
      retainUploadThenCreateAudience: retainUploadThenCreateAudienceMock,
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
    namedExports: {
      buildUploadedAudienceResponse: buildUploadedAudienceResponseMock,
      countSuppressedMappedCells: countSuppressedMappedCellsMock,
    },
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
  assert.equal(retainUploadThenCreateAudienceMock.mock.calls.length, 0)
  assert.equal(markUploadSavedMock.mock.calls.length, 0)
})

test("admin POST /api/planning/audience/uploaded missing id → 400", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  const { postRebuild } = await loadRoutes()
  const res = await postRebuild(jsonPost("/api/planning/audience/uploaded", { reach_basis: "total" }))
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error?: string }
  assert.match(String(body.error), /uploaded_audience_id/i)
})

test("admin POST /api/planning/audience/uploaded rebuilds from row scalars without parse_json", { skip }, async () => {
  requireRoleMock.mock.mockImplementation(async () => ADMIN)
  getUploadMock.mock.resetCalls()
  getUploadMock.mock.mockImplementation(async () => {
    throw new Error("getUpload must not run on rebuild")
  })
  getUploadedAudienceMock.mock.mockImplementation(async () => ({
    id: 7,
    created_at: "2026-09-02T00:00:00.000Z",
    upload_id: 1,
    clients_id: null,
    name: "HML All cases",
    sheet_name: "HML",
    block_id: "HML:9",
    segment_key: "upl_7",
    wave_code: "MAR26E1_ASM",
    filter_label: "All cases",
    audience_wc: 800,
    unweighted_n: 220,
    universe_wc: 4000,
    suppressed_cells: 2,
    mapping_json: { overrides: {}, options: { inheritRollupIds: [], benchmarkOnlyIds: [] } },
    channels_json: [
      {
        channelId: "tv_fta",
        sourceLabel: "FTA TV",
        sourceRowIndex: 10,
        reachPct: 0.24,
        index: 110,
        wc: 192,
        provenance: "matched",
        inheritedFrom: null,
      },
    ],
    definition_json: { states: ["NAT"] },
    created_by_email: "admin@assembledmedia.com.au",
    is_archived: false,
  }))
  getCachedPlanningMetaMock.mock.mockImplementation(async () => ({
    channels: [
      {
        channel_id: "tv_fta",
        level1: "Video",
        level2: "FTA",
        sort_order: 2,
        is_rm_measured: true,
        age_base: 14,
        engine_channel_id: "tv",
        bench: { attn: 18, brand_effect: 50, direct_effect: 50, cpm: 20 },
      },
    ],
  }))
  buildUploadedAudienceResponseMock.mock.resetCalls()
  buildUploadedAudienceResponseMock.mock.mockImplementation((args?: Record<string, unknown>) => ({
    wave_id: "MAR26E1_ASM",
    reach_basis: "total",
    audience_wc: Number(args?.audienceWc ?? 0),
    unweighted_n: Number(args?.unweightedN ?? 0),
    universe_wc: Number(args?.universeWc ?? 0),
    suppressed_cells: Number(args?.suppressedCells ?? 0),
    channels: [],
  }))
  const { postRebuild } = await loadRoutes()
  const res = await postRebuild(
    jsonPost("/api/planning/audience/uploaded", {
      uploaded_audience_id: 7,
      reach_basis: "total",
    })
  )
  assert.equal(res.status, 200)
  assert.equal(getUploadMock.mock.calls.length, 0)
  assert.equal(buildUploadedAudienceResponseMock.mock.calls.length, 1)
  const args = buildUploadedAudienceResponseMock.mock.calls[0]!.arguments[0] as unknown as {
    audienceWc: number
    unweightedN: number
    universeWc: number
    suppressedCells: number
    block?: unknown
  }
  assert.equal(args.audienceWc, 800)
  assert.equal(args.unweightedN, 220)
  assert.equal(args.universeWc, 4000)
  assert.equal(args.suppressedCells, 2)
  assert.equal(args.block, undefined)
  const body = (await res.json()) as { audience_wc?: number; unweighted_n?: number }
  assert.equal(body.audience_wc, 800)
  assert.equal(body.unweighted_n, 220)
})

test("admin POST /api/planning/uploads/[id]/audiences retains then creates in one repo call", { skip }, async () => {
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
          filter: "All cases",
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
              filter: "All cases",
              rows: [
                {
                  section: null,
                  label: "FTA TV",
                  rowIndex: 10,
                  wc: 12,
                  reachPct: 0.12,
                  index: 100,
                  suppressed: false,
                },
              ],
            },
          ],
          skipped: [],
        },
      ],
      warnings: [],
    },
    wave_code: "JAN26A_NAT",
    filter_label: "All cases",
  }))
  mapRoyMorganToChannelsMock.mock.mockImplementation(() => ({
    mapped: [
      {
        channelId: "tv_fta",
        sourceLabel: "FTA TV",
        sourceRowIndex: 10,
        reachPct: 0.12,
        index: 100,
        wc: 12,
        provenance: "matched",
        inheritedFrom: null,
      },
    ],
    unmatchedRows: [],
    uncoveredLeafIds: [],
    duplicateChannelIds: [],
    scoreableCount: 1,
  }))
  retainUploadThenCreateAudienceMock.mock.resetCalls()
  createUploadedAudienceMock.mock.resetCalls()
  markUploadSavedMock.mock.resetCalls()
  retainUploadThenCreateAudienceMock.mock.mockImplementation(
    async (input?: Record<string, unknown>) => ({
      id: 9,
      name: String(input?.name ?? ""),
    })
  )
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
  assert.equal(res.status, 201)
  assert.equal(retainUploadThenCreateAudienceMock.mock.calls.length, 1)
  assert.equal(createUploadedAudienceMock.mock.calls.length, 0)
  assert.equal(markUploadSavedMock.mock.calls.length, 0)
  const saved = retainUploadThenCreateAudienceMock.mock.calls[0]!.arguments[0] as unknown as {
    suppressedCells: number
    audienceWc: number
    universeWc: number
    unweightedN: number
  }
  assert.equal(saved.audienceWc, 100)
  assert.equal(saved.unweightedN, 10)
  assert.equal(saved.universeWc, 0)
  assert.equal(typeof saved.suppressedCells, "number")
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
