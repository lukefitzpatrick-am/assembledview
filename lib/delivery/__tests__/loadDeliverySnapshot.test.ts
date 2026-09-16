/**
 * loadDeliverySnapshot — campaign-page plan lines must not re-fetch Xano
 * when a map is provided, and must follow the plans backend otherwise.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { MEDIA_CONTAINER_ENDPOINTS } from "../../api/media-containers.js"
import { classifySocialPacingPlatform } from "../../pacing/social/classifySocialPacingPlatform.js"

const skip = mockModuleSkip()

const axiosGet = mock.fn(async () => ({ data: [] }))

const fetchLineItemsFromPostgresByEndpoint = mock.fn(
  async (_endpoint: string, _mba: string, _version: number) => [],
)

const readPlanMasterByMba = mock.fn(async (_mba: string) => ({ version_number: 28 }))

const getDataBackendFor = mock.fn((_domain: string) => "postgres")

const getCampaignPacingData = mock.fn(
  async (_mba: string, _ids: string[]) => [] as Array<{ lineItemId: string }>,
)

const getSearchPacingData = mock.fn(async () => null)

const queryDailyFacts = mock.fn(async () => [])

if (supportsMockModule()) {
  await mock.module!("axios", {
    defaultExport: {
      create: () => ({ get: axiosGet }),
      isAxiosError: () => false,
    },
    namedExports: {
      isAxiosError: () => false,
    },
  })
  await mock.module!("@/lib/data/backend", {
    namedExports: { getDataBackendFor },
  })
  await mock.module!("@/lib/data/readMediaPlans", {
    namedExports: {
      fetchLineItemsFromPostgresByEndpoint,
      readPlanMasterByMba,
    },
  })
  await mock.module!("@/lib/snowflake/pacing-service", {
    namedExports: { getCampaignPacingData },
  })
  await mock.module!("@/lib/snowflake/search-pacing-service", {
    namedExports: { getSearchPacingData },
  })
  await mock.module!("@/lib/pacing/direct/fetchDirectPacingRows", {
    namedExports: { queryDailyFacts },
  })
  await mock.module!("@/lib/pacing/social/resolveLiveSocialLineItems", {
    namedExports: { classifySocialPacingPlatform },
  })
}

test(
  "lineItemsByChannel provided → no fetch; Snowflake ids come from the map",
  { skip },
  async () => {
    const { loadDeliverySnapshot } = await import("../loadDeliverySnapshot.js")

    axiosGet.mock.resetCalls()
    fetchLineItemsFromPostgresByEndpoint.mock.resetCalls()
    getCampaignPacingData.mock.resetCalls()

    await loadDeliverySnapshot({
      mbaNumber: "BICAU002",
      versionNumber: 28,
      lineItemsByChannel: {
        progDisplay: [{ line_item_id: "bicau002pd1", name: "Display" }],
      },
    })

    assert.equal(axiosGet.mock.calls.length, 0)
    assert.equal(fetchLineItemsFromPostgresByEndpoint.mock.calls.length, 0)
    assert.equal(getCampaignPacingData.mock.calls.length, 1)
    const ids = getCampaignPacingData.mock.calls[0]?.arguments[1] as string[]
    assert.deepEqual(ids, ["bicau002pd1"])
  },
)

test(
  "postgres backend fetches each media-container endpoint at the requested version",
  { skip },
  async () => {
    const { fetchAllPlanLineItemsForDelivery } = await import("../../api/media-containers.js")

    axiosGet.mock.resetCalls()
    fetchLineItemsFromPostgresByEndpoint.mock.resetCalls()
    getDataBackendFor.mock.mockImplementation(() => "postgres")

    await fetchAllPlanLineItemsForDelivery("BICAU002", 28)

    const keys = Object.keys(MEDIA_CONTAINER_ENDPOINTS) as Array<
      keyof typeof MEDIA_CONTAINER_ENDPOINTS
    >
    assert.equal(fetchLineItemsFromPostgresByEndpoint.mock.calls.length, keys.length)
    assert.equal(axiosGet.mock.calls.length, 0)

    const called = new Map<string, number>()
    for (const call of fetchLineItemsFromPostgresByEndpoint.mock.calls) {
      const [endpoint, mba, version] = call.arguments as [string, string, number]
      called.set(endpoint, (called.get(endpoint) ?? 0) + 1)
      assert.equal(mba, "BICAU002")
      assert.equal(version, 28)
    }
    for (const key of keys) {
      const endpoint = MEDIA_CONTAINER_ENDPOINTS[key]
      assert.equal(called.get(endpoint), 1, `expected one fetch for ${endpoint}`)
    }
  },
)
