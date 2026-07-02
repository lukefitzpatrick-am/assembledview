import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import type { CampaignKPI, CampaignKpiInput } from "../types.js"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

process.env.XANO_CLIENTS_BASE_URL = "https://xano.test"

const mockGet = mock.fn(async (): Promise<{ data: CampaignKPI[] }> => ({ data: [] }))
const mockPost = mock.fn(
  async (): Promise<{ data: CampaignKPI }> => ({ data: {} as CampaignKPI }),
)
const mockPatch = mock.fn(
  async (): Promise<{ data: CampaignKPI }> => ({ data: {} as CampaignKPI }),
)

function fakeAxios() {
  return {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mock.fn(async () => ({})),
  }
}
Object.assign(fakeAxios, { create: () => fakeAxios() })

let syncCampaignKpis: typeof import("../campaignKpi.js").syncCampaignKpis

if (supportsMockModule()) {
  await mock.module!("axios", {
    defaultExport: fakeAxios,
  })
  ;({ syncCampaignKpis } = await import("../campaignKpi.js"))
}

function kpiInput(over: Partial<CampaignKpiInput> = {}): CampaignKpiInput {
  return {
    mp_client_name: "Client",
    mba_number: "MBA1",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "search",
    publisher: "Google",
    bid_strategy: "clicks",
    line_item_id: "LI1",
    ctr: 0.05,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...over,
  }
}

function existingRow(
  id: number,
  lineItemId: string,
  over: Partial<CampaignKPI> = {},
): CampaignKPI {
  return {
    id,
    mp_client_name: "Client",
    mba_number: "MBA1",
    version_number: 1,
    campaign_name: "Camp",
    media_type: "search",
    publisher: "Google",
    bid_strategy: "clicks",
    line_item_id: lineItemId,
    ctr: 0.03,
    cpv: null,
    conversion_rate: null,
    vtr: null,
    frequency: null,
    ...over,
  }
}

let storedExisting: CampaignKPI[] = []
const writeOrder: Array<"GET" | "POST" | "PATCH"> = []

beforeEach(() => {
  if (!supportsMockModule()) return
  storedExisting = []
  writeOrder.length = 0
  mockGet.mock.resetCalls()
  mockPost.mock.resetCalls()
  mockPatch.mock.resetCalls()

  mockGet.mock.mockImplementation(async () => {
    writeOrder.push("GET")
    return { data: [...storedExisting] }
  })

  mockPost.mock.mockImplementation(async (...args: unknown[]) => {
    const body = args[1] as CampaignKpiInput
    writeOrder.push("POST")
    const created: CampaignKPI = {
      id: 9000 + mockPost.mock.calls.length,
      ...body,
    }
    storedExisting.push(created)
    return { data: created }
  })

  mockPatch.mock.mockImplementation(async (...args: unknown[]) => {
    const _url = args[0]
    const body = args[1] as Partial<CampaignKpiInput>
    writeOrder.push("PATCH")
    const idMatch = String(_url).match(/\/(\d+)$/)
    const id = idMatch ? Number(idMatch[1]) : NaN
    const idx = storedExisting.findIndex((r) => r.id === id)
    const patched: CampaignKPI = {
      ...(idx >= 0 ? storedExisting[idx]! : ({} as CampaignKPI)),
      ...body,
      id,
    }
    if (idx >= 0) storedExisting[idx] = patched
    return { data: patched }
  })
})

test("empty input returns empty output without fetches", { skip }, async () => {
  const result = await syncCampaignKpis([])
  assert.deepEqual(result, [])
  assert.equal(mockGet.mock.callCount(), 0)
  assert.equal(mockPost.mock.callCount(), 0)
  assert.equal(mockPatch.mock.callCount(), 0)
})

test("all-new rows POST when lookup is empty", { skip }, async () => {
  const inputs = [kpiInput({ line_item_id: "LI-A" }), kpiInput({ line_item_id: "LI-B" })]
  const result = await syncCampaignKpis(inputs)
  assert.equal(result.length, 2)
  assert.equal(mockGet.mock.callCount(), 1)
  assert.equal(mockPost.mock.callCount(), 2)
  assert.equal(mockPatch.mock.callCount(), 0)
  assert.equal(result[0]?.line_item_id, "LI-A")
  assert.equal(result[1]?.line_item_id, "LI-B")
})

test("all-existing rows PATCH when natural keys match", { skip }, async () => {
  storedExisting = [
    existingRow(10, "LI-A"),
    existingRow(11, "LI-B"),
  ]
  const inputs = [
    kpiInput({ line_item_id: "LI-A", ctr: 0.07 }),
    kpiInput({ line_item_id: "LI-B", ctr: 0.08 }),
  ]
  const result = await syncCampaignKpis(inputs)
  assert.equal(result.length, 2)
  assert.equal(mockGet.mock.callCount(), 1)
  assert.equal(mockPost.mock.callCount(), 0)
  assert.equal(mockPatch.mock.callCount(), 2)
  assert.equal(result[0]?.ctr, 0.07)
  assert.equal(result[1]?.ctr, 0.08)
})

test("mixed batch: existing rows PATCH, new rows POST", { skip }, async () => {
  storedExisting = [existingRow(20, "LI-OLD")]
  const inputs = [
    kpiInput({ line_item_id: "LI-OLD", ctr: 0.09 }),
    kpiInput({ line_item_id: "LI-NEW", ctr: 0.1 }),
  ]
  const result = await syncCampaignKpis(inputs)
  assert.equal(result.length, 2)
  assert.equal(mockPatch.mock.callCount(), 1)
  assert.equal(mockPost.mock.callCount(), 1)
  assert.equal(result[0]?.line_item_id, "LI-OLD")
  assert.equal(result[1]?.line_item_id, "LI-NEW")
})

test("legacy empty line_item_id in Xano is ignored; input POSTs new row", { skip }, async () => {
  storedExisting = [
    existingRow(30, "", {
      publisher: "Google",
      bid_strategy: "clicks",
      ctr: 0.02,
    }),
  ]
  const inputs = [kpiInput({ line_item_id: "LI-SPECIFIC", ctr: 0.11 })]
  const result = await syncCampaignKpis(inputs)
  assert.equal(result.length, 1)
  assert.equal(mockPost.mock.callCount(), 1)
  assert.equal(mockPatch.mock.callCount(), 0)
  assert.equal(result[0]?.line_item_id, "LI-SPECIFIC")
  assert.equal(result[0]?.ctr, 0.11)
  const legacy = storedExisting.find((r) => r.id === 30)
  assert.equal(legacy?.ctr, 0.02)
})

test("empty line_item_id in input is skipped with warning", { skip }, async () => {
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    const inputs = [
      kpiInput({ line_item_id: "" }),
      kpiInput({ line_item_id: "LI-OK" }),
    ]
    const result = await syncCampaignKpis(inputs)
    assert.equal(result.length, 1)
    assert.equal(mockPost.mock.callCount(), 1)
    assert.equal(warnings.length, 1)
    assert.match(String(warnings[0]?.[0]), /empty line_item_id/)
  } finally {
    console.warn = originalWarn
  }
})

test("fetchCampaignKpis runs once per (mba_number, version_number) pair", { skip }, async () => {
  storedExisting = [existingRow(40, "LI-1")]
  const inputs = [
    kpiInput({ line_item_id: "LI-1", ctr: 0.04 }),
    kpiInput({ line_item_id: "LI-2", ctr: 0.05 }),
  ]
  await syncCampaignKpis(inputs)
  assert.equal(mockGet.mock.callCount(), 1)
})

test("sequential ordering follows input order", { skip }, async () => {
  storedExisting = [
    existingRow(50, "LI-1"),
    existingRow(51, "LI-2"),
  ]
  const inputs = [
    kpiInput({ line_item_id: "LI-1" }),
    kpiInput({ line_item_id: "LI-NEW" }),
    kpiInput({ line_item_id: "LI-2" }),
  ]
  await syncCampaignKpis(inputs)
  const ops = writeOrder.filter((o) => o !== "GET")
  assert.deepEqual(ops, ["PATCH", "POST", "PATCH"])
})
