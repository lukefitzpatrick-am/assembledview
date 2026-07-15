import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

process.env.XANO_PUBLISHERS_BASE_URL = "https://xano.test"
process.env.XANO_API_KEY = "test-key"

type UnstableCacheCall = {
  keyParts: string[]
  revalidate: number
  tags: string[]
}

const unstableCacheCalls: UnstableCacheCall[] = []
const revalidateTags: string[] = []

const mockGet = mock.fn(async (..._args: unknown[]): Promise<{ data: unknown }> => ({ data: [] }))

const fakeAxios = {
  get: mockGet,
  post: mock.fn(async () => ({ data: {} })),
  put: mock.fn(async () => ({ data: {} })),
  patch: mock.fn(async () => ({ data: {} })),
  delete: mock.fn(async () => ({})),
  create: () => fakeAxios,
}

let getCachedPublishersList: typeof import("../publishersCache.js").getCachedPublishersList
let invalidatePublishersCache: typeof import("../publishersCache.js").invalidatePublishersCache
let toLightPublisher: typeof import("../publishersCache.js").toLightPublisher
let PUBLISHERS_TAG: typeof import("../publishersCache.js").PUBLISHERS_TAG

let getCachedPublisherKpis: typeof import("../publisherKpiCache.js").getCachedPublisherKpis
let PUBLISHER_KPI_TAG: typeof import("../publisherKpiCache.js").PUBLISHER_KPI_TAG

let getCachedMediaContainerBestPractice: typeof import("../mediaContainerBestPracticeCache.js").getCachedMediaContainerBestPractice
let invalidateMediaContainerBestPracticeCache: typeof import("../mediaContainerBestPracticeCache.js").invalidateMediaContainerBestPracticeCache
let MEDIA_CONTAINER_BEST_PRACTICE_TAG: typeof import("../mediaContainerBestPracticeCache.js").MEDIA_CONTAINER_BEST_PRACTICE_TAG

let getCachedClientsList: typeof import("../../cache/clientsCache.js").getCachedClientsList
let invalidateClientsCache: typeof import("../../cache/clientsCache.js").invalidateClientsCache
let getCachedClients: typeof import("../../cache/clientsCache.js").getCachedClients
let CLIENTS_TAG: typeof import("../../cache/clientsCache.js").CLIENTS_TAG

if (supportsMockModule()) {
  await mock.module!("server-only", {})
  await mock.module!("axios", {
    defaultExport: fakeAxios,
  })
  await mock.module!("next/cache", {
    namedExports: {
      unstable_cache: (
        fn: () => Promise<unknown>,
        keyParts: string[],
        opts: { revalidate: number; tags: string[] }
      ) => {
        unstableCacheCalls.push({
          keyParts: [...keyParts],
          revalidate: opts.revalidate,
          tags: [...opts.tags],
        })
        // Passthrough: simulates Data Cache miss (always run upstream).
        return fn
      },
      revalidateTag: (tag: string) => {
        revalidateTags.push(tag)
      },
    },
  })
  await mock.module!("@/lib/api/xanoClients", {
    namedExports: {
      getXanoClientsCollectionUrl: () => "https://xano.test/clients",
    },
  })

  ;({
    getCachedPublishersList,
    invalidatePublishersCache,
    toLightPublisher,
    PUBLISHERS_TAG,
  } = await import("../publishersCache.js"))
  ;({ getCachedPublisherKpis, PUBLISHER_KPI_TAG } = await import("../publisherKpiCache.js"))
  ;({
    getCachedMediaContainerBestPractice,
    invalidateMediaContainerBestPracticeCache,
    MEDIA_CONTAINER_BEST_PRACTICE_TAG,
  } = await import("../mediaContainerBestPracticeCache.js"))
  ;({
    getCachedClientsList,
    invalidateClientsCache,
    getCachedClients,
    CLIENTS_TAG,
  } = await import("../../cache/clientsCache.js"))
}

beforeEach(() => {
  if (!supportsMockModule()) return
  unstableCacheCalls.length = 0
  revalidateTags.length = 0
  mockGet.mock.resetCalls()
  mockGet.mock.mockImplementation(async () => ({ data: [] }))
  mock.method(console, "warn", () => {})
})

test("toLightPublisher strips best-practice blobs and keeps flags", { skip }, () => {
  const light = toLightPublisher({
    id: 1,
    publisher_name: "Nine",
    pub_search: true,
    best_practice_search: "huge blob",
    BestPracticeDisplay: "also huge",
    unrelated: "drop me",
  })
  assert.equal(light.id, 1)
  assert.equal(light.publisher_name, "Nine")
  assert.equal(light.pub_search, true)
  assert.equal(light.best_practice_search, undefined)
  assert.equal(light.BestPracticeDisplay, undefined)
  assert.equal(light.unrelated, undefined)
})

test("getCachedPublishersList includes light in cache key and projects light data", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [
      {
        id: 9,
        publisher_name: "Meta",
        pub_social: true,
        best_practice_social: "blob",
      },
    ],
  }))

  const light = await getCachedPublishersList({ light: true })
  assert.equal(light.stale, false)
  assert.equal(light.data[0].best_practice_social, undefined)
  assert.equal(light.data[0].publisher_name, "Meta")
  assert.ok(unstableCacheCalls.some((c) => c.keyParts.includes("light")))
  assert.ok(unstableCacheCalls.every((c) => c.revalidate === 600))
  assert.ok(unstableCacheCalls.every((c) => c.tags.includes(PUBLISHERS_TAG)))

  unstableCacheCalls.length = 0
  const full = await getCachedPublishersList({ light: false })
  assert.equal(full.data[0].best_practice_social, "blob")
  assert.ok(unstableCacheCalls.some((c) => c.keyParts.includes("full")))
})

test("getCachedPublishersList serves LKG with stale:true after upstream failure", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 1, publisher_name: "Warm", pub_tv: true }],
  }))
  await getCachedPublishersList({ light: true })

  mockGet.mock.mockImplementation(async () => {
    throw new Error("upstream down")
  })
  const stale = await getCachedPublishersList({ light: true })
  assert.equal(stale.stale, true)
  assert.equal(stale.data[0].publisher_name, "Warm")
})

test("invalidatePublishersCache calls revalidateTag", { skip }, () => {
  invalidatePublishersCache()
  assert.deepEqual(revalidateTags, [PUBLISHERS_TAG])
})

test("getCachedPublisherKpis uses unstable_cache with 600s revalidate", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 1, publisher: "Google" }],
  }))
  const result = await getCachedPublisherKpis()
  assert.equal(result.stale, false)
  assert.equal(result.data[0].publisher, "Google")
  assert.ok(unstableCacheCalls.some((c) => c.keyParts[0] === "publisher-kpi"))
  assert.ok(unstableCacheCalls.some((c) => c.tags.includes(PUBLISHER_KPI_TAG)))
  assert.ok(unstableCacheCalls.every((c) => c.revalidate === 600))
})

test("mediaContainerBestPractice cache + invalidate tag", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 1, media_container: "search" }],
  }))
  const result = await getCachedMediaContainerBestPractice()
  assert.equal(result.stale, false)
  assert.ok(
    unstableCacheCalls.some((c) => c.keyParts[0] === "media-container-best-practice")
  )
  assert.ok(
    unstableCacheCalls.some((c) => c.tags.includes(MEDIA_CONTAINER_BEST_PRACTICE_TAG))
  )

  invalidateMediaContainerBestPracticeCache()
  assert.ok(revalidateTags.includes(MEDIA_CONTAINER_BEST_PRACTICE_TAG))
})

test("getCachedClientsList bypassCache skips unstable_cache and revalidates tag", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 1, mp_client_name: "Acme Co" }],
  }))

  const bypassed = await getCachedClientsList({ bypassCache: true })
  assert.equal(bypassed.stale, false)
  assert.equal(unstableCacheCalls.length, 0)
  assert.ok(revalidateTags.includes(CLIENTS_TAG))
  assert.ok(getCachedClients()?.some((c) => c.slug === "acme-co"))

  revalidateTags.length = 0
  const cached = await getCachedClientsList()
  assert.equal(cached.stale, false)
  assert.ok(unstableCacheCalls.some((c) => c.keyParts[0] === "clients-list"))
  assert.ok(unstableCacheCalls.every((c) => c.revalidate === 600))
  assert.equal(revalidateTags.length, 0)
})

test("invalidateClientsCache clears sync peek and revalidates tag", { skip }, async () => {
  mockGet.mock.mockImplementation(async () => ({
    data: [{ id: 2, mp_client_name: "Beta" }],
  }))
  await getCachedClientsList()
  assert.ok(getCachedClients())

  invalidateClientsCache()
  assert.equal(getCachedClients(), null)
  assert.ok(revalidateTags.includes(CLIENTS_TAG))
})
