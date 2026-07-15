import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

process.env.XANO_MEDIA_DETAILS_BASE_URL = "https://xano.test/media-details"

type UnstableCacheCall = {
  keyParts: string[]
  revalidate: number
  tags: string[]
}

const unstableCacheCalls: UnstableCacheCall[] = []
const revalidateTags: string[] = []
const fetchCalls: { url: string; method: string }[] = []

let isMediaDetailsReferenceListPath: typeof import("../mediaDetailsCache.js").isMediaDetailsReferenceListPath
let isMediaDetailsReferenceRelatedPath: typeof import("../mediaDetailsCache.js").isMediaDetailsReferenceRelatedPath
let mediaDetailsQueryCacheKey: typeof import("../mediaDetailsCache.js").mediaDetailsQueryCacheKey
let getCachedMediaDetailsReference: typeof import("../mediaDetailsCache.js").getCachedMediaDetailsReference
let invalidateMediaDetailsCache: typeof import("../mediaDetailsCache.js").invalidateMediaDetailsCache
let MEDIA_DETAILS_TAG: typeof import("../mediaDetailsCache.js").MEDIA_DETAILS_TAG
let MEDIA_DETAILS_REFERENCE_LIST_PATHS: typeof import("../mediaDetailsCache.js").MEDIA_DETAILS_REFERENCE_LIST_PATHS

if (supportsMockModule()) {
  await mock.module!("server-only", {})
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
        return fn
      },
      revalidateTag: (tag: string) => {
        revalidateTags.push(tag)
      },
    },
  })

  // Mock global fetch used by the cache helper.
  mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    fetchCalls.push({ url, method: String(init?.method || "GET") })
    return new Response(JSON.stringify([{ id: 1, name: "Station A" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  })

  ;({
    isMediaDetailsReferenceListPath,
    isMediaDetailsReferenceRelatedPath,
    mediaDetailsQueryCacheKey,
    getCachedMediaDetailsReference,
    invalidateMediaDetailsCache,
    MEDIA_DETAILS_TAG,
    MEDIA_DETAILS_REFERENCE_LIST_PATHS,
  } = await import("../mediaDetailsCache.js"))
}

beforeEach(() => {
  if (!supportsMockModule()) return
  unstableCacheCalls.length = 0
  revalidateTags.length = 0
  fetchCalls.length = 0
})

test("known reference list paths are detected", { skip }, () => {
  assert.ok(isMediaDetailsReferenceListPath("display_site"))
  assert.ok(isMediaDetailsReferenceListPath("radio_stations"))
  assert.ok(isMediaDetailsReferenceListPath("tv_stations"))
  assert.ok(isMediaDetailsReferenceListPath("bvod_site"))
  assert.equal(isMediaDetailsReferenceListPath("POST_tv_stations"), false)
  assert.equal(isMediaDetailsReferenceListPath("unknown"), false)
  assert.ok(MEDIA_DETAILS_REFERENCE_LIST_PATHS.has("magazines_adsizes"))
})

test("POST_* counterparts are reference-related for invalidation", { skip }, () => {
  assert.ok(isMediaDetailsReferenceRelatedPath("audio_site"))
  assert.ok(isMediaDetailsReferenceRelatedPath("POST_tv_stations"))
  assert.ok(isMediaDetailsReferenceRelatedPath("POST_radio_stations"))
  assert.equal(isMediaDetailsReferenceRelatedPath("POST_not_a_list"), false)
})

test("query cache key is order-stable", { skip }, () => {
  const a = new URLSearchParams("b=2&a=1")
  const b = new URLSearchParams("a=1&b=2")
  assert.equal(mediaDetailsQueryCacheKey(a), mediaDetailsQueryCacheKey(b))
  assert.equal(mediaDetailsQueryCacheKey(new URLSearchParams()), "")
})

test("getCachedMediaDetailsReference keys by path and uses media-details tag", { skip }, async () => {
  const result = await getCachedMediaDetailsReference(
    "radio_stations",
    new URLSearchParams()
  )
  assert.equal(result.status, 200)
  assert.ok((result.contentType || "").includes("application/json"))
  assert.deepEqual(result.body, [{ id: 1, name: "Station A" }])
  assert.ok(unstableCacheCalls.some((c) => c.keyParts.includes("radio_stations")))
  assert.ok(unstableCacheCalls.some((c) => c.tags.includes(MEDIA_DETAILS_TAG)))
  assert.ok(unstableCacheCalls.every((c) => c.revalidate === 900))
  assert.ok(fetchCalls.some((c) => c.url.includes("radio_stations")))
})

test("invalidateMediaDetailsCache calls revalidateTag", { skip }, () => {
  invalidateMediaDetailsCache()
  assert.deepEqual(revalidateTags, [MEDIA_DETAILS_TAG])
})
