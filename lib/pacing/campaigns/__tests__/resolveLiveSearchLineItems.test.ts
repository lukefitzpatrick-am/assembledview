import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import type { MediaPlanMaster } from "../../../types/mediaPlanMaster.js"

const skip = mockModuleSkip()

const getDataBackendFor = mock.fn((_domain: string) => "postgres")

const fetchLineItemsFromPostgresByEndpoint = mock.fn(
  async (_endpoint: string, _mba: string, _version: number) => [] as Record<string, unknown>[]
)
const readPlanMasters = mock.fn(async () => [] as Record<string, unknown>[])
const readPlanVersions = mock.fn(async () => [] as Record<string, unknown>[])
const readPacingMasters = mock.fn(async () => [] as Record<string, unknown>[])
const readPacingVersions = mock.fn(async () => [] as Record<string, unknown>[])

const fetchAllXanoPages = mock.fn(async () => [] as Record<string, unknown>[])
const xanoUrl = mock.fn(() => "https://xano.test/table")
const parseXanoListPayload = mock.fn((body: unknown) => body)
const xanoAuthHeader = mock.fn(() => ({}))

const LIVE_MASTER: MediaPlanMaster = {
  id: 12,
  mba_number: "BICAU002",
  mp_client_name: "Penfolds",
  mp_campaignname: "Channel Factory",
  version_number: 4,
  campaign_status: "booked",
  campaign_start_date: "2026-01-01",
  campaign_end_date: "2026-12-31",
  mp_campaignbudget: 1000,
}

const VERSION_ROW = { id: 88, version_number: 4, brand: "Penfolds" }

if (supportsMockModule()) {
  await mock.module!("@/lib/data/backend", {
    namedExports: { getDataBackendFor },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      fetchLineItemsFromPostgresByEndpoint,
      readPlanMasters,
      readPlanVersions,
    },
  })
  await mock.module!("@/lib/data/readPacing", {
    namedExports: { readPacingMasters, readPacingVersions },
  })
  await mock.module!("@/lib/api/xanoPagination", {
    namedExports: { fetchAllXanoPages },
  })
  await mock.module!("@/lib/api/xano", {
    namedExports: { xanoUrl, parseXanoListPayload, xanoAuthHeader },
  })
  await mock.module!("@/lib/xano/campaignKpi", {
    namedExports: { fetchCampaignKpisForMbas: async () => [] },
  })
  await mock.module!("@/lib/snowflake/search-campaigns-pacing", {
    namedExports: { getSearchCampaignsPacingData: async () => [] },
  })
}

function resetMocks() {
  getDataBackendFor.mock.resetCalls()
  fetchLineItemsFromPostgresByEndpoint.mock.resetCalls()
  readPlanMasters.mock.resetCalls()
  readPlanVersions.mock.resetCalls()
  readPacingMasters.mock.resetCalls()
  readPacingVersions.mock.resetCalls()
  fetchAllXanoPages.mock.resetCalls()
  fetchLineItemsFromPostgresByEndpoint.mock.mockImplementation(async () => [])
  readPlanMasters.mock.mockImplementation(async () => [])
  readPlanVersions.mock.mockImplementation(async () => [])
  readPacingMasters.mock.mockImplementation(async () => [])
  readPacingVersions.mock.mockImplementation(async () => [])
  fetchAllXanoPages.mock.mockImplementation(async () => [])
}

test(
  "search postgres backend reads media_plan_search at the published version",
  { skip },
  async () => {
    const { resolveLiveSearchLineItemInputs } = await import("../fetchSearchPacingCampaignRows.js")
    resetMocks()
    getDataBackendFor.mock.mockImplementation(() => "postgres")
    readPlanMasters.mock.mockImplementation(async () => [
      LIVE_MASTER as unknown as Record<string, unknown>,
    ])
    readPlanVersions.mock.mockImplementation(async () => [
      { id: VERSION_ROW.id, mba_number: "BICAU002", version_number: 4, brand: "Penfolds" },
    ])
    fetchLineItemsFromPostgresByEndpoint.mock.mockImplementation(async (endpoint: string) =>
      endpoint === "media_plan_search" ? [{ line_item_id: "bicau002se1", id: 9 }] : []
    )

    const rows = await resolveLiveSearchLineItemInputs({
      asOfDate: "2026-09-16",
      allowedClientSlugs: null,
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.searchRow.line_item_id, "bicau002se1")
    assert.equal(fetchAllXanoPages.mock.calls.length, 0)
    const [endpoint, mba, version] = fetchLineItemsFromPostgresByEndpoint.mock.calls[0]!
      .arguments as [string, string, number]
    assert.equal(endpoint, "media_plan_search")
    assert.equal(mba, "BICAU002")
    assert.equal(version, 4)
  }
)

test(
  "search xano backend walks the existing Xano path",
  { skip },
  async () => {
    const { resolveLiveSearchLineItemInputs } = await import("../fetchSearchPacingCampaignRows.js")
    resetMocks()
    getDataBackendFor.mock.mockImplementation(() => "xano")
    readPacingMasters.mock.mockImplementation(async () => [
      LIVE_MASTER as unknown as Record<string, unknown>,
    ])
    readPacingVersions.mock.mockImplementation(async () => [
      { id: VERSION_ROW.id, mba_number: "BICAU002", version_number: 4, brand: "Penfolds" },
    ])
    fetchAllXanoPages.mock.mockImplementation(async () => [
      {
        line_item_id: "bicau002se2",
        mba_number: "BICAU002",
        version_number: 4,
        media_plan_version: 88,
      },
    ])

    const rows = await resolveLiveSearchLineItemInputs({
      asOfDate: "2026-09-16",
      allowedClientSlugs: null,
    })

    assert.ok(rows.length >= 1)
    assert.equal(rows[0]!.searchRow.line_item_id, "bicau002se2")
    assert.equal(fetchLineItemsFromPostgresByEndpoint.mock.calls.length, 0)
    assert.ok(fetchAllXanoPages.mock.calls.length > 0)
  }
)
