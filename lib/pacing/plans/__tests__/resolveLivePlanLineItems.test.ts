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
const readPlanVersionsForMbas = mock.fn(
  async (_mbaNumbers: readonly string[]) => [] as Record<string, unknown>[]
)

const fetchAllMasters = mock.fn(async () => [] as MediaPlanMaster[])
const fetchCurrentVersionRowsForMasters = mock.fn(
  async (_masters: MediaPlanMaster[]) => new Map<string, { id: number; version_number: number; brand: string | null }>()
)

const fetchAllXanoPages = mock.fn(async () => [] as Record<string, unknown>[])
const xanoUrl = mock.fn(() => "https://xano.test/table")

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
      readPlanVersionsForMbas,
    },
  })
  await mock.module!("@/lib/pacing/campaigns/fetchSearchPacingCampaignRows", {
    namedExports: {
      fetchAllMasters,
      fetchCurrentVersionRowsForMasters,
    },
  })
  await mock.module!("@/lib/api/xanoPagination", {
    namedExports: { fetchAllXanoPages },
  })
  await mock.module!("@/lib/api/xano", {
    namedExports: { xanoUrl },
  })
}

function resetMocks() {
  getDataBackendFor.mock.resetCalls()
  fetchLineItemsFromPostgresByEndpoint.mock.resetCalls()
  readPlanMasters.mock.resetCalls()
  readPlanVersionsForMbas.mock.resetCalls()
  fetchAllMasters.mock.resetCalls()
  fetchCurrentVersionRowsForMasters.mock.resetCalls()
  fetchAllXanoPages.mock.resetCalls()
  fetchLineItemsFromPostgresByEndpoint.mock.mockImplementation(async () => [])
  readPlanMasters.mock.mockImplementation(async () => [])
  readPlanVersionsForMbas.mock.mockImplementation(async () => [])
  fetchAllMasters.mock.mockImplementation(async () => [])
  fetchCurrentVersionRowsForMasters.mock.mockImplementation(async () => new Map())
  fetchAllXanoPages.mock.mockImplementation(async () => [])
}

async function withPostgresLines(
  linesByEndpoint: Record<string, Record<string, unknown>[]>
) {
  getDataBackendFor.mock.mockImplementation(() => "postgres")
  readPlanMasters.mock.mockImplementation(async () => [
    LIVE_MASTER as unknown as Record<string, unknown>,
  ])
  readPlanVersionsForMbas.mock.mockImplementation(async () => [
    { id: VERSION_ROW.id, mba_number: "BICAU002", version_number: 4, brand: "Penfolds" },
  ])
  fetchLineItemsFromPostgresByEndpoint.mock.mockImplementation(
    async (endpoint: string) => linesByEndpoint[endpoint] ?? []
  )
}

test(
  "programmatic postgres backend reads each prog table at the published version",
  { skip },
  async () => {
    const { resolveLiveProgrammaticLineItemInputs } = await import(
      "../../programmatic/resolveLiveProgrammaticLineItems.js"
    )
    resetMocks()
    await withPostgresLines({
      media_plan_prog_video: [{ line_item_id: "bicau002pv1", id: 1 }],
    })

    const rows = await resolveLiveProgrammaticLineItemInputs({
      asOfDate: "2026-09-16",
      allowedClientSlugs: null,
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.progRow.line_item_id, "bicau002pv1")
    assert.equal(rows[0]!.channelFamily, "progVideo")
    assert.equal(fetchAllXanoPages.mock.calls.length, 0)
    assert.deepEqual(readPlanVersionsForMbas.mock.calls[0]?.arguments[0], ["BICAU002"])
    const versions = fetchLineItemsFromPostgresByEndpoint.mock.calls.map(
      (call) => (call.arguments as [string, string, number])[2]
    )
    assert.ok(versions.every((v) => v === 4))
    const endpoints = fetchLineItemsFromPostgresByEndpoint.mock.calls.map(
      (call) => (call.arguments as [string, string, number])[0]
    )
    assert.ok(endpoints.includes("media_plan_prog_display"))
    assert.ok(endpoints.includes("media_plan_prog_video"))
    assert.ok(endpoints.includes("media_plan_prog_ooh"))
  }
)

test(
  "social postgres backend reads media_plan_social at the published version",
  { skip },
  async () => {
    const { resolveLiveSocialLineItemInputs } = await import(
      "../../social/resolveLiveSocialLineItems.js"
    )
    resetMocks()
    await withPostgresLines({
      media_plan_social: [{ line_item_id: "bicau002sm1", platform: "Meta", id: 2 }],
    })

    const rows = await resolveLiveSocialLineItemInputs({
      asOfDate: "2026-09-16",
      allowedClientSlugs: null,
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.socialRow.line_item_id, "bicau002sm1")
    assert.equal(fetchLineItemsFromPostgresByEndpoint.mock.calls.length, 1)
    const [endpoint, mba, version] = fetchLineItemsFromPostgresByEndpoint.mock.calls[0]!
      .arguments as [string, string, number]
    assert.equal(endpoint, "media_plan_social")
    assert.equal(mba, "BICAU002")
    assert.equal(version, 4)
    assert.equal(fetchAllXanoPages.mock.calls.length, 0)
  }
)

test(
  "ad-serving postgres backend reads digital tables at the published version",
  { skip },
  async () => {
    const { resolveLiveAdServingLineItemInputs } = await import(
      "../../ad-serving/resolveLiveAdServingLineItems.js"
    )
    resetMocks()
    await withPostgresLines({
      media_plan_digi_display: [{ line_item_id: "bicau002dd1", id: 3 }],
    })

    const rows = await resolveLiveAdServingLineItemInputs({
      asOfDate: "2026-09-16",
      allowedClientSlugs: null,
    })

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.digitalRow.line_item_id, "bicau002dd1")
    assert.equal(rows[0]!.channelFamily, "digitalDisplay")
    const versions = fetchLineItemsFromPostgresByEndpoint.mock.calls.map(
      (call) => (call.arguments as [string, string, number])[2]
    )
    assert.ok(versions.every((v) => v === 4))
    assert.equal(fetchAllXanoPages.mock.calls.length, 0)
  }
)

