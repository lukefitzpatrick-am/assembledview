import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import { mockModuleSkip, supportsMockModule } from "../test/mockModuleHarness.js"

const skip = mockModuleSkip()

const fetchCalls: string[] = []
const coalescedUrls: string[] = []
const invalidatedUrls: string[] = []

let EDITOR_MEDIA_DETAILS_PREFETCH_PATHS: typeof import("../api.js").EDITOR_MEDIA_DETAILS_PREFETCH_PATHS
let prefetchEditorMediaDetailsLists: typeof import("../api.js").prefetchEditorMediaDetailsLists
let getTVStations: typeof import("../api.js").getTVStations
let createTVStation: typeof import("../api.js").createTVStation
let getBVODSites: typeof import("../api.js").getBVODSites

if (supportsMockModule()) {
  // Force browser path so coalescedGetJson is used.
  Object.defineProperty(globalThis, "window", {
    value: {},
    configurable: true,
  })

  await mock.module!("@/lib/api/xano", {
    namedExports: {
      getXanoBaseUrl: () => "https://xano.test",
    },
  })
  await mock.module!("@/lib/api/coalescedGetJson", {
    namedExports: {
      coalescedGetJson: async (url: string) => {
        coalescedUrls.push(url)
        return [{ id: 1 }]
      },
      invalidateCoalescedGetJson: (url: string) => {
        invalidatedUrls.push(url)
      },
    },
  })
  await mock.module!("@/lib/api/xanoPagination", {
    namedExports: {
      fetchAllXanoPages: async () => [],
    },
  })

  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push(`${init?.method || "GET"} ${String(input)}`)
    return new Response(JSON.stringify({ id: 99, station: "X", network: "Y" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })

  ;({
    EDITOR_MEDIA_DETAILS_PREFETCH_PATHS,
    prefetchEditorMediaDetailsLists,
    getTVStations,
    createTVStation,
    getBVODSites,
  } = await import("../api.js"))
}

beforeEach(() => {
  if (!supportsMockModule()) return
  fetchCalls.length = 0
  coalescedUrls.length = 0
  invalidatedUrls.length = 0
})

test("prefetch paths cover stations, sites, newspapers, magazines, adsizes", { skip }, () => {
  assert.ok(EDITOR_MEDIA_DETAILS_PREFETCH_PATHS.includes("tv_stations"))
  assert.ok(EDITOR_MEDIA_DETAILS_PREFETCH_PATHS.includes("display_site"))
  assert.ok(EDITOR_MEDIA_DETAILS_PREFETCH_PATHS.includes("bvod_site"))
  assert.ok(EDITOR_MEDIA_DETAILS_PREFETCH_PATHS.includes("newspaper_adsizes"))
  assert.equal(EDITOR_MEDIA_DETAILS_PREFETCH_PATHS.length, 10)
})

test("prefetchEditorMediaDetailsLists kicks coalesced GETs for every path", { skip }, async () => {
  prefetchEditorMediaDetailsLists()
  // Allow microtasks from void promise starts.
  await new Promise((r) => setTimeout(r, 20))
  for (const path of EDITOR_MEDIA_DETAILS_PREFETCH_PATHS) {
    assert.ok(
      coalescedUrls.some((u) => u.endsWith(`/api/media-details/${path}`)),
      `missing prefetch for ${path}: ${JSON.stringify(coalescedUrls)}`
    )
  }
})

test("getTVStations / getBVODSites use coalesced client cache path", { skip }, async () => {
  await getTVStations()
  await getBVODSites()
  assert.ok(coalescedUrls.some((u) => u.endsWith("/api/media-details/tv_stations")))
  assert.ok(coalescedUrls.some((u) => u.endsWith("/api/media-details/bvod_site")))
})

test("createTVStation invalidates the tv_stations coalesced entry", { skip }, async () => {
  await createTVStation({ station: "A", network: "B" })
  assert.ok(fetchCalls.some((c) => c.startsWith("POST ") && c.includes("POST_tv_stations")))
  assert.ok(invalidatedUrls.some((u) => u.endsWith("/api/media-details/tv_stations")))
})
